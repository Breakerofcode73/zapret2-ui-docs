const ANTIDPI = new Set([
  "drop", "send", "pktmod", "http_hostcase", "http_domcase", "http_methodeol", "http_unixeol",
  "wsize", "wssize", "syndata", "tls_client_hello_clone", "fake", "rst",
  "multisplit", "multidisorder", "multidisorder_legacy", "fakedsplit", "fakeddisorder",
  "hostfakesplit", "tcpseg", "oob", "udplen", "dht_dn", "synack", "synack_split"
]);
export const KNOWN = ANTIDPI;

const has = (t, arr) => arr.some(k => t.includes(k));
const pick = (t, re, def) => { const m = t.match(re); return m ? m[1] : def; };
const luaStr = s => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const luaVal = v => typeof v === "string" ? luaStr(v) : String(v);

function detectProto(t, override) {
  if (override && override !== "auto") return override;
  if (has(t, ["quic", "квик", "http3"])) return "quic";
  if (has(t, ["discord", "дискорд", "голос", "войс", "udp", "dht", "торрент"])) return "udp";
  if (has(t, ["http", "сайт", "редирект", "заглушк", "80"]) && !has(t, ["tls", "https", "sni", "443"])) return "http";
  return "tls";
}

function detectActions(t, proto) {
  const a = new Set();
  if (has(t, ["oob", "urgent", "ургент"])) a.add("oob");
  if (has(t, ["клон", "clone"])) a.add("clone");
  if (has(t, ["маскир", "hostfake", "под домен", "под vk", "под разреш"])) a.add("hostfake");
  if (has(t, ["fakeddisorder", "фейк disorder", "фейк дизордер"])) a.add("fakeddisorder");
  if (has(t, ["fakedsplit"])) a.add("fakedsplit");
  if (has(t, ["disorder", "дизордер", "обратный порядок", "обратн порядок"])) a.add("disorder");
  if (has(t, ["сплит", "split", "сегмент", "разрез"])) a.add("split");
  if (has(t, ["фейк", "fake"])) a.add("fake");
  if (has(t, ["syndata", "syn data", "фейк в syn"])) a.add("syndata");
  if (has(t, ["hostcase", "регистр заголовка", "регистр host"])) a.add("hostcase");
  if (has(t, ["domcase", "регистр домена", "регистр имени"])) a.add("domcase");
  if (has(t, ["methodeol", "перенос строки", "eol", "crlf"])) a.add("methodeol");
  if (has(t, ["udplen", "длина udp", "паддинг", "+2 байта", "удлинить"])) a.add("udplen");
  if (has(t, ["dht", "bencode"])) a.add("dht");
  if (has(t, ["wsize", "окно tcp", "window size"])) a.add("wsize");
  if (has(t, ["drop", "дропать", "отбрасывать"])) a.add("drop");
  if (has(t, ["ttl", "badsum", "битая сумма", "битой сумм"]) && !a.has("fake") && proto !== "udp") a.add("fake");
  if (!a.size) {
    if (proto === "tls") a.add("split");
    else if (proto === "http") a.add("hostcase");
    else if (proto === "quic") { a.add("fake"); a.add("udplen"); }
    else a.add("udplen");
  }
  return a;
}

function buildCalls(a) {
  const calls = [];
  const push = fn => { if (!calls.includes(fn)) calls.push(fn); };
  if (a.has("oob")) push("oob");
  if (a.has("clone")) push("tls_client_hello_clone");
  if (a.has("hostcase")) push("http_hostcase");
  if (a.has("domcase")) push("http_domcase");
  if (a.has("syndata")) push("syndata");

  const seg = a.has("hostfake") ? "hostfakesplit"
    : a.has("fakeddisorder") ? "fakeddisorder"
    : a.has("fakedsplit") ? "fakedsplit"
    : a.has("disorder") ? "multidisorder"
    : a.has("split") ? "multisplit"
    : null;

  if (a.has("fake") && !["fakedsplit", "fakeddisorder", "hostfakesplit"].includes(seg)) push("fake");
  if (seg) push(seg);
  if (a.has("udplen")) push("udplen");
  if (a.has("dht")) push("dht_dn");
  if (a.has("methodeol")) push("http_methodeol");
  if (a.has("wsize")) push("wssize");
  if (a.has("drop")) push("drop");
  return calls;
}

function buildDefaults(calls, p, proto) {
  const d = {};
  const fool = calls.some(c => ["fake", "syndata", "fakedsplit", "fakeddisorder", "hostfakesplit"].includes(c));
  if (fool) { d.ip_ttl = p.ttl; d.badsum = true; }
  if (calls.includes("tls_client_hello_clone")) { d.blob = "hello_clone"; d.fallback = p.blob; }
  if (calls.includes("fake")) d.blob = calls.includes("tls_client_hello_clone") ? "hello_clone" : p.blob;
  if (calls.includes("multisplit")) d.pos = p.pos;
  if (calls.includes("multidisorder")) { d.pos = p.posSingle; d.seqovl = p.seqovl; }
  if (calls.includes("fakedsplit") || calls.includes("fakeddisorder")) d.pos = p.posSingle;
  if (calls.includes("hostfakesplit")) { d.host = p.host; d.midhost = "midsld"; }
  if (calls.includes("http_hostcase")) d.spell = p.spell;
  if (calls.includes("udplen")) d.increment = p.increment;
  if (calls.includes("dht_dn")) d.dn = 3;
  if (calls.includes("wssize")) { d.wsize = 1; d.scale = 0; d.dir = "in"; }
  if (!d.dir) d.dir = "out";
  void proto;
  return d;
}

function renderLua(name, desc, calls, defaults) {
  const L = [];
  L.push(`-- ${name} : сгенерировано по описанию`);
  L.push(`-- ${String(desc).replace(/\r?\n/g, " ").slice(0, 200)}`);
  L.push(`function ${name}(ctx, desync)`);
  L.push(`    desync.arg = desync.arg or {}`);
  Object.entries(defaults).forEach(([k, v]) => {
    L.push(`    if desync.arg.${k} == nil then desync.arg.${k} = ${luaVal(v)} end`);
  });
  L.push(`    local verdict = VERDICT_PASS`);
  L.push(`    local function apply(fn)`);
  L.push(`        local v = fn(ctx, desync)`);
  L.push(`        if v == VERDICT_DROP then`);
  L.push(`            verdict = VERDICT_DROP`);
  L.push(`        elseif v == VERDICT_MODIFY and verdict ~= VERDICT_DROP then`);
  L.push(`            verdict = VERDICT_MODIFY`);
  L.push(`        end`);
  L.push(`    end`);
  calls.forEach(fn => L.push(`    apply(${fn})`));
  L.push(`    return verdict`);
  L.push(`end`);
  return L.join("\n") + "\n";
}

function profileFilters(proto, calls, t) {
  const f = {};
  const noPayload = calls.includes("oob") || calls.includes("syndata") || calls.includes("wssize");
  if (proto === "tls") {
    f.tcp = "443"; f.l7 = "tls";
    if (!noPayload) { f.payload = "tls_client_hello"; f.out = "-n30"; }
  } else if (proto === "http") {
    f.tcp = "80"; f.l7 = "http";
    if (!noPayload) { f.payload = "http_req"; f.out = "-n30"; }
  } else if (proto === "quic") {
    f.udp = "443"; f.l7 = "quic"; f.payload = "quic_initial";
  } else {
    if (has(t, ["dht", "торрент"])) { f.udp = "*"; f.l7 = "dht"; }
    else if (has(t, ["discord", "дискорд", "голос"])) { f.udp = "50000-50100"; f.l7 = "discord"; }
    else { f.udp = "443"; f.l7 = "quic"; }
  }
  if (calls.includes("wssize")) { f.tcpIn = "80,443"; delete f.tcp; delete f.payload; delete f.out; }
  return f;
}

function renderProfile(name, proto, calls, defaults, t) {
  const f = profileFilters(proto, calls, t);
  const args = Object.entries(defaults)
    .filter(([k, v]) => k !== "dir" || v === "in")
    .map(([k, v]) => v === true ? k : `${k}=${v}`)
    .join(":");
  const L = [`--new=${name}`, `--name=${name}`];
  if (f.tcp) L.push(`--filter-tcp=${f.tcp}`);
  if (f.tcpIn) L.push(`--filter-tcp=${f.tcpIn}`);
  if (f.udp) L.push(`--filter-udp=${f.udp}`);
  if (f.l7) L.push(`--filter-l7=${f.l7}`);
  if (f.payload) L.push(`--payload=${f.payload}`);
  if (f.out) L.push(`--out-range=${f.out}`);
  L.push(`--lua-desync=${name}${args ? ":" + args : ""}`);
  return { text: L.join("\n"), filters: f };
}

function renderBat(name, profile) {
  const f = profile.filters;
  const cmd = ['start "zapret2" /min "%~dp0winws2.exe"'];
  if (f.tcp) cmd.push(`--wf-tcp-out=${f.tcp}`);
  if (f.tcpIn) cmd.push(`--wf-tcp-in=${f.tcpIn}`);
  if (f.udp) cmd.push(`--wf-udp-out=${f.udp}`);
  ["zapret-lib.lua", "zapret-antidpi.lua", "zapret-auto.lua"].forEach(x => cmd.push(`--lua-init=@"%~dp0lua\\${x}"`));
  cmd.push(`--lua-init=@"%~dp0${name}.lua"`);
  profile.text.split("\n").forEach(l => cmd.push(l));
  return [
    "@echo off",
    "chcp 65001 >nul",
    "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)",
    'cd /d "%~dp0"',
    cmd.join(" ^\n ")
  ].join("\n") + "\n";
}

export function describeToFunction(desc, opts = {}) {
  const t = String(desc || "").toLowerCase();
  const name = String(opts.name || "my_strategy").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "_$1").replace(/_+/g, "_").replace(/^_|_$/g, "") || "my_strategy";
  const proto = detectProto(t, opts.proto);
  const actions = detectActions(t, proto);
  const params = {
    ttl: pick(t, /(?:ttl|ттл)\s*[=:]?\s*(\d+)/, "8"),
    pos: pick(t, /(?:pos|позици[яи])\s*[=:]?\s*([a-z0-9,+\-]+)/, "1,midsld"),
    posSingle: pick(t, /(?:pos|позици[яи])\s*[=:]?\s*([a-z0-9+\-]+)/, "midsld"),
    seqovl: pick(t, /(?:seqovl|перекрыт\w*)\s*[=:]?\s*(\d+)/, "2"),
    increment: pick(t, /(?:increment|\+\s*(\d+)\s*байт)/, "2"),
    spell: pick(t, /spell\s*[=:]?\s*([a-z]{4})/, "hOst"),
    host: pick(t, /под\s+([a-z0-9.\-]+\.[a-z]{2,})/, "vk.com"),
    blob: pick(t, /blob\s*[=:]?\s*([a-z0-9_]+)/, proto === "http" ? "fake_default_http" : proto === "tls" ? "fake_default_tls" : "fake_default_quic")
  };
  if (params.host !== "vk.com") params.host = "zzzzzz." + params.host;
  else params.host = "e8nzn.vk.com";
  const calls = buildCalls(actions);
  const defaults = buildDefaults(calls, params, proto);
  const code = renderLua(name, desc, calls, defaults);
  const profile = renderProfile(name, proto, calls, defaults, t);
  const bat = renderBat(name, profile);
  const notes = [];
  if (has(t, ["ютуб", "youtube"]) && proto === "tls") notes.push("Для YouTube обычно нужен ещё отдельный QUIC-профиль: udp/443, quic_initial, fake + udplen.");
  if (calls.includes("oob") || calls.includes("syndata")) notes.push("payload/out-range фильтры убраны: oob/syndata должны видеть SYN.");
  if (calls.includes("wssize")) notes.push("wssize работает по входящему SYN+ACK: нужен --wf-tcp-in и dir=in.");
  notes.push("Функция вызывает стандартные функции antidpi; порядок вызовов сохранён в apply().");
  return { name, proto, actions: [...actions], calls, params, defaults, code, profile: profile.text, bat, notes };
}