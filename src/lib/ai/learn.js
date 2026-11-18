import { tokens } from "./tfidf";
import { OPS } from "../intent";

const KEY = "z2ai:learn:v1";
const OPKEYS = Object.keys(OPS);
const LR = 0.35, CLIP = 3.2, DECAY = 0.997;
let M = null;
const subs = new Set();

// Абстрактные рамки: структура фразы, а не конкретные слова.
// Привязка рамок к операциям авторская, но вес каждой связи обучается.
export const FRAMES = [
  { id: "subst", re: /(вместо|взамен|подмен\w*|подстав\w*|чужой|другой вместо)/, ops: ["fake", "host", "ipdst"], label: "подстановка одного вместо другого", why: "Рамка подстановки: что-то показывается вместо настоящего. В zapret2 это приманка или подмена поля в копии." },
  { id: "deceive", re: /(чтобы\s+(dpi|дпай|анализатор|провайдер|фильтр)\w*\s+(видел|думал|считал|решил|принял)|обман\w*|ввести в заблуждение|отвлечь внимание)/, ops: ["fake"], label: "ввести анализатор в заблуждение", why: "Рамка обмана: анализатор должен сделать вывод по подставным данным, пока настоящие проходят." },
  { id: "death", re: /(не\s+до(ш|шёл|шел|йдёт|йдет)|ум(ер|рёт|рет)|отброс\w*|не\s+принял|сдох\w*|погиб\w*|убить пакет)/, ops: ["ttl", "badsum", "ipdst"], label: "пакет должен умереть по пути", why: "Рамка смерти: копия обязана не дойти до сервера. Механизмы — короткий TTL, битая сумма, немаршрутизируемый адрес." },
  { id: "garbage", re: /(мусор|нечитаем\w*|нераспознаваем\w*|каш\w*|ерунд\w*|абракадабр\w*|бессмысл\w*|непонятн\w*)/, ops: ["invert", "fake"], label: "содержимое должно стать нечитаемым", why: "Рамка мусора: пейлоад теряет узнаваемую структуру. Инверсия байтов допустима только в копии, которая умрёт." },
  { id: "sig", re: /(сигнатур\w*|не\s+узнал|шаблон|смещен\w*|offset|привязк\w* к (месту|позиции))|сломать (шаблон|сигнатуру)/, ops: ["split", "pos", "random"], label: "сломать сигнатуру по смещению", why: "Рамка сигнатуры: анализатор ищет данные на фиксированных местах. Разрез в непредсказуемой точке ломает такую привязку." },
  { id: "reorder", re: /(порядок|перестав\w*|наоборот|зад\w* наперёд|сначала конец)/, ops: ["disorder"], label: "изменить порядок частей", why: "Рамка порядка: части приходят не по порядку, сборка потока усложняется." },
  { id: "overlap", re: /(нахлёст|нахлест|перекры\w*|повтор\w* байт|наложен\w*)/, ops: ["seqovl"], label: "перекрыть соседние части", why: "Рамка перекрытия: соседние сегменты содержат общие байты с разной нумерацией." },
  { id: "len", re: /(длин\w*|размер\w*|короче|длиннее|добав\w* байт|убав\w* байт)/, ops: ["pad"], label: "изменить размер", why: "Рамка размера: длина датаграммы меняется. Реализуемо только для UDP." },
  { id: "time", re: /(время|метк\w*|timestamp|тайм)/, ops: ["ts"], label: "изменить временную метку", why: "Рамка времени: сдвиг TCP timestamp — безопасное искажение, не влияет на нумерацию байтов." },
  { id: "shift", re: /(сдвиг|сдвин\w*|подвин\w*|смещ\w*)/, ops: ["seqovl", "ts", "pos"], label: "сдвиг чего-то", why: "Рамка сдвига без указания объекта: перекрытие sequence, timestamp или точка реза. Требует уточнения.", ambiguous: true },
  { id: "multi", re: /(несколько раз|повтор\w*|ещё раз|еще раз|пачк\w*|много копий)/, ops: ["repeat", "dup"], label: "сделать несколько раз", why: "Рамка кратности: повторы отправки или дубли пакета." },
  { id: "rand", re: /(случайн\w*|каждый раз по-новому|плавающ\w*|непредсказуем\w*|недетерминирован\w*)/, ops: ["random"], label: "непредсказуемость", why: "Рамка случайности: параметр меняется от соединения к соединению." },
  { id: "block", re: /(заблокир\w*|не пускать|запрет\w*|отбросить пакет|не выпускать)/, ops: ["drop"], label: "не пропустить пакет", why: "Рамка запрета: пакет не должен уйти в сеть." },
  { id: "copy", re: /(копи\w*|дубл\w*|клон\w*)/, ops: ["dup", "fake"], label: "сделать копию", why: "Рамка копии: работа идёт на дубликате, оригинал сохраняется." },
  { id: "keep", re: /(нетронут\w*|как есть|не трогать|сам ушёл|оригинал (прошёл|прошел|цел))|чтобы (сайт|запрос) работал/, ops: ["fake"], label: "оригинал должен дойти", why: "Рамка сохранности: воздействуем копией, оригинал проходит без изменений — это VERDICT_PASS." }
];

export function matchFrames(text) {
  const t = String(text || "").toLowerCase().replace(/ё/g, "е");
  return FRAMES.filter(f => f.re.test(t));
}
export function features(text) {
  const tk = tokens(text);
  const fr = matchFrames(text).map(f => "fr:" + f.id);
  const bg = [];
  for (let i = 0; i < tk.length - 1; i++) bg.push("bg:" + tk[i] + "_" + tk[i + 1]);
  return [...tk, ...fr, ...bg];
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch {} subs.forEach(f => f(M)); }
export function model() {
  if (M) return M;
  try { M = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { M = null; }
  if (!M || typeof M !== "object") M = { w: {}, bias: {}, pos: {}, neg: {}, events: [], n: 0 };
  return M;
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function stats() {
  const m = model();
  return { events: m.events.length, pos: m.events.filter(e => e.sign > 0).length, neg: m.events.filter(e => e.sign < 0).length,
    features: Object.keys(m.w).length, ops: Object.keys(m.bias).length, trained: m.n };
}

export function train(text, ops, sign = 1) {
  const m = model();
  const F = features(text);
  if (!F.length) return;
  const norm = 1 / Math.sqrt(F.length);
  const set = new Set(ops);
  OPKEYS.forEach(op => {
    const target = set.has(op) ? 1 : -0.35;
    m.bias[op] = (m.bias[op] || 0) + LR * sign * target * 0.4;
    F.forEach(f => {
      const k = f + "|" + op;
      const next = (m.w[k] || 0) + LR * sign * target * norm;
      m.w[k] = Math.max(-CLIP, Math.min(CLIP, next));
      const bucket = (sign * target > 0) ? m.pos : m.neg;
      bucket[k] = (bucket[k] || 0) + 1;
    });
  });
  Object.keys(m.w).forEach(k => { m.w[k] *= DECAY; if (Math.abs(m.w[k]) < 0.02) delete m.w[k]; });
  m.events.unshift({ text, ops, sign, at: Date.now() });
  m.events = m.events.slice(0, 300);
  m.n++;
  persist();
}

export function scores(text) {
  const m = model();
  const F = features(text);
  const out = new Map();
  const why = new Map();
  OPKEYS.forEach(op => {
    let s = m.bias[op] || 0;
    const contrib = [];
    F.forEach(f => {
      const w = m.w[f + "|" + op];
      if (!w) return;
      s += w;
      contrib.push({ f, w });
    });
    if (s !== 0) out.set(op, s);
    if (contrib.length) why.set(op, contrib.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 4));
  });
  return { out, why, frames: matchFrames(text) };
}

export function strength(op) {
  const m = model();
  return m.events.filter(e => e.sign > 0 && e.ops.includes(op)).length;
}

export function contradictions() {
  const m = model();
  const out = [];
  Object.keys(m.pos).forEach(k => {
    const p = m.pos[k], n = m.neg[k] || 0;
    if (p >= 2 && n >= 2 && Math.abs(p - n) <= 1) {
      const [f, op] = k.split("|");
      out.push({ f, op, p, n, w: m.w[k] || 0 });
    }
  });
  return out.sort((a, b) => (b.p + b.n) - (a.p + a.n)).slice(0, 12);
}
export function resolve(f, op, keep) {
  const m = model();
  const k = f + "|" + op;
  if (keep) { m.neg[k] = 0; m.w[k] = Math.abs(m.w[k] || 0.5); }
  else { m.pos[k] = 0; m.w[k] = -Math.abs(m.w[k] || 0.5); }
  persist();
}
export function topWeights(limit = 18) {
  const m = model();
  return Object.entries(m.w).map(([k, w]) => { const [f, op] = k.split("|"); return { f, op, w }; })
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, limit);
}
export function consolidate() {
  const m = model();
  const before = Object.keys(m.w).length;
  const seen = new Map();
  m.events.forEach(e => {
    const k = e.text.toLowerCase().trim();
    if (!seen.has(k)) seen.set(k, e);
    else { seen.get(k).sign += e.sign; seen.get(k).at = Math.max(seen.get(k).at, e.at); }
  });
  m.events = [...seen.values()].slice(0, 200);
  Object.keys(m.w).forEach(k => { m.w[k] *= 0.92; if (Math.abs(m.w[k]) < 0.08) delete m.w[k]; });
  persist();
  return { before, after: Object.keys(m.w).length, events: m.events.length };
}
export function holdout(n = 10) {
  const m = model();
  const good = m.events.filter(e => e.sign > 0);
  const step = Math.max(1, Math.floor(good.length / n));
  return good.filter((_, i) => i % step === 0).slice(0, n).map(e => ({ p: e.text, want: e.ops }));
}
export function exportModel() { return JSON.stringify(model(), null, 2); }
export function importModel(text) { const o = JSON.parse(text); if (!o || !o.w) throw new Error("bad"); M = o; persist(); }
export function resetModel() { M = { w: {}, bias: {}, pos: {}, neg: {}, events: [], n: 0 }; persist(); }