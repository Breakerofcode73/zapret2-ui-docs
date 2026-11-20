import { checkBat } from "./checkBat";
import { checkLua } from "./checkLua";

const STD_LIB = /zapret-lib|zapret-antidpi|zapret-auto|blobs/i;
const BUILTIN = new Set(["tls_client_hello_clone"]);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const baseName = v => v.replace(/^@/, "").replace(/^"|"$/g, "").replace(/^%~dp0/i, "").split(/[\\/]/).pop().toLowerCase();

export function sniff(text) {
  if (/@echo\s+off\b|--lua-desync=|\bwinws2(\.exe)?\b\s+--/i.test(text)) return "bat";
  if (/function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)/.test(text)) return "lua";
  if (/\bsetlocal\b|\bchcp\s+\d|\bnfqws2\b|--lua-init=/i.test(text)) return "bat";
  if (/\bfunction\s+\w+\s*\(|\bdesync\./.test(text)) return "lua";
  return null;
}

export function kindOf(name, text) {
  if (/\.(bat|cmd)$/i.test(name)) return "bat";
  if (/\.lua$/i.test(name)) return "lua";
  return sniff(text) || "lua";
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

const flagsOf = c => [...c.text.matchAll(/(--[a-z0-9][a-z0-9-]*)(?:=("[^"]*"|[^\s^]+))?/gi)]
  .map(m => ({ flag: m[1].toLowerCase(), value: (m[2] || "").replace(/^"|"$/g, ""), line: c.line }));

function fnBody(src, fn) {
  const start = src.search(new RegExp("function\\s+" + esc(fn) + "\\s*\\("));
  if (start < 0) return "";
  const rest = src.slice(start);
  const next = rest.slice(1).search(/\nfunction\s+\w+\s*\(/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

export function checkBundle(files, { registry, known, libFns, profile }) {
  const reports = files.map(f => {
    const kind = f.kind || kindOf(f.file, f.text);
    const res = kind === "bat"
      ? checkBat(f.text, { registry, knownFns: new Set(), profile })
      : checkLua(f.text, known);
    return { file: f.file, kind, text: f.text, res };
  });
  const bats = reports.filter(r => r.kind === "bat");
  const luas = reports.filter(r => r.kind === "lua");
  const fnsOf = r => new Set(r.res.functions || []);
  const byBase = new Map(luas.map(r => [baseName(r.file), r]));
  const cross = [];
  const add = (id, level, file, line, msg, fix) => cross.push({ id, level, file, line, msg, fix });
  const usedLua = new Set();

  const argCheck = (bat, inst, fn, owner) => {
    const body = fnBody(owner.text, fn);
    if (!body) return;
    const reads = new Set([...body.matchAll(/desync\.arg\.([A-Za-z_]\w*)/g)].map(m => m[1]));
    const passed = new Set();
    inst.value.split(":").slice(1).forEach(p => { const a = p.split("=")[0]; if (a) passed.add(a); });
    passed.forEach(a => {
      if (!reads.has(a)) add("X005", "info", bat.file, inst.line, `${fn}: аргумент ${a} передан, но функция его не читает.`, `Убери :${a}=… или добавь чтение desync.arg.${a}.`);
    });
    const bodyLines = body.split(/\r?\n/);
    reads.forEach(a => {
      if (passed.has(a)) return;
      const re = new RegExp("desync\\.arg\\." + esc(a) + "\\b");
      const lines = bodyLines.filter(l => re.test(l));
      const optional = lines.some(l => /\bor\b|\bif\b|\bnot\b|~=|==/.test(l));
      if (!optional) add("X006", "warn", bat.file, inst.line, `${fn}: читается desync.arg.${a} без fallback, а в инстансе он не передан.`, `Добавь :${a}=<значение> в --lua-desync или «or <default>» в коде.`);
    });
  };

  bats.forEach(b => {
    const all = logicalCommands(b.text).filter(c => /winws2|nfqws2/i.test(c.text)).flatMap(flagsOf);
    const inits = all.filter(f => f.flag === "--lua-init");
    const desyncs = all.filter(f => f.flag === "--lua-desync");
    const blobs = new Set(all.filter(f => f.flag === "--blob").map(f => f.value.split(":")[0]).filter(Boolean));
    const loaded = [];
    inits.forEach(f => {
      if (!/\.lua/i.test(f.value)) return;
      const bn = baseName(f.value);
      const hit = byBase.get(bn);
      if (hit) { loaded.push(hit); usedLua.add(hit.file); return; }
      if (STD_LIB.test(bn)) add("X001", "info", b.file, f.line, `Штатная библиотека ${bn} не приложена — её функции сверяются со справочником.`, "Приложи файл, если он изменён относительно поставки.");
      else add("X002", "crit", b.file, f.line, `--lua-init ссылается на ${bn}, но этого файла нет в наборе.`, "Добавь .lua в набор или исправь имя в --lua-init.");
    });
    const localFns = new Set([...libFns, ...BUILTIN]);
    loaded.forEach(r => fnsOf(r).forEach(n => localFns.add(n)));
    desyncs.forEach(f => {
      const parts = f.value.split(":");
      const fn = parts[0];
      if (!fn) return;
      if (!localFns.has(fn)) {
        const owner = luas.find(r => fnsOf(r).has(fn));
        if (owner) add("X003", "crit", b.file, f.line, `${fn}() есть в ${owner.file}, но файл не подключён в этом .bat.`, `Добавь --lua-init=@"%~dp0${owner.file}" после lib и antidpi.`);
        else add("X004", "crit", b.file, f.line, `${fn}() не найдена ни в приложенных Lua, ни в штатных библиотеках.`, "Проверь имя или добавь файл с функцией в набор.");
      } else {
        const owner = loaded.find(r => fnsOf(r).has(fn));
        if (owner) argCheck(b, f, fn, owner);
      }
      parts.slice(1).forEach(p => {
        const m = p.match(/^(blob|seqovl_pattern|pattern)=([^=]+)$/);
        if (!m) return;
        const name = m[2];
        if (/^0x/i.test(name) || /^fake_default_/i.test(name) || blobs.has(name)) return;
        const re = new RegExp("\\b" + esc(name) + "\\b");
        if (!luas.some(r => re.test(r.text))) add("X007", "warn", b.file, f.line, `Блоб ${name} не определён ни через --blob, ни в приложенных Lua.`, `Добавь --blob=${name}:0x… или определи блоб в lua-init.`);
      });
    });
  });

  luas.forEach(r => {
    if (bats.length && !usedLua.has(r.file)) add("X008", "warn", r.file, 1, "Файл не подключён ни в одном .bat через --lua-init.", `Добавь --lua-init=@"%~dp0${r.file}" или убери файл из набора.`);
    fnsOf(r).forEach(n => {
      if (!libFns.has(n)) return;
      const line = r.text.split(/\r?\n/).findIndex(l => new RegExp("function\\s+" + esc(n) + "\\s*\\(").test(l)) + 1;
      add("X009", "warn", r.file, line || 1, `${n}() переопределяет функцию штатной библиотеки.`, "Переименуй функцию или подключай файл после antidpi, если переопределение намеренное.");
    });
  });
  if (files.length && !bats.length) add("X010", "info", "", 1, "В наборе нет .bat — связки bat ↔ lua не проверяются.", "Добавь .bat запуска winws2.");
  if (files.length && !luas.length) add("X010", "info", "", 1, "В наборе нет своих .lua — проверяются только .bat и штатные библиотеки.", "Добавь свои .lua, если они используются.");

  const totals = { crit: 0, warn: 0, info: 0 };
  reports.forEach(r => r.res.issues.forEach(i => totals[i.level]++));
  cross.forEach(i => totals[i.level]++);
  const order = { crit: 0, warn: 1, info: 2 };
  cross.sort((a, b) => order[a.level] - order[b.level] || String(a.file).localeCompare(String(b.file)) || a.line - b.line);
  return { reports, cross, totals };
}