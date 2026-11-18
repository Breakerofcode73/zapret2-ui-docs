const FAMILY = /^--(wf|filter|hostlist|ipset)-/;
const STD_BLOBS = new Set(["fake_default_tls", "fake_default_http", "fake_default_quic"]);

export const DEFAULT_PROFILE = `# Профиль сборки SnAnVI. Предусловия вынесены в service.bat — это учитывается.
# формат: require|<regex>|<сообщение>   или   forbid|<regex>|<сообщение>
require|winws2(\\.exe)?|Запуск через winws2.exe (Windows-бинарник zapret2).
require|--lua-init=@?"?%~dp0lua\\\\zapret-lib\\.lua|Подключи lua\\zapret-lib.lua через %~dp0.
require|--lua-init=@?"?%~dp0lua\\\\zapret-antidpi\\.lua|Подключи lua\\zapret-antidpi.lua через %~dp0.
require|--wf-tcp-out=|Нужен фильтр WinDivert --wf-tcp-out.
require|chcp\\s+(65001|1251)|Кодовая страница: chcp 65001.
require|(service\\.bat|net\\s+session|fltmc|whoami\\s+/groups)|Права и состояние службы: service.bat status_zapret либо явная проверка админа.
forbid|nfqws2|nfqws2 — Linux-бинарник, в Windows-сборке не запускается.
forbid|--qnum|--qnum относится к NFQUEUE (Linux).`;

export function parseProfile(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const t = l.trim();
    if (!t || t.startsWith("#")) return;
    const [kind, re, msg] = t.split("|");
    if (!["require", "forbid"].includes(kind) || !re) { rules.push({ bad: true, line: i + 1, raw: t }); return; }
    try { rules.push({ kind, re: new RegExp(re, "i"), msg: msg || re }); }
    catch { rules.push({ bad: true, line: i + 1, raw: t }); }
  });
  return rules;
}

function logicalCommands(text) {
  const raw = text.split(/\r?\n/); const cmds = []; let buf = "", start = 0;
  raw.forEach((line, i) => {
    const cont = /\^\s*$/.test(line);
    if (!buf) start = i;
    buf += line.replace(/\^\s*$/, " ") + " ";
    if (!cont) { cmds.push({ text: buf.trim(), line: start + 1 }); buf = ""; }
  });
  if (buf.trim()) cmds.push({ text: buf.trim(), line: start + 1 });
  return cmds;
}
const parseFlags = s => [...s.matchAll(/(--[a-z0-9][a-z0-9-]*)(?:=("[^"]*"|[^\s^]+))?/gi)]
  .map(m => ({ flag: m[1].toLowerCase(), value: (m[2] || "").replace(/^"|"$/g, "") }));
const ports = v => new Set(v.split(/[,\s]+/).filter(Boolean).flatMap(p => {
  const r = p.match(/^(\d+)-(\d+)$/); if (!r) return [p];
  const a = []; for (let x = +r[1]; x <= +r[2] && a.length < 4096; x++) a.push(String(x)); return a;
}));

export function checkBat(text, { registry, knownFns, profile }) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  const cmds = logicalCommands(text);
  const add = (id, level, line, msg, fix) => issues.push({ id, level, line, msg, fix });

  if (!/@echo\s+off/i.test(text)) add("B001", "info", 1, "Нет @echo off.", "Добавь первой строкой.");
  if (/[А-Яа-яЁё]/.test(text) && !/chcp\s+(65001|1251)/i.test(text)) add("B002", "warn", 1, "Кириллица без chcp.", "chcp 65001 >nul и UTF-8 без BOM.");
  if (/!\w+!/.test(text) && !/EnableDelayedExpansion/i.test(text)) add("B003", "crit", 1, "!var! без отложенного расширения.", "setlocal EnableExtensions EnableDelayedExpansion");
  if (/(^|[\s=])%~dp0[\w\\.-]+/.test(text)) add("B005", "info", 1, "Путь через %~dp0 без кавычек.", 'Оборачивай: "%~dp0winws2.exe" — пробелы в пути иначе рвут команду.');
  lines.forEach((l, i) => {
    if (/\^\s+$/.test(l)) add("B006", "crit", i + 1, "Пробелы после ^ — продолжение строки не сработает.", "Убери всё после ^.");
    if (/\^\s*$/.test(l) && (!lines[i + 1] || !lines[i + 1].trim())) add("B006", "warn", i + 1, "^ упирается в пустую строку/EOF.", "Убери завершающий ^, если команда закончена.");
  });
  if (!/(service\.bat|net\s+session|fltmc|whoami\s+\/groups)/i.test(text)) add("B007", "warn", 1, "Нет проверки прав/состояния службы.", "WinDivert требует админа: service.bat status_zapret или net session.");
  if (/\bnfqws2\b/i.test(text)) add("B008", "crit", 1, "nfqws2 в .bat.", "Это Linux-бинарник; нужен winws2.exe.");
  if (/--qnum/i.test(text)) add("B009", "crit", 1, "--qnum в Windows-команде.", "NFQUEUE — механизм Linux.");

  const runs = cmds.filter(c => /winws2|nfqws2/i.test(c.text));
  if (!runs.length) add("B025", "warn", 1, "Не найден запуск winws2.", "Проверка флагов невозможна.");
  const all = runs.flatMap(c => parseFlags(c.text).map(f => ({ ...f, line: c.line })));
  const get = n => all.filter(f => f.flag === n);
  const has = n => get(n).length > 0;

  const inits = get("--lua-init").map(f => f.value);
  const desyncs = get("--lua-desync");
  const iLib = inits.findIndex(v => /zapret-lib/i.test(v));
  const iAnti = inits.findIndex(v => /zapret-antidpi/i.test(v));
  if (iLib < 0) add("B011", "warn", runs[0]?.line || 1, "Не подключён zapret-lib.lua.", "Без хелперов desync-функции упадут.");
  if (iAnti >= 0 && iLib >= 0 && iAnti < iLib) add("B011", "crit", runs[0]?.line || 1, "antidpi подключён раньше lib.", "Порядок: lib → antidpi → свои файлы.");
  if (desyncs.length && !inits.length) add("B012", "crit", desyncs[0].line, "--lua-desync без --lua-init.", "Функции ещё не определены.");
  inits.forEach((v, k) => {
    if (/^@?[^"%]/.test(v) && !/^@?%~dp0/.test(v)) add("B014", "info", runs[0]?.line || 1, `--lua-init=${v} — не путь и не %~dp0.`, "Inline-код допустим; для файла используй @\"%~dp0lua\\file.lua\".");
    if (iAnti >= 0 && k < iAnti && /\.lua/i.test(v) && !/zapret-lib|zapret-antidpi|blobs/i.test(v))
      add("B033", "crit", runs[0]?.line || 1, `Свой файл ${v} подключён раньше antidpi (позиция ${k + 1} из ${inits.length}).`, "Свои desync-функции должны идти после lib и antidpi, иначе они не найдут хелперы или будут переопределены.");
  });

  const defined = new Set(STD_BLOBS);
  get("--blob").forEach(f => { const n = f.value.split(":")[0]; if (n) defined.add(n); });
  inits.forEach(v => { if (/\.lua/i.test(v)) defined.add("*"); });
  desyncs.filter(f => /^tls_client_hello_clone/i.test(f.value)).forEach(f => { const m = f.value.match(/blob=([^:]+)/); if (m) defined.add(m[1]); });
  desyncs.forEach(f => {
    const parts = f.value.split(":");
    if (knownFns.size && !knownFns.has(parts[0])) add("B025", "crit", f.line, `Функция ${parts[0]}() не найдена ни в библиотеках, ни в присланных Lua.`, "Проверь имя и подключи файл через --lua-init=@…");
    parts.slice(1).forEach(p => {
      const m = p.match(/^(blob|seqovl_pattern|pattern)=([^=]+)$/);
      if (m && !/^0x/i.test(m[2]) && !defined.has(m[2]) && !defined.has("*")) add("B013", "warn", f.line, `Блоб ${m[2]} не определён.`, "Добавь --blob=…, используй fake_default_* или создай блоб в своём lua-init.");
      if (/=\s*$/.test(p)) add("B026", "warn", f.line, `Пустое значение аргумента: ${p}.`, "Убери аргумент или задай значение.");
    });
  });

  const payloadIdx = all.findIndex(f => f.flag === "--payload");
  const firstDesync = all.findIndex(f => f.flag === "--lua-desync");
  if (payloadIdx > firstDesync && firstDesync >= 0) add("B015", "warn", all[payloadIdx].line, "--payload после --lua-desync.", "Фильтры действуют на последующие инстансы.");

  const wfTcp = new Set(get("--wf-tcp-out").flatMap(f => [...ports(f.value)]));
  const fTcp = new Set(get("--filter-tcp").flatMap(f => [...ports(f.value)]));
  if (fTcp.size && wfTcp.size) [...fTcp].forEach(p => { if (!wfTcp.has(p)) add("B010", "warn", runs[0].line, `Порт ${p} в --filter-tcp не перехвачен --wf-tcp-out.`, "WinDivert не отдаст эти пакеты."); });
  const wfUdp = new Set(get("--wf-udp-out").flatMap(f => [...ports(f.value)]));
  const fUdp = new Set(get("--filter-udp").flatMap(f => [...ports(f.value)]));
  if (fUdp.size && wfUdp.size) [...fUdp].forEach(p => { if (!wfUdp.has(p)) add("B019", "warn", runs[0].line, `UDP-порт ${p} в --filter-udp не перехвачен --wf-udp-out.`, "Добавь порт в --wf-udp-out."); });
  const l7 = get("--filter-l7").flatMap(f => f.value.toLowerCase().split(","));
  if (l7.some(x => /quic|stun|discord|dht|wireguard/.test(x)) && !has("--wf-udp-out")) add("B019", "warn", runs[0].line, "UDP-протокол без --wf-udp-out.", "Добавь перехват UDP.");
  if (l7.some(x => /tls|http/.test(x)) && !has("--wf-tcp-out")) add("B018", "info", runs[0].line, "TCP-протокол без --wf-tcp-out.", "Добавь --wf-tcp-out.");

  const seen = new Map();
  all.forEach(f => {
    const meta = registry.get(f.flag);
    if (!meta && !FAMILY.test(f.flag)) add("B016", "info", f.line, `Флаг ${f.flag} отсутствует в реестре.`, "Импортируй winws2 --help.");
    if (meta && meta.kind === "value" && !f.value) add("B027", "crit", f.line, `${f.flag} требует значения.`, `${f.flag}=<значение>`);
    if (meta && meta.kind === "flag" && f.value) add("B027", "warn", f.line, `${f.flag} — флаг без значения.`, `Убери =${f.value}.`);
    if (meta && meta.platform === "linux") add("B028", "crit", f.line, `${f.flag} — Linux-опция.`, meta.note);
    if (meta && !meta.multi) { if (seen.has(f.flag)) add("B017", "warn", f.line, `Повторный ${f.flag}.`, "Оставь одно значение."); else seen.set(f.flag, f.line); }
  });

  (profile || []).forEach(r => {
    if (r.bad) { add("B030", "warn", r.line, `Не разобрано правило: ${r.raw}`, "Формат: require|<regex>|<сообщение>"); return; }
    const hit = r.re.test(text);
    if (r.kind === "require" && !hit) add("B031", "warn", 1, "Профиль сборки: " + r.msg, "Требование профиля не выполнено.");
    if (r.kind === "forbid" && hit) add("B032", "crit", 1, "Профиль запрещает: " + r.msg, "Убери запрещённую конструкцию.");
  });

  const order = { crit: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line);
  return { issues, commands: runs.length, flags: all.length, lines: lines.length };
}