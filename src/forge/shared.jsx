import { useMemo, useState } from "react";

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const CAT = {
  "Транспорт": "#4dd6ff", "Fooling": "#ff7a18", "Сегментация": "#ffc23d", "Replay": "#a78bfa",
  "Аргументы": "#9ef01a", "Рандом": "#f0abfc", "Лимиты": "#2dd4bf", "Синтаксис": "#ff5470"
};
export const SEV_W = { crit: 18, warn: 8, info: 3 };
export const SEV_RU = { crit: "критично", warn: "warning", info: "замечание" };

/* ── подсветка ── */
const KW = new Set("function local end if then else elseif for while do return repeat until break and or not nil true false in".split(" "));
const KNOWN = new Set(("print pairs ipairs type tostring tonumber pcall xpcall error assert select next setmetatable getmetatable rawget rawset require " +
  "string table math os io unpack load loadstring dofile collectgarbage deepcopy desync_opts rawsend_opts rawsend_opts_base reconstruct_opts ipfrag_opts " +
  "apply_fooling apply_ip_id rawsend_dissect rawsend_dissect_ipfrag rawsend_payload_segmented rawsend_dissect_segmented direction_check direction_cutoff_opposite " +
  "payload_check replay_first replay_drop replay_drop_set instance_cutoff_shim cutoff_shim_check lua_cutoff instance_cutoff execution_plan timer_set timer_del " +
  "resolve_pos resolve_multi_pos resolve_range zero_based_pos delete_pos_1 pos_normalize pos_get blob blob_or_def blob_exist hex pattern parse_hex bu8 bu16 bu32 " +
  "u32add bitand bitor bitnot bxor DLOG hexdump_dlog tls_mod_shim tls_client_hello_mod http_dissect_req http_reconstruct_req genhost host_ip dissect_url dissect_nld " +
  "find_tcp_options wsize_rewrite ip6hdr packet_len clock_gettime getpid uname time brandom hash apply_execution_plan verdict_aggregate fake multisplit multidisorder " +
  "multidisorder_legacy fakedsplit fakeddisorder hostfakesplit tcpseg oob syndata rst udplen dht_dn synack synack_split wsize wssize drop send pktmod pass luaexec " +
  "http_hostcase http_domcase http_methodeol http_unixeol tls_client_hello_clone fake_ip_misdirection outline_random_split").split(/\s+/));

export function hl(line) {
  if (/^\s*--/.test(line)) return <span className="fg-cm">{line}</span>;
  return line.split(/("(?:\\.|[^"\\])*"|\b[A-Za-z_]\w*\b|\b0x[0-9a-fA-F]+\b|\b\d+\b)/g).map((t, i) => {
    if (!t) return null;
    if (/^"/.test(t)) return <span className="fg-st" key={i}>{t}</span>;
    if (KW.has(t)) return <span className="fg-kw" key={i}>{t}</span>;
    if (/^(0x|\d)/.test(t)) return <span className="fg-nm" key={i}>{t}</span>;
    if (KNOWN.has(t)) return <span className="fg-fn" key={i}>{t}</span>;
    return <span key={i}>{t}</span>;
  });
}

/* ── линт / формат / дифф ── */
const stripLua = l => l.replace(/--.*$/, "").replace(/"(\\.|[^"\\])*"/g, '""').replace(/'(\\.|[^'\\])*'/g, "''");

export function lintLua(code) {
  const out = []; const lines = code.split("\n"); const clean = lines.map(stripLua);
  let depth = 0, bad = -1;
  clean.forEach((l, i) => (l.match(/[A-Za-z_]\w*/g) || []).forEach(w => {
    if (w === "function" || w === "if" || w === "do" || w === "repeat") depth++;
    else if (w === "end" || w === "until") { depth--; if (depth < 0 && bad < 0) bad = i + 1; }
  }));
  if (bad > 0) out.push({ id: "L001", sev: "crit", cat: "Синтаксис", line: bad, title: "Лишний end", why: "Блоки не сбалансированы.", fixable: false });
  else if (depth !== 0) out.push({ id: "L001", sev: "crit", cat: "Синтаксис", line: lines.length, title: "Не закрыто блоков: " + depth, why: "Не хватает end.", fixable: false });
  const locals = new Set();
  clean.forEach(l => {
    (l.match(/local\s+function\s+([A-Za-z_]\w*)/g) || []).forEach(m => locals.add(m.split(/\s+/).pop()));
    (l.match(/local\s+([A-Za-z_]\w*(\s*,\s*[A-Za-z_]\w*)*)/g) || []).forEach(m => m.replace(/^local\s+/, "").split(",").forEach(x => locals.add(x.trim())));
    (l.match(/function\s+([A-Za-z_]\w*)\s*\(/g) || []).forEach(m => locals.add(m.replace(/^function\s+/, "").replace(/\s*\($/, "")));
  });
  const seen = new Set();
  clean.forEach((l, i) => (l.match(/\b([A-Za-z_]\w*)\s*\(/g) || []).forEach(m => {
    const n = m.replace(/\s*\($/, "");
    if (KNOWN.has(n) || locals.has(n) || seen.has(n)) return;
    seen.add(n);
    out.push({ id: "L014", sev: "warn", cat: "Синтаксис", line: i + 1, title: `Неизвестная функция ${n}()`, why: "Имени нет в библиотеках и локалах.", fixable: false });
  }));
  return out;
}

export function formatLua(src, tab) {
  let d = 0;
  return src.replace(/\r\n/g, "\n").split("\n").map(raw => {
    const l = raw.trim(); if (!l) return "";
    const c = stripLua(l);
    const opens = (c.match(/\b(function|if|do|repeat)\b/g) || []).length;
    const closes = (c.match(/\b(end|until)\b/g) || []).length;
    const lead = /^(end|until|else|elseif)\b/.test(l) ? 1 : 0;
    const line = " ".repeat(Math.max(0, d - lead) * tab) + l;
    d = Math.max(0, d + opens - closes);
    return line;
  }).join("\n");
}

export function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n"), n = A.length, m = B.length;
  if (n * m > 400000) {
    const out = []; let i = 0;
    while (i < n && i < m && A[i] === B[i]) { out.push({ t: "=", a: i + 1, b: i + 1, s: A[i] }); i++; }
    let ea = n, eb = m;
    while (ea > i && eb > i && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
    for (let k = i; k < ea; k++) out.push({ t: "-", a: k + 1, b: 0, s: A[k] });
    for (let k = i; k < eb; k++) out.push({ t: "+", a: 0, b: k + 1, s: B[k] });
    for (let k = ea; k < n; k++) out.push({ t: "=", a: k + 1, b: k + 1, s: A[k] });
    return out;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: "=", a: i + 1, b: j + 1, s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "-", a: i + 1, b: 0, s: A[i] }); i++; }
    else { out.push({ t: "+", a: 0, b: j + 1, s: B[j] }); j++; }
  }
  while (i < n) { out.push({ t: "-", a: i + 1, b: 0, s: A[i++] }); }
  while (j < m) { out.push({ t: "+", a: 0, b: j + 1, s: B[j++] }); }
  return out;
}

/* ── правила ковки ── */
export const RULES = [
  { id: "T01", sev: "crit", cat: "Транспорт", fixable: true, title: "Cutoff на related ICMP ломает PMTU",
    why: "На любом не-TCP пакете вызывался instance_cutoff_shim. Related ICMP приходит вне потока — инстанс отключался целиком.",
    find: t => { const out = []; const re = /if not desync\.dis\.tcp then\s*\n([ \t]*)instance_cutoff_shim\(ctx,\s*desync\)/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/if not desync\.dis\.tcp then\s*\n([ \t]*)instance_cutoff_shim\(ctx,\s*desync\)/g,
      (m, ind) => `if not desync.dis.tcp then\n${ind}if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end`) },
  { id: "T02", sev: "crit", cat: "Сегментация", fixable: true, title: "Проверка ClientHello применяется ко всей нагрузке",
    why: "Байты 0x16 0x03 проверяются у любых данных. Для HTTP они не совпадут, и функция всегда уходит в fallback split=1.",
    find: t => { if (/l7payload\s*==\s*"tls_client_hello"\s+and\s+not\s+is_complete/.test(t)) return []; const out = [];
      const re = /if not is_complete_client_hello\(data\) then/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/if not is_complete_client_hello\(data\) then/g,
      'if desync.l7payload == "tls_client_hello" and not is_complete_client_hello(data) then') },
  { id: "T03", sev: "crit", cat: "Fooling", fixable: true, title: "apply_fooling вызван с третьим аргументом",
    why: "Сигнатура — apply_fooling(desync, dis). Третья таблица игнорируется: ip_ttl и tcp_ts не применялись.",
    find: t => { const out = []; const re = /apply_fooling\(\s*desync\s*,\s*(\w+)\s*,\s*\{[\s\S]*?\}\s*\)/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/([ \t]*)apply_fooling\(\s*desync\s*,\s*(\w+)\s*,\s*\{([\s\S]*?)\}\s*\)/g, (m, ind, dis, body) => {
      const inner = body.split("\n").map(s => s.trim()).filter(Boolean).join("\n" + ind + "    ");
      return `${ind}local __over = {\n${ind}    ${inner}\n${ind}}\n${ind}local __saved = {}\n` +
        `${ind}for k, v in pairs(__over) do __saved[k] = desync.arg[k]; desync.arg[k] = v end\n` +
        `${ind}pcall(apply_fooling, desync, ${dis})\n${ind}for k in pairs(__over) do desync.arg[k] = __saved[k] end`; }) },
  { id: "T04", sev: "crit", cat: "Сегментация", fixable: true, title: "Реальные сегменты уходят с fooling",
    why: "rawsend_payload_segmented без таблицы опций: TTL и badsum применятся к настоящим данным, сервер их отбросит.",
    find: t => { const out = []; const re = /rawsend_payload_segmented\(([^()]*)\)/g; let m;
      while ((m = re.exec(t))) { if (m[1].split(",").map(s => s.trim()).filter(Boolean).length === 3)
        out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); } return out; },
    apply: t => { let o = t.replace(/rawsend_payload_segmented\(([^()]*)\)/g, (m, inner) =>
      inner.split(",").map(s => s.trim()).filter(Boolean).length === 3 ? `rawsend_payload_segmented(${inner}, opts_orig)` : m);
      if (!/local opts_orig\s*=/.test(o)) {
        const def = `    local opts_orig = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {},\n                        ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }\n`;
        o = o.replace(/(function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/, (x) => x + def); }
      return o; } },
  { id: "T05", sev: "warn", cat: "Fooling", fixable: true, title: "TTL фейка по умолчанию равен 1",
    why: "TTL 1 умирает на первом хопе — внешний DPI пакет не увидит.",
    find: t => { const out = []; const re = /local\s+DEFAULT_IP_TTL\s*=\s*([0-2])\b/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/local\s+DEFAULT_IP_TTL\s*=\s*[0-2]\b/g, "local DEFAULT_IP_TTL = 8") },
  { id: "T06", sev: "warn", cat: "Рандом", fixable: true, title: "math.random не сеялся",
    why: "Без randomseed последовательность одинакова после каждого старта.",
    find: t => (!/math\.random\s*\(/.test(t) || /math\.randomseed/.test(t)) ? [] :
      [{ at: t.search(/math\.random\s*\(/), line: t.slice(0, t.search(/math\.random\s*\(/)).split("\n").length, text: "math.random без randomseed" }],
    apply: t => { const h = `local __RS_SEEDED = false\nlocal function __rs_seed()\n    if __RS_SEEDED then return end\n    __RS_SEEDED = true\n    local s = os.time()\n    local ok, tt = pcall(clock_gettime)\n    if ok and tonumber(tt) then s = s + math.floor(tonumber(tt) * 1000) end\n    local okp, pid = pcall(getpid)\n    if okp and tonumber(pid) then s = s + tonumber(pid) * 7919 end\n    math.randomseed(s % 2147483647)\n    math.random(); math.random(); math.random()\nend\n\n`;
      let o = h + t; return o.replace(/(function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/, (m) => m + "    __rs_seed()\n"); } },
  { id: "T07", sev: "warn", cat: "Лимиты", fixable: true, title: "Фейк уходит на каждом пакете",
    why: "Нет лимита на соединение: каждый пакет с нагрузкой порождает копию.",
    find: t => (!/function\s+fake_ip_misdirection/.test(t) || /lua_state/.test(t)) ? [] :
      [{ at: t.search(/function\s+fake_ip_misdirection/), line: 1, text: "нет счётчика в track.lua_state" }],
    apply: t => { const b = `    do\n        local st = desync.track and desync.track.lua_state\n        if st then\n            local key = "fim_" .. tostring(desync.func_instance or 0)\n            local n = st[key] or 0\n            local maxn = tonumber(desync.arg.maxfake) or 1\n            if maxn > 0 and n >= maxn then\n                instance_cutoff_shim(ctx, desync)\n                return VERDICT_PASS\n            end\n            st[key] = n + 1\n        end\n    end\n`;
      return t.replace(/(function\s+fake_ip_misdirection\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/, (m) => m + b); } },
  { id: "T08", sev: "warn", cat: "Аргументы", fixable: true, title: "Аргументы dir и payload игнорируются",
    why: "Проверяется только desync.outgoing. Стандартные dir и payload не работают.",
    find: t => { const out = []; const re = /if not desync\.outgoing or not desync\.dis\.tcp then/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/([ \t]*)if not desync\.outgoing or not desync\.dis\.tcp then/g, (m, ind) =>
      `${ind}if not desync.dis.tcp then\n${ind}    if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end\n${ind}    return VERDICT_PASS\n${ind}end\n` +
      `${ind}direction_cutoff_opposite(ctx, desync)\n${ind}if not direction_check(desync) then return VERDICT_PASS end\n${ind}if desync.arg.payload and not payload_check(desync) then`) },
  { id: "T09", sev: "info", cat: "Сегментация", fixable: true, title: "seqovl может перекрыть весь первый сегмент",
    why: "Условие >= допускает равенство: второй кусок начинается с нуля и дублирует первый целиком.",
    find: t => { const out = []; const re = /split_pos\s*>=\s*seqovl/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/split_pos\s*>=\s*seqovl/g, "split_pos > seqovl") },
  { id: "T10", sev: "warn", cat: "Аргументы", fixable: true, title: "blob берётся без optional-защиты",
    why: "blob() бросает ошибку, если блоба нет. Штатно — через blob_exist + optional.",
    find: t => { if (/blob_exist/.test(t)) return []; const out = []; const re = /data\s*=\s*blob\(desync,\s*desync\.arg\.blob\)/g; let m;
      while ((m = re.exec(t))) out.push({ at: m.index, line: t.slice(0, m.index).split("\n").length, text: m[0] }); return out; },
    apply: t => t.replace(/([ \t]*)data\s*=\s*blob\(desync,\s*desync\.arg\.blob\)/g, (m, ind) =>
      `${ind}if desync.arg.optional and not blob_exist(desync, desync.arg.blob) then return VERDICT_PASS end\n${ind}data = blob_or_def(desync, desync.arg.blob)`) },
  { id: "T11", sev: "info", cat: "Replay", fixable: false, title: "Cutoff при собранном reasm опасен",
    why: "Отложенные куски перестанут дропаться — сервер получит дубли.",
    find: t => (!/instance_cutoff_shim/.test(t) || !/reasm_data/.test(t) || /not desync\.reasm_data/.test(t)) ? [] :
      [{ at: t.search(/instance_cutoff_shim/), line: t.slice(0, t.search(/instance_cutoff_shim/)).split("\n").length, text: "cutoff без проверки reasm_data" }],
    apply: t => t },
  { id: "T12", sev: "info", cat: "Replay", fixable: false, title: "Нет replay_drop_set после своей отправки",
    why: "Отложенные куски нужно помечать на дроп, иначе будут дубли.",
    find: t => (!/rawsend_payload_segmented/.test(t) || /replay_drop_set/.test(t)) ? [] :
      [{ at: t.search(/rawsend_payload_segmented/), line: 1, text: "нет replay_drop_set(desync)" }],
    apply: t => t }
];

/* ── сниппеты ── */
export const SNIPPETS = [
  { id: "guard", cat: "Каркас", title: "Транспортный гейт", desc: "TCP-гейт с защитой ICMP.",
    code: `if not desync.dis.tcp then\n    if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end\n    return VERDICT_PASS\nend` },
  { id: "dir", cat: "Каркас", title: "Направление и payload", desc: "Уважает аргументы dir/payload.",
    code: `direction_cutoff_opposite(ctx, desync)\nif not direction_check(desync) then return VERDICT_PASS end\nif desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end` },
  { id: "replay", cat: "Каркас", title: "Защита replay", desc: "Только первый проход.",
    code: `if not replay_first(desync) then\n    if replay_drop(desync) then return VERDICT_DROP end\n    return VERDICT_PASS\nend` },
  { id: "data", cat: "Каркас", title: "Источник данных", desc: "reasm → блоб → payload.",
    code: `local data = desync.reasm_data\nif not data and desync.arg.blob then\n    if desync.arg.optional and not blob_exist(desync, desync.arg.blob) then return VERDICT_PASS end\n    data = blob_or_def(desync, desync.arg.blob)\nend\nif not data then data = desync.dis.payload end\nif not data or #data == 0 then return VERDICT_PASS end` },
  { id: "seed", cat: "Рандом", title: "Сидинг random", desc: "clock_gettime + getpid.",
    code: `local s = os.time()\nlocal ok, tt = pcall(clock_gettime)\nif ok and tonumber(tt) then s = s + math.floor(tonumber(tt) * 1000) end\nmath.randomseed(s % 2147483647)` },
  { id: "hostcut", cat: "Сегментация", title: "Разрез внутри SNI", desc: "Случайная точка в host.",
    code: `local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)\nlocal cut\nif ok and r and r[1] and r[2] and r[2] <= #data then\n    cut = (r[2] > r[1]) and math.random(r[1], r[2] - 1) or r[1]\nelse\n    cut = math.random(1, math.max(1, #data - 1))\nend` },
  { id: "opts", cat: "Отправка", title: "opts_orig / opts_fake", desc: "Реальное без fooling, фейки с ним.",
    code: `local opts_orig = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {}, ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }\nlocal opts_fake = { rawsend = rawsend_opts(desync), reconstruct = reconstruct_opts(desync), ipfrag = {}, ipid = desync.arg, fooling = desync.arg }` },
  { id: "split2", cat: "Сегментация", title: "Два сегмента", desc: "Отправка частей и дроп оригинала.",
    code: `if not rawsend_payload_segmented(desync, string.sub(data, 1, cut), 0, opts_orig) then return VERDICT_PASS end\nif not rawsend_payload_segmented(desync, string.sub(data, cut + 1), cut, opts_orig) then return VERDICT_PASS end\nreplay_drop_set(desync)\nreturn desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP` },
  { id: "seqovl", cat: "Сегментация", title: "Перекрытие seq", desc: "Повтор хвоста первого куска.",
    code: `local ov = tonumber(desync.arg.seqovl) or 0\nlocal off2, part2 = cut, string.sub(data, cut + 1)\nif ov > 0 and cut > ov then\n    off2 = cut - ov\n    part2 = string.sub(data, cut - ov + 1, cut) .. part2\nend` },
  { id: "fakeip", cat: "Fooling", title: "Фейк с подменой dst", desc: "Клон, другой адрес, низкий TTL.",
    code: `do\n    local fake = deepcopy(desync.dis)\n    if fake.ip then fake.ip.ip_dst = bu8(192)..bu8(0)..bu8(2)..bu8(1) end\n    local saved = {}\n    local over = { ip_ttl = tonumber(desync.arg.ip_ttl) or 8 }\n    for k, v in pairs(over) do saved[k] = desync.arg[k]; desync.arg[k] = v end\n    pcall(apply_fooling, desync, fake)\n    pcall(apply_ip_id, desync, fake, nil, "rnd")\n    for k in pairs(over) do desync.arg[k] = saved[k] end\n    local o = desync_opts(desync); o.reconstruct.badsum = true\n    rawsend_dissect(fake, o.rawsend, o.reconstruct)\nend` },
  { id: "limit", cat: "Лимиты", title: "Лимит на соединение", desc: "Счётчик + cutoff.",
    code: `do\n    local st = desync.track and desync.track.lua_state\n    if st then\n        local n = st["my_limit"] or 0\n        if n >= (tonumber(desync.arg.maxn) or 1) then instance_cutoff_shim(ctx, desync); return VERDICT_PASS end\n        st["my_limit"] = n + 1\n    end\nend` },
  { id: "udp", cat: "UDP", title: "UDP-ветка", desc: "Изменение длины датаграммы.",
    code: `if desync.dis.udp then\n    desync.dis.payload = (desync.dis.payload or "") .. string.rep("\\0", 2)\n    return VERDICT_MODIFY\nend` },
  { id: "verdict", cat: "Каркас", title: "Агрегатор вердиктов", desc: "DROP > MODIFY > PASS.",
    code: `local verdict = VERDICT_PASS\nlocal function note(v)\n    if v == VERDICT_DROP then verdict = VERDICT_DROP\n    elseif v == VERDICT_MODIFY and verdict ~= VERDICT_DROP then verdict = VERDICT_MODIFY end\nend` },
  { id: "log", cat: "Отладка", title: "DLOG", desc: "Строка в лог движка.",
    code: `if b_debug then DLOG("my_fn: len=" .. #data .. " l7=" .. tostring(desync.l7payload)) end` }
];

/* ── сэмплы и каркас ── */
export const SAMPLE_RANDOM = `-- random_split.lua
local function is_complete_client_hello(data)
    if not data or #data < 6 then return false end
    local b1, b2 = string.byte(data, 1, 2)
    if b1 ~= 0x16 or b2 ~= 0x03 then return false end
    local rlen = (string.byte(data, 4) or 0) * 256 + (string.byte(data, 5) or 0)
    if rlen < 1 then return false end
    return #data >= (5 + rlen)
end
local function find_split_pos(desync, data)
    local len = #data
    if len < 20 then return nil end
    local ok, host_range = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
    if ok and host_range and host_range[1] and host_range[2] and host_range[2] <= len then
        if host_range[2] > host_range[1] then
            return math.random(host_range[1], host_range[2] - 1)
        end
        return host_range[1]
    end
    return math.random(math.floor(len * 0.25), math.floor(len * 0.75))
end
function outline_random_split(ctx, desync)
    if not desync.dis.tcp then
        instance_cutoff_shim(ctx, desync)
        return
    end
    direction_cutoff_opposite(ctx, desync)
    local data
    if desync.reasm_data and #desync.reasm_data > 0 then
        data = desync.reasm_data
    elseif desync.arg.blob then
        data = blob(desync, desync.arg.blob)
    else
        data = desync.dis.payload
    end
    if not data or #data == 0 then return VERDICT_PASS end
    if not replay_first(desync) then
        replay_drop_set(desync)
        return VERDICT_DROP
    end
    if not is_complete_client_hello(data) then
        local p1 = string.sub(data, 1, 1)
        local p2 = string.sub(data, 2)
        if not rawsend_payload_segmented(desync, p1, 0) then return VERDICT_PASS end
        if not rawsend_payload_segmented(desync, p2, 1) then return VERDICT_PASS end
        replay_drop_set(desync)
        return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP
    end
    local len = #data
    if len < 20 then return VERDICT_PASS end
    local split_pos = find_split_pos(desync, data)
    if not split_pos or split_pos < 1 or split_pos >= len then return VERDICT_PASS end
    local seqovl = 0
    if desync.arg.seqovl and tonumber(desync.arg.seqovl) > 0 then
        seqovl = tonumber(desync.arg.seqovl)
    end
    local part1 = string.sub(data, 1, split_pos)
    if not rawsend_payload_segmented(desync, part1, 0) then return VERDICT_PASS end
    local part2_offset = split_pos
    local part2 = string.sub(data, split_pos + 1)
    if seqovl > 0 and split_pos >= seqovl then
        part2_offset = split_pos - seqovl
        local overlap = string.sub(data, split_pos - seqovl + 1, split_pos)
        part2 = overlap .. part2
    end
    if not rawsend_payload_segmented(desync, part2, part2_offset) then return VERDICT_PASS end
    replay_drop_set(desync)
    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP
end
`;

export const SAMPLE_FAKE = `-- fake_ip_misdirection.lua
local DEFAULT_IP_DST = "192.0.2.1"
local DEFAULT_IP_TTL = 1
local function parse_ipv4(s)
    if not s then return nil end
    local a, b, c, d = s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then return nil end
    a, b, c, d = tonumber(a), tonumber(b), tonumber(c), tonumber(d)
    if a > 255 or b > 255 or c > 255 or d > 255 then return nil end
    return bu8(a)..bu8(b)..bu8(c)..bu8(d)
end
function fake_ip_misdirection(ctx, desync)
    if not desync.outgoing or not desync.dis.tcp then
        return VERDICT_PASS
    end
    if #desync.dis.payload == 0 and not (desync.reasm_data and #desync.reasm_data > 0) then
        return VERDICT_PASS
    end
    if not replay_first(desync) then return VERDICT_PASS end
    local fake_dis = deepcopy(desync.dis)
    if desync.reasm_data and #desync.reasm_data > 0 then
        fake_dis.payload = desync.reasm_data
    end
    if fake_dis.ip then
        local bin = parse_ipv4(desync.arg.ip_dst or DEFAULT_IP_DST)
        if bin then fake_dis.ip.ip_dst = bin end
    end
    apply_fooling(desync, fake_dis, {
        ip_ttl = desync.arg.ip_ttl or DEFAULT_IP_TTL,
        tcp_ts = desync.arg.tcp_ts,
    })
    apply_ip_id(desync, fake_dis, nil, "rnd")
    local opts = desync_opts(desync)
    opts.reconstruct.badsum = true
    if desync.arg.repeats then opts.rawsend.repeats = tonumber(desync.arg.repeats) end
    rawsend_dissect(fake_dis, opts.rawsend, opts.reconstruct)
    return VERDICT_PASS
end
`;

export const SKELETON = `-- my_fn.lua
function my_fn(ctx, desync)
    if not desync.dis.tcp then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return VERDICT_PASS
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return VERDICT_PASS end
    if desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return VERDICT_PASS
    end
    local data = desync.reasm_data or desync.dis.payload
    if not data or #data == 0 then return VERDICT_PASS end

    -- тело приёма: вставь сниппет

    return VERDICT_PASS
end
`;

/* ── примитивы ── */
export function Panel({ hue = "#ff7a18", k, title, right, children, style }) {
  return (
    <section className="fg-panel" style={{ "--hue": hue, ...style }}>
      <div className="fg-ph">
        <span className="fg-k">{k}</span><h2>{title}</h2>
        {right && <span className="fg-ph-r">{right}</span>}
      </div>
      <div className="fg-pb">{children}</div>
    </section>
  );
}

export function SegTabs({ options, value, onChange }) {
  return (
    <div className="fg-seg" role="tablist">
      {options.map(o => (
        <button key={o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)} role="tab" aria-selected={value === o.id}>{o.label}</button>
      ))}
    </div>
  );
}

export function StatChip({ cls, v, label }) {
  return <div className={"fg-stat " + (cls || "")}><b>{v}</b><span>{label}</span></div>;
}

export function CodeView({ code, nums = true, maxH = 320, onLine }) {
  const lines = code.split("\n");
  return (
    <div className="fg-codeview" style={{ maxHeight: maxH }}>
      <table><tbody>
        {lines.map((l, i) => (
          <tr key={i} onClick={onLine ? () => onLine(i + 1) : undefined} style={onLine ? { cursor: "pointer" } : undefined}>
            {nums && <td className="fg-cv-n">{i + 1}</td>}
            <td className="fg-cv-s">{hl(l)}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

export function Chip({ on, onClick, children }) {
  return <button className={"fg-chip" + (on ? " on" : "")} onClick={onClick}>{children}</button>;
}

export function Tg({ on, onClick, label, hint }) {
  return (
    <button className={"fg-tg" + (on ? " on" : "")} onClick={onClick} aria-pressed={!!on}>
      <i aria-hidden="true" />{label}{hint && <u>{hint}</u>}
    </button>
  );
}

export function Sld({ id, label, min, max, step = 1, value, onChange, fmt }) {
  return (
    <>
      <div className="fg-row"><label htmlFor={id}>{label}</label><span className="fg-val">{fmt ? fmt(value) : value}</span></div>
      <input id={id} className="fg-sld" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
    </>
  );
}

export function download(text, name, mime = "text/plain") {
  const b = new Blob([text], { type: mime + ";charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}