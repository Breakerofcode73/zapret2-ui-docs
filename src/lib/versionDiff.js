// Что изменилось между версиями и какие файлы надо заменить.
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const norm = s => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

export function extractLua(text) {
  const funcs = new Map();
  const re = /^[ \t]*(local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(([^)]*)\)/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ i: m.index, name: m[2], params: m[3], loc: !!m[1] });
  marks.forEach((mk, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].i : text.length;
    const body = text.slice(mk.i, end);
    funcs.set(mk.name, { params: mk.params, local: mk.loc, hash: hash(norm(body)), lines: body.split("\n").length });
  });
  const cm = text.match(/COMPAT_VER\w*\s*(?:==|=|>=|<)\s*(\d+)/) || text.match(/NFQWS2_COMPAT_VER\s*=\s*(\d+)/);
  return { funcs, compat: cm ? +cm[1] : null };
}
export function extractCApi(text) {
  const set = new Set();
  for (const m of text.matchAll(/\{\s*"([A-Za-z_]\w*)"\s*,\s*(luacall_\w+)\s*\}/g)) set.add(m[1]);
  return set;
}
export function extractFlags(text) {
  const set = new Set();
  for (const m of text.matchAll(/(--[a-z0-9][a-z0-9-]*)/gi)) set.add(m[1].toLowerCase());
  return set;
}
const diffSet = (a, b) => ({ added: [...b].filter(x => !a.has(x)), removed: [...a].filter(x => !b.has(x)) });

export function diffLua(oldT, newT) {
  if (!oldT.trim() || !newT.trim()) return null;
  const A = extractLua(oldT), B = extractLua(newT);
  const names = new Set([...A.funcs.keys(), ...B.funcs.keys()]);
  const added = [], removed = [], changed = [];
  for (const n of names) {
    const a = A.funcs.get(n), b = B.funcs.get(n);
    if (!a) added.push(n);
    else if (!b) removed.push(n);
    else if (a.hash !== b.hash) changed.push(n);
  }
  return { added, removed, changed, compat: { old: A.compat, new: B.compat }, total: { old: A.funcs.size, new: B.funcs.size } };
}

export const LUA_SLOTS = [
  { key: "lib", file: "zapret-lib.lua", path: "lua\\zapret-lib.lua", why: "библиотека хелперов: блобы, отсылка, fooling, replay" },
  { key: "antidpi", file: "zapret-antidpi.lua", path: "lua\\zapret-antidpi.lua", why: "готовые desync-стратегии" },
  { key: "auto", file: "zapret-auto.lua", path: "lua\\zapret-auto.lua", why: "оркестраторы и детекторы" },
  { key: "obfs", file: "zapret-obfs.lua", path: "lua\\zapret-obfs.lua", why: "обфускация (если используешь)" },
  { key: "pcap", file: "zapret-pcap.lua", path: "lua\\zapret-pcap.lua", why: "запись дампов (если используешь)" }
];

export function buildManifest({ lua, api, flags }) {
  const reasons = [], copy = [], notes = [];
  let needExe = false;

  if (api) {
    const d = diffSet(extractCApi(api.old), extractCApi(api.new));
    if (d.added.length) { needExe = true; reasons.push(`Новые C-функции для Lua: ${d.added.join(", ")}. Они регистрируются в lfunc[] внутри бинарника — Lua их добавить не может.`); }
    if (d.removed.length) { needExe = true; reasons.push(`Удалены C-функции: ${d.removed.join(", ")}. Старый бинарник их ещё предоставляет, новый Lua-код может на них не рассчитывать.`); }
    api.diff = d;
  }
  if (flags) {
    const d = diffSet(extractFlags(flags.old), extractFlags(flags.new));
    if (d.added.length) { needExe = true; reasons.push(`Новые флаги командной строки: ${d.added.join(", ")}. Разбор параметров живёт в C (params.c).`); }
    if (d.removed.length) { needExe = true; reasons.push(`Удалены флаги: ${d.removed.join(", ")}. Твой .bat может перестать запускаться.`); }
    flags.diff = d;
  }

  const luaChanges = [];
  for (const s of LUA_SLOTS) {
    const pair = lua[s.key];
    if (!pair || !pair.old.trim() || !pair.new.trim()) continue;
    const d = diffLua(pair.old, pair.new);
    if (!d) continue;
    const touched = d.added.length || d.removed.length || d.changed.length;
    luaChanges.push({ ...s, ...d });
    if (touched) copy.push({ from: s.file, to: s.path, why: `${s.why}. Новых: ${d.added.length}, изменённых: ${d.changed.length}, удалённых: ${d.removed.length}` });
    if (d.compat.old !== null && d.compat.new !== null && d.compat.old !== d.compat.new) {
      needExe = true;
      reasons.push(`${s.file}: NFQWS2_COMPAT_VER ${d.compat.old} → ${d.compat.new}. Библиотека требует бинарник нового поколения, иначе откажется работать.`);
    }
    if (d.removed.length) notes.push(`${s.file}: удалены ${d.removed.join(", ")} — проверь, не вызывает ли их твой код.`);
  }

  if (needExe) {
    copy.unshift({ from: "winws2.exe", to: "winws2.exe", why: "новая C-функциональность / флаги / поколение совместимости" });
    copy.push({ from: "WinDivert.dll + WinDivert64.sys", to: "рядом с winws2.exe", why: "драйвер перехвата из того же архива релиза — версии должны совпадать" });
  } else if (copy.length) {
    notes.push("Бинарник менять не требуется: изменения только в Lua-библиотеках. Но если релиз поднял COMPAT_VER — сверь его отдельно.");
  }
  if (!copy.length) notes.push("Различий не найдено: заменять нечего (или не заполнены пары old/new).");
  notes.push("Свои файлы (my_*.lua) не перезаписываются — они лежат отдельно. После замены прогони их через «Исправление ошибок»: могли измениться сигнатуры хелперов.");
  notes.push("files\\fake\\*.bin и листы обновляются отдельно от движка — сверь их наличие, если стратегии используют блобы из файлов.");

  return { needExe, reasons, copy, notes, luaChanges, api, flags };
}

export function manifestText(m) {
  const L = ["# План обновления zapret2", ""];
  L.push(`Бинарник winws2.exe: **${m.needExe ? "ТРЕБУЕТСЯ замена" : "замена не требуется"}**`, "");
  if (m.reasons.length) { L.push("## Почему", ""); m.reasons.forEach(r => L.push("- " + r)); L.push(""); }
  L.push("## Скопировать (Ctrl+C → Ctrl+V)", "");
  m.copy.forEach(c => L.push(`- [ ] \`${c.from}\` → \`${c.to}\` — ${c.why}`));
  L.push("");
  for (const c of m.luaChanges) {
    if (!(c.added.length || c.removed.length || c.changed.length)) continue;
    L.push(`## ${c.file} (${c.total.old} → ${c.total.new} функций)`, "");
    if (c.added.length) L.push("**Новые:** " + c.added.join(", "), "");
    if (c.changed.length) L.push("**Изменённые:** " + c.changed.join(", "), "");
    if (c.removed.length) L.push("**Удалённые:** " + c.removed.join(", "), "");
  }
  if (m.api?.diff) {
    L.push("## C API", "");
    L.push("Новые: " + (m.api.diff.added.join(", ") || "нет"));
    L.push("Удалённые: " + (m.api.diff.removed.join(", ") || "нет"), "");
  }
  if (m.flags?.diff) {
    L.push("## Флаги", "");
    L.push("Новые: " + (m.flags.diff.added.join(", ") || "нет"));
    L.push("Удалённые: " + (m.flags.diff.removed.join(", ") || "нет"), "");
  }
  L.push("## Замечания", ""); m.notes.forEach(n => L.push("- " + n));
  return L.join("\n");
}