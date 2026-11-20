-- fake_ip_misdirection.max.lua
-- Развитие fake_ip_misdirection.lua: подмена dst/src/портов, autottl, IPv6, tls_mod,
-- ipfrag, лимит фейков на соединение, безопасное применение fooling.
-- Требует: zapret-lib.lua (+ zapret-antidpi.lua не обязателен)
--
-- Аргументы (--lua-desync=fake_ip_misdirection:...):
--   ip_dst=192.0.2.1        подмена IPv4 dst (TEST-NET-1)
--   noip_dst                не менять dst (только TTL/badsum)
--   ip_src=A.B.C.D          подмена IPv4 src
--   ip6_dst=<32 hex>        подмена IPv6 dst
--   ip_ttl=N                TTL фейка (default 8)
--   ip_autottl=d,min-max    авто-TTL вместо фиксированного (приоритет)
--   ip6_ttl=N               hop limit для IPv6
--   tcp_dport=N tcp_sport=N подмена портов
--   tcp_ts=N tcp_seq=N tcp_ack=N tcp_md5[=hex] tcp_ts_up tcp_nop_del
--   ip_id=seq|rnd|zero|none (default rnd)
--   nobadsum                не портить контрольную сумму
--   repeats=N               повторы фейка
--   ipfrag                  отправлять фрагментами
--   tls_mod=rnd,rndsni,sni=<str>,dupsid,padencap
--   blob=<blob> optional    свой payload фейка
--   maxfake=N               сколько фейков на соединение (default 1, 0 = без лимита)
--   udp                     работать и по UDP
--   dir=in|out|any payload=<list>

local function fim_arg(desync, k, def)
    local v = desync.arg[k]
    if v == nil or v == "" then return def end
    return v
end

local function fim_num(desync, k, def)
    local v = tonumber(desync.arg[k])
    if v == nil then return def end
    return v
end

local function fim_ipv4(s)
    if type(s) ~= "string" then return nil end
    local a, b, c, d = s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then return nil end
    a, b, c, d = tonumber(a), tonumber(b), tonumber(c), tonumber(d)
    if a > 255 or b > 255 or c > 255 or d > 255 then return nil end
    return bu8(a) .. bu8(b) .. bu8(c) .. bu8(d)
end

local function fim_hex16(s)
    if type(s) ~= "string" then return nil end
    local t = s:gsub("[%s:]", "")
    if #t ~= 32 or not t:match("^%x+$") then return nil end
    local ok, bin = pcall(parse_hex, t)
    if ok and bin and #bin == 16 then return bin end
    return nil
end

function fake_ip_misdirection(ctx, desync)
    local is_tcp = desync.dis.tcp and true or false
    local is_udp = desync.dis.udp and desync.arg.udp and true or false
    if not is_tcp and not is_udp then return VERDICT_PASS end

    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return VERDICT_PASS end
    if desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end

    local payload = desync.dis.payload or ""
    if desync.reasm_data and #desync.reasm_data > 0 then payload = desync.reasm_data end
    if desync.arg.blob then
        if desync.arg.optional and not blob_exist(desync, desync.arg.blob) then
            DLOG("fake_ip: blob absent, skip")
            return VERDICT_PASS
        end
        payload = blob(desync, desync.arg.blob)
    end
    if #payload == 0 then return VERDICT_PASS end
    if not replay_first(desync) then return VERDICT_PASS end

    local maxfake = fim_num(desync, "maxfake", 1)
    local st = desync.track and desync.track.lua_state
    local key = "fim_" .. tostring(desync.func_instance or 0)
    if st then
        local n = st[key] or 0
        if maxfake > 0 and n >= maxfake then
            instance_cutoff_shim(ctx, desync)
            return VERDICT_PASS
        end
        st[key] = n + 1
    end

    local fake = deepcopy(desync.dis)
    fake.payload = payload

    if fake.ip then
        if not desync.arg.noip_dst then
            local dst = fim_ipv4(fim_arg(desync, "ip_dst", "192.0.2.1"))
            if dst then fake.ip.ip_dst = dst
            else DLOG("fake_ip: bad ip_dst, keeping original") end
        end
        local src = fim_ipv4(desync.arg.ip_src)
        if src then fake.ip.ip_src = src end
    elseif fake.ip6 then
        local d6 = fim_hex16(desync.arg.ip6_dst)
        if d6 then fake.ip6.ip6_dst = d6 end
    end

    if fake.tcp then
        local dp = fim_num(desync, "tcp_dport", nil)
        if dp then fake.tcp.th_dport = dp end
        local sp = fim_num(desync, "tcp_sport", nil)
        if sp then fake.tcp.th_sport = sp end
    end

    local over = {}
    local autottl = desync.arg.ip_autottl or desync.arg.ip6_autottl
    if autottl then
        over.ip_autottl = desync.arg.ip_autottl
        over.ip6_autottl = desync.arg.ip6_autottl
    else
        over.ip_ttl = fim_num(desync, "ip_ttl", 8)
        if desync.arg.ip6_ttl then over.ip6_ttl = fim_num(desync, "ip6_ttl", 8) end
    end
    for _, k in ipairs({ "tcp_ts", "tcp_seq", "tcp_ack", "tcp_md5", "tcp_flags_set",
                         "tcp_flags_unset", "tcp_ts_up", "tcp_nop_del",
                         "ip6_hopbyhop", "ip6_destopt", "ip6_routing", "ip6_ah" }) do
        if desync.arg[k] ~= nil then over[k] = desync.arg[k] end
    end

    -- apply_fooling читает desync.arg: подменяем на время вызова и возвращаем назад
    local saved = {}
    for k, v in pairs(over) do saved[k] = desync.arg[k]; desync.arg[k] = v end
    local okf, err = pcall(apply_fooling, desync, fake)
    local oki, err2 = pcall(apply_ip_id, desync, fake, nil, fim_arg(desync, "ip_id", "rnd"))
    for k in pairs(over) do desync.arg[k] = saved[k] end
    if not okf then DLOG("fake_ip: apply_fooling failed: " .. tostring(err)) end
    if not oki then DLOG("fake_ip: apply_ip_id failed: " .. tostring(err2)) end

    if desync.arg.tls_mod and desync.l7payload == "tls_client_hello" then
        local pl = tls_mod_shim(desync, fake.payload, desync.arg.tls_mod, desync.reasm_data)
        if pl then fake.payload = pl end
    end

    local opts = desync_opts(desync)
    opts.reconstruct.badsum = not desync.arg.nobadsum
    local rep = fim_num(desync, "repeats", 1)
    if rep > 1 then opts.rawsend.repeats = rep end

    DLOG("fake_ip: dst=" .. tostring(desync.arg.ip_dst or "orig")
         .. " ttl=" .. tostring(over.ip_ttl or autottl)
         .. " len=" .. #fake.payload)

    if desync.arg.ipfrag then
        rawsend_dissect_ipfrag(fake, opts)
    else
        rawsend_dissect(fake, opts.rawsend, opts.reconstruct)
    end
    return VERDICT_PASS
end