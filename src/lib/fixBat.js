import { checkBat } from "./checkBat";

const insertHeader = (text, line) => {
  const lines = text.split(/\r?\n/);
  let idx = -1;
  lines.forEach((l, i) => { if (/@echo\s+off|^chcp\s|^setlocal\s|net\s+session/i.test(l)) idx = i; });
  lines.splice(idx + 1, 0, line);
  return lines.join("\n");
};

const portsOf = vals => new Set(vals.flatMap(v => v.split(/[,\s]+/)).filter(Boolean).flatMap(p => {
  const r = p.match(/^(\d+)-(\d+)$/); if (!r) return [p];
  const a = []; for (let x = +r[1]; x <= +r[2] && a.length < 4096; x++) a.push(String(x)); return a;
}));
const flagVals = (text, flag) => [...text.matchAll(new RegExp(flag + "=(\"[^\"]*\"|[^\\s^]+)", "gi"))].map(m => m[1].replace(/^"|"$/g, ""));

function reorderInits(text) {
  const found = [...text.matchAll(/--lua-init=("[^"]*"|[^\s^]+)/gi)];
  if (found.length < 2) return { text, n: 0 };
  const kind = v => /zapret-lib/i.test(v) ? 0 : /zapret-antidpi/i.test(v) ? 1 : /zapret-auto/i.test(v) ? 2 : /\.lua/i.test(v) ? 3 : 4;
  const items = found.map(m => ({ raw: m[0], k: kind(m[1]), idx: m.index }));
  const sorted = [...items].sort((a, b) => a.k - b.k);
  let out = text, delta = 0, n = 0;
  items.forEach((it, i) => {
    const want = sorted[i].raw;
    if (want !== it.raw) {
      const s = it.idx + delta;
      out = out.slice(0, s) + want + out.slice(s + it.raw.length);
      delta += want.length - it.raw.length; n++;
    }
  });
  return { text: out, n };
}

function appendPorts(text, wfFlag, filterFlag) {
  const miss = [...portsOf(flagVals(text, filterFlag))].filter(p => !portsOf(flagVals(text, wfFlag)).has(p));
  if (!miss.length) return { text, n: 0 };
  const m = text.match(new RegExp(wfFlag + "=(\"[^\"]*\"|[^\\s^]+)", "i"));
  if (!m) return { text, n: 0 };
  const raw = m[1], quoted = raw.startsWith('"'), core = raw.replace(/^"|"$/g, "");
  const val = core + "," + miss.join(",");
  const repl = wfFlag + "=" + (quoted ? '"' + val + '"' : val);
  return { text: text.slice(0, m.index) + repl + text.slice(m.index + m[0].length), n: 1 };
}

export function fixBat(text, { registry = new Map(), knownFns = new Set(), profile = [] } = {}) {
  const opts = { registry, knownFns, profile };
  const before = checkBat(text, opts).issues;
  const applied = [];
  let t = String(text).replace(/\r\n/g, "\n");
  const run = (id, title, fn) => { const r = fn(t); if (r.n > 0) { t = r.text; applied.push({ id, title, count: r.n }); } };
  const wrap = (id, title, test, make) => run(id, title, x => test(x) ? { text: make(x), n: 1 } : { text: x, n: 0 });

  wrap("B001", "Добавлен @echo off", x => !/@echo\s+off/i.test(x), x => insertHeader(x, "@echo off"));
  wrap("B002", "Добавлен chcp 65001", x => /[А-Яа-яЁё]/.test(x) && !/chcp\s+(65001|1251)/i.test(x), x => insertHeader(x, "chcp 65001 >nul"));
  wrap("B003", "Включено отложенное расширение !var!", x => /!\w+!/.test(x) && !/EnableDelayedExpansion/i.test(x), x => insertHeader(x, "setlocal EnableExtensions EnableDelayedExpansion"));
  wrap("B007", "Добавлена проверка прав администратора", x => !/(service\.bat|net\s+session|fltmc|whoami\s+\/groups)/i.test(x), x => insertHeader(x, "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)"));

  run("B006", "Исправлены переносы ^", x => {
    let n = 0;
    x = x.replace(/\^[ \t]+(?=\n)/g, () => { n++; return "^"; });
    x = x.replace(/\^[ \t]*(?=\n[ \t]*\n)/g, () => { n++; return ""; });
    x = x.replace(/\^[ \t]*$/, () => { n++; return ""; });
    return { text: x, n };
  });
  run("B008", "nfqws2 заменён на winws2.exe", x => { let n = 0; const r = x.replace(/\bnfqws2(\.exe)?\b/gi, () => { n++; return "winws2.exe"; }); return { text: r, n }; });
  run("B028", "Убраны Linux-флаги (--qnum и др.)", x => {
    let n = 0;
    const r = x.replace(/(--[a-z0-9][a-z0-9-]*)(?:=("[^"]*"|[^\s^]+))?/gi, (m, flag) => {
      const meta = registry.get(flag.toLowerCase());
      if ((meta && meta.platform === "linux") || /^--qnum$/i.test(flag)) { n++; return ""; }
      return m;
    });
    return { text: r, n };
  });
  run("B005", "Пути %~dp0 взяты в кавычки", x => {
    let n = 0;
    const r = x.replace(/%~dp0[\w.-]+\.(exe|lua|txt|dat|bin|gz|dll|sys)/gi, (m, off, s) => { if (s[off - 1] === '"') return m; n++; return '"' + m + '"'; });
    return { text: r, n };
  });
  run("B014", "--lua-init оформлен как @\"%~dp0file.lua\"", x => {
    let n = 0;
    const r = x.replace(/--lua-init=(?!@)(["']?)([\w.-]+\.lua)\1(?=[\s^]|$)/gi, (m, q, name) => { n++; return '--lua-init=@"%~dp0' + name + '"'; });
    return { text: r, n };
  });
  run("B011", "Порядок lua-init: lib → antidpi → auto → свои", x => reorderInits(x));
  run("B026", "Убраны пустые аргументы инстансов", x => { let n = 0; const r = x.replace(/:([A-Za-z_]\w*)=(?=[:\s^]|$)/gm, () => { n++; return ""; }); return { text: r, n }; });
  run("B010", "Порты --filter-tcp добавлены в --wf-tcp-out", x => appendPorts(x, "--wf-tcp-out", "--filter-tcp"));
  run("B019", "Порты --filter-udp добавлены в --wf-udp-out", x => appendPorts(x, "--wf-udp-out", "--filter-udp"));

  const after = checkBat(t, opts).issues;
  return { text: t, before, after, applied };
}