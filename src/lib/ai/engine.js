import { buildCorpus } from "./corpus";
import { buildIndex, search, tokens } from "./tfidf";
import { buildGraph, activate, clusters } from "./graph";
import { bias as memBias, recall, remember } from "./memory";
import * as L from "./learn";
import { study, coocBoost } from "./study";
import { buildVariants } from "./variants";
import { OPS, assess } from "../intent";
import { synthesize } from "../synth";
import { checkLua } from "../checkLua";
import { fns as capi } from "../../pages/CApi";
import { fns as lib } from "../../pages/Lib";
import { fns as antidpi } from "../../pages/Antidpi";
import { fns as auto } from "../../pages/Auto";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
let E = null;

export function engine() {
  if (E) return E;
  const base = buildCorpus();
  const S = study();
  const seen = new Set();
  const docs = [...(base.docs || base), ...S.docs].filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
  const graph = buildGraph(docs);
  E = { docs, index: buildIndex(docs), graph, study: S };
  E.clusters = clusters(graph);
  return E;
}
export function rebuild() { E = null; return engine(); }
export function studyStats() { return engine().study.stats; }
export function studyMap() { const e = engine(); return { bySource: e.study.bySource, docs: e.docs, templates: e.study.templates, priors: e.study.priors }; }

const FLOOR = 0.8;
export function interpret(phrase, ctx = { target: "original", transport: "tcp", name: "my_ai", payload: "tls_client_hello" }, forced = null) {
  const eng = engine();
  const trace = [];
  const tk = tokens(phrase);
  const frames = L.matchFrames(phrase);
  trace.push({ id: "norm", title: "Нормализация и рамки", detail: `${tk.length} токенов, ${frames.length} абстрактных рамок`,
    data: [...tk.slice(0, 12).map(t => "токен: " + t), ...frames.map(f => `рамка «${f.label}» → ${f.ops.join(",")}`)] });

  const mem = recall(phrase);
  const mb = memBias(phrase);
  const learned = L.scores(phrase);
  const st = L.stats();
  trace.push({ id: "learn", title: "Обученная модель", detail: `${st.events} подтверждений, ${st.features} признаков`,
    data: [...learned.out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([op, s]) => `${op}: ${s.toFixed(2)} — ${(learned.why.get(op) || []).map(c => `${c.f}(${c.w.toFixed(2)})`).join(" ")}`) });

  const weights = d => d.kind === "op" ? 1.3 : d.kind === "lore" ? 1.2 : d.kind === "template" ? 1.18 : d.kind === "lesson" ? 1.15
    : d.kind === "profile" ? 1.12 : d.kind === "state" ? 1.12 : d.kind === "pitfall" ? 1.1 : 1;
  const raw = search(eng.index, phrase, 30, weights);
  const opHits = raw.filter(r => r.doc.kind === "op");
  const bestBm = opHits[0]?.score || 0;
  const lmax = Math.max(0.001, ...[...learned.out.values()].map(Math.abs));
  const cand = Object.keys(OPS).map(op => {
    const bm = opHits.find(r => r.doc.meta.op === op);
    const bmS = bm ? bm.score : 0;
    const lS = learned.out.get(op) || 0;
    const frameS = frames.some(f => f.ops.includes(op)) ? bestBm * 0.42 : 0;
    const memS = (mb.get(op) || 0) * bestBm * 0.5;
    const trainW = Math.min(0.85, st.events / 12);
    return { op, score: bmS + frameS + memS + (lS / lmax) * bestBm * trainW, bm: bmS, frame: frameS, mem: memS,
      learn: (lS / lmax) * bestBm * trainW, hits: bm?.hits || [], trust: bm?.doc.trust || 0.6, src: bm?.doc.meta.src || "authored" };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

  const top = cand[0]?.score || 0;
  const picked = forced || cand.filter(c => c.score >= Math.max(FLOOR, top * 0.2)).slice(0, 5).map(c => c.op);
  trace.push({ id: "retrieve", title: "Поиск по изученному", detail: `${raw.length} совпадений из ${eng.docs.length} документов`,
    data: raw.slice(0, 10).map(r => `${r.doc.kind}:${r.doc.title} — ${r.score.toFixed(2)} · ${r.doc.meta.note || ""}`) });

  const act = activate(eng.graph, picked);
  act.suggest = act.suggest.map(s => ({ ...s, score: s.score + picked.reduce((a, o) => a + coocBoost(eng.study.cooc, o, s.op), 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  trace.push({ id: "graph", title: "Граф и опыт конфига", detail: `${eng.graph.nodes.size} узлов, ${eng.study.templates.length} проверенных цепочек`,
    data: [...act.suggest.map(s => `рядом: ${s.op} (${s.score.toFixed(2)})`), ...act.conflicts.map(c => `конфликт: ${c[0]} ↔ ${c[1]}`)] });

  const ambiguous = cand.slice(1).filter(c => c.score > top * 0.8 && !picked.includes(c.op));
  const shiftFrame = frames.find(f => f.ambiguous);
  let question = null;
  if (shiftFrame && !picked.some(o => ["seqovl", "ts", "pos"].includes(o)))
    question = { text: "Сдвиг чего именно?", options: shiftFrame.ops.map(o => ({ op: o, label: OPS[o].label })), why: shiftFrame.why };
  else if (ambiguous.length && top > 0 && cand[0].score / Math.max(0.01, ambiguous[0].score) < 1.25)
    question = { text: "Что ближе к замыслу?", options: [cand[0], ambiguous[0]].map(c => ({ op: c.op, label: OPS[c.op]?.label })), why: "Два варианта почти равноценны — молча выбирать нельзя." };

  const covered = new Set(raw.flatMap(r => r.hits));
  const unknown = tk.filter(w => !covered.has(w) && w.length > 2 && !frames.some(f => f.re.test(w)));
  const verdict = assess(picked, ctx);
  trace.push({ id: "resolve", title: "Разрешение замысла", detail: `${picked.length} операций, ${ambiguous.length} спорных, ${unknown.length} нераспознанных`,
    data: picked.map(o => `взято: ${o} — ${OPS[o]?.label}`) });
  trace.push({ id: "verify", title: "Проверка реализуемости", detail: verdict.verdict === "no" ? `${verdict.blocking.length} блокирующих` : verdict.verdict === "probe" ? `${verdict.probes.length} требуют дампа` : "все операции реализуемы",
    data: verdict.items.map(i => `${i.op}: ${i.level}`) });

  const V = buildVariants(picked, ctx, eng.study);
  trace.push({ id: "variants", title: "Варианты из изученного", detail: `${V.rows.filter(r => r.score >= 0).length} допустимых из ${V.rows.length}`,
    data: V.rows.slice(0, 6).map(r => `${r.origin} · ${r.title} — ${r.score < 0 ? "нельзя" : (r.score * 100).toFixed(0) + "%"} · ${r.source || ""}`) });

  const build = V.best?.build || (picked.length && verdict.verdict !== "no" ? synthesize(picked, ctx, ctx.name || "my_ai") : null);
  const chk = build ? checkLua(build.code, KNOWN) : null;
  trace.push({ id: "synth", title: "Код выбранного варианта", detail: build ? `${build.code.split("\n").length} строк, ${chk.issues.length} замечаний` : "готовая стратегия не требует генерации" });

  const margin = top > 0 ? (top - (cand[1]?.score || 0)) / top : 0;
  const confidence = Math.max(0, Math.min(1, 0.2 + 0.45 * margin + 0.35 * Math.min(1, st.events / 10)));
  return { phrase, ctx, ops: picked, cand: cand.slice(0, 8), ambiguous, unknown, verdict, variants: V, build, chk, trace,
    graph: act, confidence, question, frames, learned, evidence: raw.slice(0, 12) };
}

export function feedback(res, sign) { remember(res.phrase, res.ops, res.ctx, sign); L.train(res.phrase, res.ops, sign); rebuild(); }
export function teach(text, ops) { remember(text, ops, {}, 1); L.train(text, ops, 1); rebuild(); }
export function answer(res, op) {
  const ops = [...new Set([...res.ops.filter(o => !["seqovl", "ts", "pos"].includes(o)), op])];
  L.train(res.phrase, ops, 1); remember(res.phrase, ops, res.ctx, 1); rebuild(); return ops;
}

const AUTHORED = [
  { p: "фейк с низким ttl и битой суммой", want: ["fake", "ttl", "badsum"] },
  { p: "разрезать запрос внутри имени хоста в случайной точке", want: ["split", "random"] },
  { p: "разрез в обратном порядке с перекрытием", want: ["disorder", "seqovl"] },
  { p: "подменить адрес получателя у копии и занизить ttl", want: ["ipdst", "ttl"] },
  { p: "увеличить длину udp пакета на восемь байт", want: ["pad"] },
  { p: "сдвинуть timestamp у оригинала", want: ["ts"] },
  { p: "инвертировать байты чтобы получился мусор", want: ["invert"] },
  { p: "заблокировать пакет", want: ["drop"] },
  { p: "подставить чужой домен вместо настоящего", want: ["host"] },
  { p: "чтобы провайдер думал что это мусор, а настоящий запрос ушёл нетронутым", want: ["fake", "invert"] },
  { p: "сломать сигнатуру по смещению непредсказуемо", want: ["split", "random"] },
  { p: "копия должна умереть по пути не дойдя до сервера", want: ["ttl", "badsum"] }
];
export function exam() {
  const run = (cases, group) => cases.map(c => {
    const r = interpret(c.p);
    const got = new Set(r.ops), want = new Set(c.want);
    const tp = [...want].filter(o => got.has(o)).length;
    const extra = [...got].filter(o => !want.has(o));
    return { ...c, group, got: r.ops, miss: [...want].filter(o => !got.has(o)), extra,
      ok: tp === want.size && extra.length === 0, recall: tp / want.size, precision: got.size ? tp / got.size : 0 };
  });
  const a = run(AUTHORED, "корпус"), b = run(L.holdout(10), "твои фразы");
  const rows = [...a, ...b];
  const avg = (arr, k) => arr.length ? arr.reduce((s, r) => s + r[k], 0) / arr.length : 0;
  return { rows, authored: { n: a.length, exact: a.filter(r => r.ok).length, recall: avg(a, "recall") },
    own: { n: b.length, exact: b.filter(r => r.ok).length, recall: avg(b, "recall") },
    gaps: rows.filter(r => !r.ok).map(r => ({ p: r.p, miss: r.miss, extra: r.extra, want: r.want })) };
}