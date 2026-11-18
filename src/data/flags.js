// verified — подтверждено исходниками/мануалом; config — встречается в рабочем tests.txt; likely — сверить.
const BASE = [
  ["--qnum", "value", "linux", "verified", "Номер очереди NFQUEUE. Только Linux."],
  ["--debug", "value", "any", "config", "Уровень debug-лога: 0 — выключен, 1+ — включён. В конфиге --debug=0."],
  ["--name", "value", "any", "config", "Имя профиля. Повторяется для каждого профиля."],
  ["--new", "flag", "any", "config", "Разделитель профилей: начинает новый профиль."],
  ["--lua-init", "multi", "any", "verified", "Lua-код строкой или @файл. Выполняется один раз при старте, порядок важен."],
  ["--lua-desync", "multi", "any", "verified", "Инстанс: func:arg=val:flag. Порядок = порядок вызова."],
  ["--lua-gc", "value", "any", "likely", "Параметр сборщика мусора Lua."],
  ["--blob", "multi", "any", "verified", "name:0xHEX|[+ofs]@filename — бинарные данные."],
  ["--filter-tcp", "list", "any", "verified", "Порты TCP профиля."],
  ["--filter-udp", "list", "any", "config", "Порты UDP профиля."],
  ["--filter-l7", "list", "any", "verified", "Протоколы: tls, http, quic, dht, stun, discord…"],
  ["--payload", "list", "any", "verified", "Фильтр типов пейлоада для последующих инстансов."],
  ["--in-range", "value", "any", "verified", "Диапазон входящих позиций потока."],
  ["--out-range", "value", "any", "config", "Диапазон исходящих позиций, например -n8 / -n30."],
  ["--hostlist", "multi", "any", "verified", "Файл списка доменов."],
  ["--hostlist-exclude", "multi", "any", "config", "Исключаемые домены."],
  ["--hostlist-auto", "multi", "any", "likely", "Автохостлист."],
  ["--ipset", "multi", "any", "verified", "IP-лист."],
  ["--ipset-exclude", "multi", "any", "config", "Исключаемые IP."],
  ["--bind-fix4", "flag", "any", "verified", "Фиксация исходящего интерфейса IPv4."],
  ["--bind-fix6", "flag", "any", "verified", "Фиксация исходящего интерфейса IPv6."],
  ["--ipcache-hostname", "flag", "any", "verified", "Кэш IP с именем хоста."],
  ["--wf-tcp-out", "list", "win", "verified", "WinDivert: исходящие TCP-порты."],
  ["--wf-tcp-in", "list", "win", "verified", "WinDivert: входящие TCP-порты."],
  ["--wf-udp-out", "list", "win", "config", "WinDivert: исходящие UDP-порты."],
  ["--wf-udp-in", "list", "win", "config", "WinDivert: входящие UDP-порты."],
  ["--wf-priority", "value", "win", "verified", "Приоритет фильтра WinDivert."],
  ["--wf-raw-out", "list", "win", "likely", "WinDivert: исходящий raw IP."],
  ["--wf-raw-in", "list", "win", "likely", "WinDivert: входящий raw IP."]
];
const KEY = "z2flags:v2";
export const PROFILE_FLAGS = new Set(["--new", "--name"]);

export function baseRegistry() {
  return new Map(BASE.map(([flag, kind, platform, src, note]) =>
    [flag, { flag, kind, platform, note, multi: kind === "multi" || kind === "list" || PROFILE_FLAGS.has(flag), src }]));
}
export function parseHelp(text) {
  const out = [];
  for (const m of text.matchAll(/(--[a-z0-9][a-z0-9-]*)(\s*=\s*|\s+<|\s+[A-Z]{2,}|\b)/g)) {
    const flag = m[1].toLowerCase();
    const kind = /=|</.test(m[2]) ? "value" : "flag";
    if (!out.some(o => o.flag === flag)) out.push({ flag, kind, platform: /--wf-/.test(flag) ? "win" : /qnum/.test(flag) ? "linux" : "any", note: "импортировано из --help", multi: true, src: "imported" });
  }
  return out;
}
export function loadRegistry() {
  const reg = baseRegistry();
  try { JSON.parse(localStorage.getItem(KEY) || "[]").forEach(e => reg.set(e.flag, { ...e })); } catch {}
  return reg;
}
export function saveImported(entries) { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {} }
export function clearImported() { try { localStorage.removeItem(KEY); } catch {} }