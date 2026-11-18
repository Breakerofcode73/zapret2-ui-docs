import { loadVault } from "./vault";
import { docLua } from "./luadoc";
import { fns as capi } from "../pages/CApi";
import { fns as lib } from "../pages/Lib";
import { fns as antidpi } from "../pages/Antidpi";
import { fns as auto } from "../pages/Auto";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const LIT = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/g;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// Нормализация: комментарии долой, литералы → placeholder, локальные имена → v1..vN.
// Остаётся только структура и последовательность вызовов.
function normalize(body) {
  let s = body.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");
  const lits = [];
  s = s.replace(LIT, m => { lits.push(m); return "\u00a7"; });
  const names = [];
  for (const m of s.matchAll(/\blocal\s+(?:function\s+)?([A-Za-z_]\w*)/g)) if (!names.includes(m[1])) names.push(m[1]);
  names.forEach((n, i) => { s = s.replace(new RegExp("\\b" + n + "\\b", "g"), "v" + (i + 1)); });
  s = s.replace(/\s+/g, " ").trim();
  const calls = [...s.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]);
  return { norm: s, lits, calls, fp: hash(s), callFp: hash(calls.slice().sort().join("|")) };
}

// Имя аргумента угадываем по тому, что стоит слева от литерала: ip_ttl = § → ip_ttl
function argName(body, index) {
  const parts = body.split(LIT);
  const ctx = (parts[index] || "").slice(-48);
  const m = ctx.match(/([A-Za-z_]\w*)\s*=\s*$/) || ctx.match(/arg\.([A-Za-z_]\w*)\s+or\s*$/);
  return m ? m[1] : "p" + (index + 1);
}

function mergeCluster(group, varying) {
  const base = group[0];
  const used = new Set();
  const params = varying.map(v => {
    let n = v.name.replace(/[^\w]/g, "") || "p" + (v.index + 1);
    while (used.has(n)) n += "_";
    used.add(n);
    const numeric = v.values.every(x => /^(0x[0-9a-fA-F]+|\d+(\.\d+)?)$/.test(x));
    const def = v.values.slice().sort((a, b) =>
      v.values.filter(x => x === b).length - v.values.filter(x => x === a).length)[0];
    return { ...v, arg: n, numeric, def };
  });

  let i = -1;
  const body = base.body.replace(LIT, m => {
    i++;
    const p = params.find(x => x.index === i);
    if (!p) return m;
    return p.numeric ? `(tonumber(desync.arg.${p.arg}) or ${p.def})` : `(desync.arg.${p.arg} or ${p.def})`;
  });

  const names = group.map(g => g.name);
  const prefix = names.reduce((a, b) => {
    let k = 0; while (k < a.length && a[k] === b[k]) k++; return a.slice(0, k);
  }, names[0]).replace(/_+$/, "");
  const name = (prefix.length > 3 ? prefix : base.kind + "_merged") + "_unified";
  const code = body
    .replace(new RegExp("function\\s+" + base.name + "\\s*\\("), `function ${name}(`)
    .replace(/^/, `-- ${name}.lua — объединение ${group.length} функций с одинаковой логикой\n-- различались только значения: ${params.map(p => p.arg).join(", ")}\n`);

  const migration = group.map(g => ({
    from: g.name, file: g.file,
    args: params.map(p => `${p.arg}=${String(g.lits[p.index]).replace(/^["']|["']$/g, "")}`).join(":"),
    cli: `--lua-desync=${name}${params.length ? ":" + params.map(p => `${p.arg}=${String(g.lits[p.index]).replace(/^["']|["']$/g, "")}`).join(":") : ""}`
  }));

  return { name, code, params, migration, file: name + ".lua" };
}

export function findClusters() {
  const items = loadVault();
  const all = [];
  items.forEach(it => {
    const d = docLua(it.text, it.file, KNOWN);
    d.funcs.filter(f => f.isDesync && !f.local).forEach(f => {
      const n = normalize(f.body);
      all.push({ id: it.id, file: it.file, name: f.name, kind: f.kind, body: f.body, line: f.line, args: f.args, ...n });
    });
  });

  const byFp = new Map();
  all.forEach(f => { if (!byFp.has(f.fp)) byFp.set(f.fp, []); byFp.get(f.fp).push(f); });

  const clusters = [];
  for (const [fp, group] of byFp) {
    if (group.length < 2) continue;
    const len = group[0].lits.length;
    const varying = [];
    for (let i = 0; i < len; i++) {
      const vals = group.map(g => g.lits[i]);
      if (new Set(vals).size > 1) varying.push({ index: i, values: vals, name: argName(group[0].body, i) });
    }
    const identical = varying.length === 0;
    clusters.push({ fp, group, varying, identical, merged: identical ? null : mergeCluster(group, varying) });
  }

  // одинаковый набор вызовов, но разная последовательность — сворачивать нельзя
  const byCall = new Map();
  all.forEach(f => { if (!byCall.has(f.callFp)) byCall.set(f.callFp, []); byCall.get(f.callFp).push(f); });
  const near = [];
  for (const [, g] of byCall) {
    if (g.length < 2) continue;
    if (new Set(g.map(x => x.fp)).size > 1) near.push(g);
  }

  return { clusters, near, total: all.length };
}

export function rewriteConfig(config, migrations) {
  if (!config) return "";
  let out = config;
  migrations.forEach(m => {
    out = out.replace(new RegExp("--lua-desync=" + m.from + "(?=[\\s:^]|$)", "g"), m.cli);
  });
  return out;
}