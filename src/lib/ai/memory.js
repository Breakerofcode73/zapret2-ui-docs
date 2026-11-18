import { tokens, fuzzy } from "./tfidf";

const KEY = "z2ai:mem:v1";
let cache = null;
const subs = new Set();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} subs.forEach(f => f(cache)); }
export function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { cache = null; }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function stats() {
  const m = load();
  return { total: m.length, pos: m.filter(x => x.w > 0).length, neg: m.filter(x => x.w < 0).length,
    weight: m.reduce((s, x) => s + Math.abs(x.w), 0), oldest: m.length ? Math.min(...m.map(x => x.at)) : null };
}
export function remember(phrase, ops, ctx, sign = 1) {
  load();
  const t = tokens(phrase).join(" ");
  const hit = cache.find(x => x.t === t);
  if (hit) { hit.w += sign; hit.ops = ops; hit.ctx = ctx; hit.at = Date.now(); hit.n++; }
  else cache.unshift({ t, phrase, ops, ctx, w: sign, n: 1, at: Date.now() });
  cache = cache.slice(0, 400);
  persist();
}
export function recall(phrase) {
  const t = tokens(phrase).join(" ");
  const out = [];
  load().forEach(x => {
    const j = fuzzy(t, x.t);
    if (j > 0.55) out.push({ ...x, sim: j });
  });
  return out.sort((a, b) => (b.sim * Math.abs(b.w)) - (a.sim * Math.abs(a.w))).slice(0, 4);
}
export function bias(phrase) {
  const map = new Map();
  recall(phrase).forEach(r => r.ops.forEach(o => map.set(o, (map.get(o) || 0) + r.sim * r.w * 0.5)));
  return map;
}
export function forget(i) { load(); cache = cache.filter((_, k) => k !== i); persist(); }
export function consolidate() {
  load();
  const merged = [];
  cache.forEach(x => {
    const near = merged.find(y => fuzzy(y.t, x.t) > 0.86 && JSON.stringify(y.ops.slice().sort()) === JSON.stringify(x.ops.slice().sort()));
    if (near) { near.w += x.w; near.n += x.n; near.at = Math.max(near.at, x.at); }
    else merged.push({ ...x });
  });
  const now = Date.now(), month = 30 * 864e5;
  cache = merged.map(x => ({ ...x, w: x.w * (now - x.at > month ? 0.7 : 1) }))
    .filter(x => Math.abs(x.w) >= 0.4).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 200);
  persist();
  return { before: merged.length, after: cache.length };
}
export function exportMem() { return JSON.stringify(load(), null, 2); }
export function importMem(text) { const a = JSON.parse(text); if (!Array.isArray(a)) throw new Error("bad"); cache = a; persist(); }
export function reset() { cache = []; persist(); }