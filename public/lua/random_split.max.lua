-- random_split.max.lua
-- Развитие random_split.lua: случайный разрез внутри SNI/Host, multi-part, disorder,
-- seqovl, опциональные фейки, корректная защита неполного ClientHello.
-- Требует: zapret-lib.lua + zapret-antidpi.lua
--
-- Аргументы (--lua-desync=outline_random_split:...):
--   mode=host|random|mid|pos      способ выбора позиций (default host)
--   pos=<маркеры>                 для mode=pos (default midsld)
--   parts=N                       число сегментов 2..8 (default 2)
--   rmin=0.25 rmax=0.75           границы случайного диапазона
--   seqovl=N                      перекрытие seq у второго сегмента
--   seqovl_pattern=<blob>         заполнять перекрытие паттерном (иначе — реальные байты)
--   disorder                      обратный порядок сегментов
--   fake / fake2                  фейк до / после каждого реального сегмента
--   pattern=<blob>               填充 фейков (default 0x00)
--   ip_ttl=N | ip_autottl=d,min-max | badsum | repeats=N   — ТОЛЬКО для фейков
--   blob=<blob> optional          источник данных
--   minlen=N                      минимум длины (default 20)
--   nohello_check                 отключить защиту неполного ClientHello
--   hello_split=N                 первый сегмент при неполном hello (default 1)
--   nodrop                        не дропать оригинал
--   cutoff                        отключить инстанс после успеха (только без reasm)
--   dir=in|out|any  payload=<list>

local RS_SEEDED = false

local function rs_seed()
    if RS_SEEDED then return end
    RS_SEEDED = true
    local s = os.time()
    local ok, t = pcall(clock_gettime)
    if ok and tonumber(t) then s = s + math.floor(tonumber(t) * 1000) end
    local okp, pid = pcall(getpid)
    if okp and tonumber(pid) then s = s + tonumber(pid) * 7919 end
    math.randomseed(s % 2147483647)
    math.random(); math.random(); math.random()
end

local function rs_num(desync, key, def)
    local v = desync.arg[key]
    if v == nil or v == "" then return def end
    return tonumber(v) or def
end

local function rs_hello_complete(data)
    if #data < 6 then return false end
    local b1, b2 = string.byte(data, 1, 2)
    if b1 ~= 0x16 or b2 ~= 0x03 then return false end
    local rlen = string.byte(data, 4) * 256 + string.byte(data, 5)
    if rlen < 1 then return false end
    return #data >= 5 + rlen
end

local function rs_cuts(desync, data, mode, parts, rmin, rmax)
    local len = #data
    local cuts = {}
    local function push(c)
        c = math.floor(c or 0)
        if c < 1 then c = 1 end
        if c > len - 1 then c = len - 1 end
        for _, x in ipairs(cuts) do if x == c then return end end
        cuts[#cuts + 1] = c
    end
    local lo, hi
    if mode == "pos" then
        local ok, pos = pcall(resolve_multi_pos, data, desync.l7payload, desync.arg.pos or "midsld")
        if ok and pos then
            for i = 1, #pos do
                local p = tonumber(pos[i])
                if p and p > 1 then push(p - 1) end
            end
        end
    elseif mode == "mid" then
        push(len / 2)
    elseif mode == "random" then
        lo = math.max(1, math.floor(len * rmin))
        hi = math.min(len - 1, math.floor(len * rmax))
        if hi < lo then hi = lo end
        for _ = 1, parts - 1 do push(math.random(lo, hi)) end
    else
        local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
        if ok and r and r[1] and r[2] and r[1] >= 1 and r[2] >= r[1] and r[2] <= len then
            lo, hi = r[1], math.max(r[1], r[2] - 1)
            DLOG("random_split: host " .. r[1] .. "-" .. r[2])
        else
            lo = math.max(1, math.floor(len * rmin))
            hi = math.min(len - 1, math.floor(len * rmax))
            if hi < lo then hi = lo end
            DLOG("random_split: host not found, range " .. lo .. "-" .. hi)
        end
        for _ = 1, parts - 1 do push(math.random(lo, hi)) end
    end
    table.sort(cuts)
    return cuts
end

function outline_random_split(ctx, desync)
    if not desync.dis.tcp then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return VERDICT_PASS
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return VERDICT_PASS end
    if desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end

    local data
    if desync.arg.blob then
        if desync.arg.optional and not blob_exist(desync, desync.arg.blob) then
            DLOG("random_split: blob absent, skip")
            return VERDICT_PASS
        end
        data = blob_or_def(desync, desync.arg.blob)
    end
    if not data or #data == 0 then data = desync.reasm_data end
    if not data or #data == 0 then data = desync.dis.payload end
    if not data or #data == 0 then return VERDICT_PASS end

    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return VERDICT_PASS
    end

    if not desync.arg.noseed then rs_seed() end

    local len = #data
    local nodrop = desync.arg.nodrop and true or false
    local function done()
        replay_drop_set(desync)
        if desync.arg.cutoff and not desync.reasm_data then instance_cutoff_shim(ctx, desync) end
        return nodrop and VERDICT_PASS or VERDICT_DROP
    end

    local is_tls = (desync.l7payload == "tls_client_hello")
    if is_tls and not desync.arg.nohello_check and not rs_hello_complete(data) then
        local n = math.floor(rs_num(desync, "hello_split", 1))
        if n < 1 then n = 1 end
        if n >= len then return VERDICT_PASS end
        DLOG("random_split: incomplete ClientHello len=" .. len .. ", split=" .. n)
        local o = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {},
                    ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }
        if not rawsend_payload_segmented(desync, string.sub(data, 1, n), 0, o) then return VERDICT_PASS end
        if not rawsend_payload_segmented(desync, string.sub(data, n + 1), n, o) then return VERDICT_PASS end
        return done()
    end

    if len < math.floor(rs_num(desync, "minlen", 20)) then return VERDICT_PASS end

    local parts = math.floor(rs_num(desync, "parts", 2))
    if parts < 2 then parts = 2 end
    if parts > 8 then parts = 8 end
    local cuts = rs_cuts(desync, data, desync.arg.mode or "host", parts,
                         rs_num(desync, "rmin", 0.25), rs_num(desync, "rmax", 0.75))
    if #cuts == 0 then
        local c = math.floor(len / 2)
        if c < 1 or c >= len then return VERDICT_PASS end
        cuts = { c }
    end

    local seqovl = math.floor(rs_num(desync, "seqovl", 0))
    local pat = "\x00"
    if desync.arg.seqovl_pattern then
        if desync.arg.optional and not blob_exist(desync, desync.arg.seqovl_pattern) then
            DLOG("random_split: seqovl_pattern absent, zero fill")
        else
            pat = blob(desync, desync.arg.seqovl_pattern)
        end
    end

    local opts_orig = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {},
                        ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }
    local opts_fake = { rawsend = rawsend_opts(desync), reconstruct = reconstruct_opts(desync),
                        ipfrag = {}, ipid = desync.arg, fooling = desync.arg }

    local segs = {}
    local start = 1
    for i = 1, #cuts + 1 do
        local stop = cuts[i] or len
        local part = string.sub(data, start, stop)
        local off = start - 1
        if i == 2 and seqovl > 0 and off >= seqovl then
            local ovl
            if desync.arg.seqovl_pattern then
                ovl = pattern(pat, 1, seqovl)
            else
                ovl = string.sub(data, off - seqovl + 1, off)
            end
            part = ovl .. part
            off = off - seqovl
        end
        segs[#segs + 1] = { part = part, off = off, s = start, e = stop }
        start = stop + 1
    end

    local fakepat = "\x00"
    if desync.arg.pattern then fakepat = blob(desync, desync.arg.pattern) end
    local function send_fake(seg)
        local f = pattern(fakepat, 1, seg.e - seg.s + 1)
        return rawsend_payload_segmented(desync, f, seg.s - 1, opts_fake)
    end

    local order = {}
    for i = 1, #segs do order[i] = i end
    if desync.arg.disorder then
        for i = 1, math.floor(#order / 2) do
            local j = #order - i + 1
            order[i], order[j] = order[j], order[i]
        end
    end

    for _, idx in ipairs(order) do
        local seg = segs[idx]
        if desync.arg.fake and not send_fake(seg) then return VERDICT_PASS end
        if b_debug then DLOG("random_split: real off=" .. seg.off .. " len=" .. #seg.part) end
        if not rawsend_payload_segmented(desync, seg.part, seg.off, opts_orig) then return VERDICT_PASS end
        if desync.arg.fake2 and not send_fake(seg) then return VERDICT_PASS end
    end
    return done()
end