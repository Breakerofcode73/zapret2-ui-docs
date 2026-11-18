const STD_KIND = {
  fake: "fake", syndata: "fake", rst: "fake", send: "dup", pktmod: "modify", drop: "drop",
  multisplit: "split", multidisorder: "disorder", multidisorder_legacy: "disorder",
  fakedsplit: "fakesplit", fakeddisorder: "fakedisorder", hostfakesplit: "hostfake",
  tcpseg: "seg", oob: "oob", udplen: "modify", dht_dn: "modify",
  http_domcase: "http", http_hostcase: "http", http_methodeol: "http", http_unixeol: "http",
  wsize: "modify", wssize: "window", synack: "handshake", synack_split: "handshake",
  tls_client_hello_clone: "prep", circular: "orch", repeater: "orch", condition: "orch",
  per_instance_condition: "orch", stopif: "orch",
  luaexec: "debug", pass: "debug", pktdebug: "debug", argdebug: "debug", posdebug: "debug"
};
const WHOLE = new Set(["split", "disorder", "fakesplit", "fakedisorder", "hostfake"]);
const SENDS = new Set([...WHOLE, "seg", "fake", "dup"]);
const HAS_FAKE = new Set(["fake", "fakesplit", "fakedisorder", "hostfake"]);
const OOB_BAD = new Set([...SENDS]);
// аргументы, которые читает не сама функция, а штатные хелперы
const STD_ARGS = new Set(("dir payload ip_ttl ip6_ttl ip_autottl ip6_autottl tcp_seq tcp_ack tcp_ts tcp_md5 " +
  "tcp_flags_set tcp_flags_unset tcp_ts_up tcp_nop_del badsum repeats ifout fwmark ip_id ip_id_conn fool " +
  "ipfrag ipfrag_disorder ipfrag_pos ipfrag_pos_tcp ipfrag_pos_udp ipfrag_pos_icmp ipfrag_next " +
  "ip6_hopbyhop ip6_hopbyhop2 ip6_destopt ip6_destopt2 ip6_routing ip6_ah").split(" "));

export function parseConfig(text) {
  const lines = text.split(/\r?\n/);
  let start = lines.findIndex(l => /winws2(\.exe)?|nfqws2/i.test(l));
  if (start < 0) return { found: false, lines, profiles: [], global: null, start: -1, end: -1, prefix: "" };
  let end = start;
  while (/\^\s*$/.test(lines[end] || "") && end + 1 < lines.length) end++;
  const block = lines.slice(start, end + 1);
  const fi = block[0].search(/--[a-z]/i);
  const prefix = fi >= 0 ? block[0].slice(0, fi).trimEnd() : block[0].trimEnd();
  const tokens = [];
  block.forEach((l, k) => {
    for (const m of l.matchAll(/(--[a-z0-9][a-z0-9-]*)(?:=("[^"]*"|[^\s^]+))?/gi))
      tokens.push({ flag: m[1].toLowerCase(), value: (m[2] || "").replace(/^"|"$/g, ""), raw: m[0], line: start + k });
  });
  const global = { tokens: [], inits: [], wf: {}, debug: null };
  const profiles = [];
  let cur = null;
  const open = nameTok => {
    cur = { name: nameTok ? nameTok.value : "профиль " + (profiles.length + 1), nameSet: !!nameTok, tokens: [], instances: [],
      tcp: "", udp: "", l7: "", payload: "", inRange: "", outRange: "", hostlists: [], excludes: [], ipsets: [] };
    profiles.push(cur);
  };
  for (const t of tokens) {
    if (t.flag === "--new") { open(null); continue; }
    if (t.flag === "--name") { if (!cur || cur.nameSet) open(t); else { cur.name = t.value; cur.nameSet = true; } cur.tokens.push(t); continue; }
    if (!cur) {
      global.tokens.push(t);
      if (t.flag === "--lua-init") global.inits.push(t.value);
      if (t.flag.startsWith("--wf-")) global.wf[t.flag] = t.value;
      if (t.flag === "--debug") global.debug = t.value || "on";
      continue;
    }
    cur.tokens.push(t);
    if (t.flag === "--filter-tcp") cur.tcp = t.value;
    else if (t.flag === "--filter-udp") cur.udp = t.value;
    else if (t.flag === "--filter-l7") cur.l7 = t.value.toLowerCase();
    else if (t.flag === "--payload") cur.payload = t.value;
    else if (t.flag === "--in-range") cur.inRange = t.value;
    else if (t.flag === "--out-range") cur.outRange = t.value;
    else if (t.flag.startsWith("--hostlist") && !t.flag.includes("exclude")) cur.hostlists.push(t.value);
    else if (t.flag.includes("exclude")) cur.excludes.push(t.value);
    else if (t.flag.startsWith("--ipset")) cur.ipsets.push(t.value);
    else if (t.flag === "--lua-desync") {
      const parts = t.value.split(":"); const args = {};
      parts.slice(1).forEach(p => { const i = p.indexOf("="); i < 0 ? args[p] = true : args[p.slice(0, i)] = p.slice(i + 1); });
      cur.instances.push({ fn: parts[0], args, raw: t.raw, line: t.line, kind: STD_KIND[parts[0]] || "custom",
        filters: { payload: cur.payload, inRange: cur.inRange, outRange: cur.outRange } });
    }
  }
  return { found: true, lines, start, end, prefix, global, profiles: profiles.filter(p => p.tokens.length) };
}

export function auditArgs(inst, fn) {
  if (!fn) return null;
  const read = new Map(fn.args.map(a => [a.name, a]));
  const unused = Object.keys(inst.args).filter(g => !read.has(g) && !STD_ARGS.has(g));
  const missing = fn.args.filter(a => !(a.name in inst.args) && a.type !== "flag").map(a => ({ name: a.name, def: a.def, type: a.type }));
  return { unused, missing, reads: fn.args.map(a => a.name) };
}

const allows = (filter, need) => {
  if (!need.length || !filter) return true;
  const list = filter.toLowerCase().split(",").map(s => s.trim());
  return list.includes("all") || list.includes("known") || need.some(n => list.includes(n.toLowerCase()));
};

export function profileIssues(p) {
  const out = [];
  const kinds = p.instances.map(i => i.kind);
  if (kinds.includes("oob") && kinds.some(k => OOB_BAD.has(k))) out.push("oob вместе с отправкой целого пейлоада: десинхронизация seq/ack будет разрушена.");
  const w = p.instances.filter(i => WHOLE.has(i.kind));
  if (w.length > 1) out.push(`Двойное разбиение одного сообщения: ${w.map(x => x.fn).join(" → ")}. Первый уже отправил reasm и поставил replay_drop_set — второй уйдёт поверх.`);
  const me = p.instances.findIndex(i => i.fn === "http_methodeol");
  if (me >= 0 && p.instances.slice(me + 1).some(i => i.kind === "http")) out.push("http_methodeol не последний среди http-функций.");
  if (p.hostlists.length && kinds.includes("window")) out.push("wssize с хостлистами не работает.");
  const dbg = p.instances.filter(i => i.kind === "debug");
  if (dbg.length) out.push(`Отладочные инстансы в рабочем конфиге: ${dbg.map(d => d.fn).join(", ")}.`);
  if (!p.payload && p.instances.length) out.push("Нет --payload: инстансы получают все known-пейлоады — лишние входы в Lua.");
  if (!p.l7 && p.instances.length) out.push("Нет --filter-l7: профиль ловит любой распознанный протокол.");
  return out;
}

export function globalIssues(cfg) {
  const out = [];
  const inits = cfg.global?.inits || [];
  const iLib = inits.findIndex(v => /zapret-lib/i.test(v));
  const iAnti = inits.findIndex(v => /zapret-antidpi/i.test(v));
  if (iLib < 0) out.push("Не подключён zapret-lib.lua — хелперы недоступны.");
  if (iAnti >= 0 && iLib > iAnti) out.push("zapret-antidpi подключён раньше zapret-lib.");
  inits.forEach((v, k) => {
    if (iAnti >= 0 && k < iAnti && /\.lua/i.test(v) && !/zapret-lib|zapret-antidpi|blobs/i.test(v))
      out.push(`Свой файл ${v.replace(/^@/, "")} подключён на позиции ${k + 1}, раньше antidpi (${iAnti + 1}). Перенеси после antidpi.`);
  });
  const names = cfg.profiles.map(p => p.name);
  names.forEach((n, i) => { if (names.indexOf(n) !== i) out.push(`Дублируется имя профиля «${n}» — в логах их не различить.`); });
  return out;
}

export function evaluate(fn, p, pos, global) {
  const before = p.instances.slice(0, pos), after = p.instances.slice(pos);
  const filters = pos === 0 ? { payload: p.payload, outRange: p.outRange } : before[before.length - 1].filters;
  const reasons = []; let score = 2;
  const bad = (s, r) => { score = Math.min(score, s); reasons.push(r); };
  const good = r => reasons.push("＋ " + r);
  if (fn.local) bad(-1, "Функция объявлена local: из --lua-desync не видна.");
  if (!fn.isDesync) bad(-1, "Не desync-функция: подключается через --lua-init и вызывается из аргументов.");
  if (before.some(i => i.fn === fn.name)) bad(1, "Уже присутствует раньше в этом профиле — повтор даст дубль отправки.");
  if (!allows(filters.payload, fn.gatePayload)) bad(0, `Активен --payload=${filters.payload || "нет"}, а функция работает только по ${fn.gatePayload.join("/")}.`);
  if (fn.tcpOnly && !p.tcp && p.udp) bad(0, "Профиль фильтрует только UDP, функция только для TCP.");
  if (fn.udpOnly && p.tcp && !p.udp) bad(0, "Профиль фильтрует только TCP, функция только для UDP.");
  if (fn.needsReasm && filters.outRange) good(`Ограничение ${filters.outRange} задаёт окно перехвата: reasm доступен в его пределах.`);
  const kb = before.map(i => i.kind), ka = after.map(i => i.kind);
  if (kb.includes("oob") && OOB_BAD.has(fn.kind)) bad(-1, "Перед этим oob: отправка целого пейлоада пойдёт без OOB.");
  if (fn.kind === "fake") {
    if (kb.some(k => HAS_FAKE.has(k))) bad(1, "Фейк уже отправлен предыдущим инстансом.");
    if (ka.some(k => WHOLE.has(k))) good("Фейк перед разрезом — эталонная связка.");
    if (ka.some(k => HAS_FAKE.has(k))) bad(1, "Дальше функция со встроенными фейками.");
  }
  if (["split", "disorder"].includes(fn.kind)) {
    if (kb.some(k => WHOLE.has(k))) bad(-1, "Предыдущий инстанс уже отправил всё сообщение — твои части уйдут поверх.");
    if (ka.some(k => WHOLE.has(k))) bad(-1, "Следующий инстанс отправит то же сообщение повторно.");
    if (kb.includes("fake")) good("Идёт после фейка — правильный порядок.");
  }
  if (fn.kind === "modify") {
    if (kb.some(k => SENDS.has(k))) bad(0, "Оригинал уже заменён и дропнут — модифицировать нечего.");
    if (ka.some(k => SENDS.has(k))) bad(1, "Следующий инстанс дропнет оригинал: правка может не попасть в провод.");
  }
  if (fn.kind === "drop" && after.length) bad(1, "DROP агрегируется в конце: последующие инстансы всё равно выполнятся.");
  if (fn.luaCutoff && after.length) bad(-1, "lua_cutoff отключит обработку потока для всех инстансов.");
  if (fn.planCancel && after.length) bad(1, "Функция забирает execution plan — остальные инстансы выполнит только она.");
  if (fn.kind === "orch" && pos !== 0) bad(1, "Оркестратор управляет только последующими инстансами.");
  if (p.hostlists.length && fn.name === "wssize") bad(-1, "wssize несовместим с хостлистами.");
  if (!fn.hasCutoff && fn.sends) bad(1, "Нет instance cutoff — вызов на каждом пакете потока.");
  if (!fn.hasReplay && fn.sends) bad(1, "Нет защиты replay — отправка повторится на каждую часть.");
  if (fn.tcpOnly && global?.wf && !global.wf["--wf-tcp-out"]) bad(0, "Нет --wf-tcp-out: WinDivert не отдаст TCP.");
  if (score >= 2 && !reasons.some(r => r.startsWith("＋"))) good("Совместимо с соседями, фильтры пропускают нужные пакеты.");
  const verdict = score < 0 ? "сломает" : score === 0 ? "бессмысленно" : score === 1 ? "с оговорками" : "рекомендуется";
  return { pos, score, verdict, reasons, filters };
}

export function runConfig(cfg, docs) {
  const fns = docs.flatMap(d => d.funcs.filter(f => f.isDesync).map(f => ({ ...f, file: d.file })));
  const byName = new Map(fns.map(f => [f.name, f]));
  const usage = new Map();
  const profiles = cfg.profiles.map((p, pi) => {
    const argIssues = [];
    p.instances.forEach((inst, k) => {
      if (!usage.has(inst.fn)) usage.set(inst.fn, []);
      usage.get(inst.fn).push({ pi, profile: p.name, index: k, args: inst.args });
      const a = auditArgs(inst, byName.get(inst.fn));
      if (!a) return;
      a.unused.forEach(u => argIssues.push({ level: "warn", inst: k + 1, fn: inst.fn, text: `Аргумент «${u}» передан, но функция его не читает и штатным он не является — опечатка или мусор.` }));
      a.missing.forEach(m => argIssues.push({ level: "info", inst: k + 1, fn: inst.fn, text: `Аргумент «${m.name}» не передан — возьмётся значение по умолчанию ${m.def}.` }));
    });
    const issues = profileIssues(p);
    const reports = fns.map(fn => {
      const slots = []; for (let k = 0; k <= p.instances.length; k++) slots.push(evaluate(fn, p, k, cfg.global));
      const best = slots.slice().sort((a, b) => b.score - a.score || a.pos - b.pos)[0];
      return { fn, slots, best, used: p.instances.some(i => i.fn === fn.name),
        needPayload: fn.gatePayload[0] && best.filters.payload !== fn.gatePayload[0] ? fn.gatePayload[0] : null, pi };
    });
    return { p, pi, issues, argIssues, reports, bad: issues.length + argIssues.filter(x => x.level === "warn").length };
  });
  return { fns, profiles, usage, globalIssues: globalIssues(cfg) };
}

export function buildPatched(cfg, picks) {
  if (!cfg.found) return "";
  const out = [];
  cfg.global.tokens.forEach(t => out.push(t.raw));
  cfg.profiles.forEach((p, pi) => {
    if (pi > 0) out.push("--new");
    const ins = picks.filter(x => x.pi === pi);
    const flush = slot => ins.filter(x => x.pos === slot).forEach(x => {
      if (x.needPayload) out.push(`--payload=${x.needPayload}`);
      out.push(`--lua-desync=${x.name}${x.args ? ":" + x.args : ""}`);
    });
    let n = 0;
    p.tokens.forEach(t => { if (t.flag === "--lua-desync") { flush(n); n++; } out.push(t.raw); });
    flush(n);
  });
  const body = out.map((r, i) => (i === 0 ? cfg.prefix + " " + r : " " + r) + (i < out.length - 1 ? " ^" : ""));
  return [...cfg.lines.slice(0, cfg.start), ...body, ...cfg.lines.slice(cfg.end + 1)].join("\n");
}