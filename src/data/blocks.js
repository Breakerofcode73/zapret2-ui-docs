export const BLOCK_CATS = ["Данные", "Фильтры", "Опции отправки", "Приёмы", "Отправка", "Вердикт"];

export const BLOCKS = [
  { id: "src_payload", cat: "Данные", title: "payload / reasm", desc: "Берёт собранный reasm, иначе текущий payload.",
    provides: ["data"], params: [], code: 'local data = desync.reasm_data or desync.dis.payload\nif not data or #data == 0 then return VERDICT_PASS end' },
  { id: "src_blob", cat: "Данные", title: "Данные из блоба", desc: "blob=<имя>, c optional-защитой.",
    provides: ["data"], params: [{ k: "blob", label: "блоб", def: "fake_default_tls" }, { k: "optional", label: "optional", def: "1", type: "flag" }],
    code: 'local data\nif desync.arg.optional and not blob_exist(desync, "{{blob}}") then return VERDICT_PASS end\ndata = blob_or_def(desync, "{{blob}}") or desync.reasm_data or desync.dis.payload\nif not data or #data == 0 then return VERDICT_PASS end' },
  { id: "clone_dis", cat: "Данные", title: "Клон dissect", desc: "Копия пакета для правок, оригинал не трогается.",
    provides: ["dis"], params: [], code: 'local dis = deepcopy(desync.dis)' },

  { id: "flt_l7", cat: "Фильтры", title: "Только протокол", desc: "Отсев по desync.l7payload.",
    params: [{ k: "l7", label: "l7payload", def: "tls_client_hello" }],
    code: 'if desync.l7payload ~= "{{l7}}" then return VERDICT_PASS end' },
  { id: "flt_dir", cat: "Фильтры", title: "Направление + payload", desc: "Штатные dir/payload фильтры.",
    params: [], code: 'direction_cutoff_opposite(ctx, desync)\nif not direction_check(desync) then return VERDICT_PASS end\nif desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end' },
  { id: "flt_replay", cat: "Фильтры", title: "Не на replay-кусках", desc: "Действовать только на первом проходе.",
    params: [], code: 'if not replay_first(desync) then\n    if replay_drop(desync) then return VERDICT_DROP end\n    return VERDICT_PASS\nend' },
  { id: "flt_once", cat: "Фильтры", title: "Один раз на соединение", desc: "Счётчик в track.lua_state + cutoff.",
    params: [{ k: "max", label: "лимит", def: "1" }],
    code: 'local st = desync.track and desync.track.lua_state\nif st then\n    local k = "blk_{{uid}}"\n    local n = st[k] or 0\n    if n >= {{max}} then instance_cutoff_shim(ctx, desync); return VERDICT_PASS end\n    st[k] = n + 1\nend' },

  { id: "opts_base", cat: "Опции отправки", title: "opts = desync_opts", desc: "Базовые опции отправки/реконструкции.",
    provides: ["opts"], params: [], code: 'local opts = desync_opts(desync)' },
  { id: "opts_badsum", cat: "Опции отправки", title: "Битая сумма", desc: "reconstruct.badsum = true.",
    needs: ["opts"], params: [], code: 'opts.reconstruct.badsum = true' },
  { id: "opts_ttl", cat: "Опции отправки", title: "TTL фейка", desc: "Фиксированный TTL через reconstruct.",
    needs: ["opts"], params: [{ k: "ttl", label: "ip_ttl", def: "8" }], code: 'opts.reconstruct.ip_ttl = {{ttl}}' },
  { id: "opts_repeats", cat: "Опции отправки", title: "Повторы", desc: "rawsend.repeats.",
    needs: ["opts"], params: [{ k: "n", label: "repeats", def: "2" }], code: 'opts.rawsend.repeats = {{n}}' },
  { id: "opts_orig", cat: "Опции отправки", title: "opts_orig (без fooling)", desc: "Для реальных сегментов: fooling не применяется.",
    provides: ["opts_orig"], params: [],
    code: 'local opts_orig = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {},\n                     ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }' },
  { id: "opts_fake", cat: "Опции отправки", title: "opts_fake (с fooling)", desc: "Для фейков: весь fooling из аргументов.",
    provides: ["opts_fake"], params: [],
    code: 'local opts_fake = { rawsend = rawsend_opts(desync), reconstruct = reconstruct_opts(desync),\n                    ipfrag = {}, ipid = desync.arg, fooling = desync.arg }' },

  { id: "call_fake_ip", cat: "Приёмы", title: "fake_ip_misdirection", desc: "Твоя функция: фейк с подменой dst/TTL. Аргументы подставляются на время вызова.",
    calls: "fake_ip_misdirection", params: [
      { k: "ip_dst", label: "ip_dst", def: "192.0.2.1" }, { k: "ip_ttl", label: "ip_ttl", def: "8" },
      { k: "tcp_ts", label: "tcp_ts", def: "-600000" }, { k: "repeats", label: "repeats", def: "1" },
      { k: "maxfake", label: "maxfake", def: "1" }, { k: "tls_mod", label: "tls_mod", def: "" }],
    code: 'apply_call(fake_ip_misdirection, { ip_dst = "{{ip_dst}}", ip_ttl = "{{ip_ttl}}", tcp_ts = "{{tcp_ts}}", repeats = "{{repeats}}", maxfake = "{{maxfake}}", tls_mod = "{{tls_mod}}" })' },
  { id: "call_random_split", cat: "Приёмы", title: "outline_random_split", desc: "Твоя функция: случайный разрез внутри SNI/Host.",
    calls: "outline_random_split", params: [
      { k: "mode", label: "mode", def: "host" }, { k: "pos", label: "pos", def: "midsld" },
      { k: "parts", label: "parts", def: "2" }, { k: "seqovl", label: "seqovl", def: "0" },
      { k: "disorder", label: "disorder", def: "", type: "flag" }, { k: "fake", label: "fake", def: "", type: "flag" },
      { k: "ip_ttl", label: "ip_ttl", def: "8" }, { k: "badsum", label: "badsum", def: "1", type: "flag" },
      { k: "cutoff", label: "cutoff", def: "", type: "flag" }],
    code: 'apply_call(outline_random_split, { mode = "{{mode}}", pos = "{{pos}}", parts = "{{parts}}", seqovl = "{{seqovl}}", disorder = {{flag:disorder}}, fake = {{flag:fake}}, ip_ttl = "{{ip_ttl}}", badsum = {{flag:badsum}}, cutoff = {{flag:cutoff}} })' },
  { id: "call_std", cat: "Приёмы", title: "Штатная функция antidpi", desc: "Любая: fake, multisplit, fakedsplit, hostfakesplit, udplen…",
    calls: "*", params: [{ k: "fn", label: "функция", def: "multisplit" }, { k: "args", label: "аргументы k=v,k=v", def: "pos=1,midsld" }],
    code: 'apply_call({{fn}}, { {{kv:args}} })' },
  { id: "mod_ttl", cat: "Приёмы", title: "Правка TTL у клона", desc: "Прямая запись в dis.ip.ip_ttl.",
    needs: ["dis"], params: [{ k: "ttl", label: "ttl", def: "8" }],
    code: 'if dis.ip then dis.ip.ip_ttl = {{ttl}} elseif dis.ip6 then dis.ip6.ip6_hlim = {{ttl}} end' },
  { id: "mod_seq", cat: "Приёмы", title: "Сдвиг TCP seq", desc: "th_seq -= N у клона.",
    needs: ["dis"], params: [{ k: "n", label: "сдвиг", def: "1" }],
    code: 'if dis.tcp then dis.tcp.th_seq = dis.tcp.th_seq - {{n}} end' },
  { id: "log", cat: "Приёмы", title: "DLOG", desc: "Отладочная строка.",
    params: [{ k: "msg", label: "текст", def: "step" }], code: 'if b_debug then DLOG("{{name}}: {{msg}}") end' },

  { id: "send_dis", cat: "Отправка", title: "rawsend_dissect", desc: "Отправить клон пакета.",
    needs: ["dis", "opts"], params: [], code: 'rawsend_dissect(dis, opts.rawsend, opts.reconstruct)' },
  { id: "send_ipfrag", cat: "Отправка", title: "rawsend_dissect_ipfrag", desc: "Отправить клон с IP-фрагментацией.",
    needs: ["dis", "opts"], params: [], code: 'rawsend_dissect_ipfrag(dis, opts)' },
  { id: "send_seg", cat: "Отправка", title: "Сегмент payload", desc: "Отправить часть данных со смещением.",
    needs: ["data"], params: [{ k: "from", label: "с байта", def: "1" }, { k: "to", label: "по байт (0=до конца)", def: "0" }, { k: "off", label: "смещение", def: "0" }],
    code: 'local p = string.sub(data, {{from}}, {{to}} > 0 and {{to}} or #data)\nif not rawsend_payload_segmented(desync, p, {{off}}) then return VERDICT_PASS end' },
  { id: "cutoff", cat: "Отправка", title: "Отключить инстанс", desc: "instance_cutoff_shim — дальше по потоку не вызывать.",
    params: [], code: 'instance_cutoff_shim(ctx, desync)' },
  { id: "dropset", cat: "Отправка", title: "Дропать replay", desc: "replay_drop_set после своей отправки.",
    params: [], code: 'replay_drop_set(desync)' },

  { id: "v_pass", cat: "Вердикт", title: "VERDICT_PASS", desc: "Оригинал идёт дальше по цепочке.", params: [], code: 'return VERDICT_PASS' },
  { id: "v_modify", cat: "Вердикт", title: "VERDICT_MODIFY", desc: "Отправить изменённый оригинал.", params: [], code: 'return VERDICT_MODIFY' },
  { id: "v_drop", cat: "Вердикт", title: "VERDICT_DROP", desc: "Оригинал не отправлять.", params: [], code: 'return VERDICT_DROP' }
];

export const PRESETS = [
  { id: "fake_then_split", title: "Фейк → случайный сплит", blocks: [
    { id: "flt_dir", p: {} }, { id: "flt_replay", p: {} },
    { id: "call_fake_ip", p: { ip_dst: "192.0.2.1", ip_ttl: "8", tcp_ts: "-600000", repeats: "1", maxfake: "1" } },
    { id: "call_random_split", p: { mode: "host", parts: "2", seqovl: "0", ip_ttl: "8", badsum: "1" } }] },
  { id: "split_max", title: "Сплит на максимум", blocks: [
    { id: "flt_dir", p: {} }, { id: "flt_replay", p: {} },
    { id: "call_random_split", p: { mode: "host", parts: "4", seqovl: "2", disorder: "1", fake: "1", ip_ttl: "8", badsum: "1", cutoff: "1" } }] },
  { id: "fake_ip_max", title: "Фейк IP на максимум", blocks: [
    { id: "flt_dir", p: {} }, { id: "flt_replay", p: {} },
    { id: "call_fake_ip", p: { ip_dst: "192.0.2.1", ip_ttl: "8", tcp_ts: "-600000", repeats: "2", maxfake: "1", tls_mod: "rndsni" } }] },
  { id: "manual_split", title: "Ручной сплит из блоков", blocks: [
    { id: "flt_dir", p: {} }, { id: "flt_replay", p: {} }, { id: "src_payload", p: {} },
    { id: "opts_orig", p: {} }, { id: "send_seg", p: { from: "1", to: "1", off: "0" } },
    { id: "send_seg", p: { from: "2", to: "0", off: "1" } }, { id: "dropset", p: {} }, { id: "v_drop", p: {} }] },
  { id: "scratch", title: "С нуля", blocks: [] }
];