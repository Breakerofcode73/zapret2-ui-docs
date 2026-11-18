import { assess } from "../intent";
import { matchStrategies, synthesize } from "../synth";
import { strength } from "./learn";

const W = { cover: 0.34, feas: 0.26, trust: 0.14, simple: 0.10, used: 0.10, learned: 0.06 };

function variantSet(ops, ctx) {
  const has = o => ops.includes(o);
  const out = [{ ops, ctx, tag: "как задумано" }];
  const dies = has("ttl") || has("badsum") || has("ipdst");
  if ((has("invert") || has("reverse") || has("host") || has("ipdst")) && ctx.target === "original")
    out.push({ ops: [...new Set([...ops, "fake", "ttl", "badsum"])], ctx: { ...ctx, target: "fake" }, tag: "то же, но приманкой" });
  if (has("fake") && !dies)
    out.push({ ops: [...new Set([...ops, "ttl", "badsum"])], ctx, tag: "приманка с механизмом смерти" });
  if (has("split") && !has("disorder"))
    out.push({ ops: ops.map(o => o === "split" ? "disorder" : o), ctx, tag: "обратный порядок вместо прямого" });
  if (has("split") && !has("seqovl"))
    out.push({ ops: [...new Set([...ops, "seqovl"])], ctx, tag: "с перекрытием sequence" });
  if (has("split") && !has("random"))
    out.push({ ops: [...new Set([...ops, "random"])], ctx, tag: "случайная точка реза" });
  if (has("split") && has("disorder"))
    out.push({ ops: ops.filter(o => o !== "split"), ctx, tag: "убрать двойное разбиение" });
  if (has("pad") && ctx.transport === "tcp")
    out.push({ ops, ctx: { ...ctx, transport: "udp" }, tag: "изменение длины по UDP" });
  const seen = new Set();
  return out.filter(v => { const k = v.ops.slice().sort().join(",") + "|" + v.ctx.target + "|" + v.ctx.transport; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function optimize(ops, ctx, { priors, trustAvg = 0.75 }) {
  if (!ops.length) return { best: null, rows: [] };
  const want = new Set(ops);
  const rows = [];

  matchStrategies(ops, ctx).forEach(m => {
    const cover = m.covered.length / want.size;
    const used = priors.get(m.name) || 0;
    const trust = m.source === "antidpi" ? 0.95 : 0.8;
    const parts = {
      cover: cover * W.cover,
      feas: (m.missing.length ? 0.7 : 1) * W.feas,
      trust: trust * W.trust,
      simple: Math.max(0, 1 - m.provides.length / 12) * W.simple,
      used: Math.min(1, used / 4) * W.used,
      learned: Math.min(1, strength(m.name) / 3) * W.learned
    };
    rows.push({ kind: "ready", name: m.name, source: m.source, ops: m.covered, missing: m.missing, extra: m.extra,
      ctx, used, parts, score: Object.values(parts).reduce((a, b) => a + b, 0), verdict: "ok", blocking: [], probes: [] });
  });

  variantSet(ops, ctx).forEach(v => {
    const a = assess(v.ops, v.ctx);
    if (a.verdict === "no") {
      rows.push({ kind: "new", name: null, ops: v.ops, ctx: v.ctx, tag: v.tag, verdict: "no",
        blocking: a.blocking.map(b => b.op), probes: [], parts: null, score: -1, used: 0 });
      return;
    }
    const b = synthesize(v.ops, v.ctx, v.ctx.name || "my_ai");
    const lines = b.code.split("\n").length;
    const cover = [...want].filter(o => v.ops.includes(o)).length / want.size;
    const parts = {
      cover: Math.min(1, cover) * W.cover,
      feas: (a.verdict === "probe" ? 0.62 : 1) * W.feas,
      trust: trustAvg * W.trust,
      simple: Math.max(0, 1 - (v.ops.length / 9 + lines / 260) / 2) * W.simple,
      used: 0,
      learned: Math.min(1, v.ops.reduce((s, o) => s + strength(o), 0) / 6) * W.learned
    };
    rows.push({ kind: "new", name: b.name, tag: v.tag, ops: v.ops, ctx: v.ctx, build: b, verdict: a.verdict,
      blocking: [], probes: a.probes.map(p => p.op), parts, score: Object.values(parts).reduce((x, y) => x + y, 0), used: 0 });
  });

  rows.sort((a, b) => b.score - a.score);
  const viable = rows.filter(r => r.score >= 0);
  const best = viable[0] || null;
  const second = viable[1] || null;
  let why = null;
  if (best && second) {
    const diff = Object.keys(best.parts || {}).map(k => ({ k, d: (best.parts[k] || 0) - (second.parts?.[k] || 0) }))
      .sort((a, b) => b.d - a.d).filter(x => x.d > 0.005).slice(0, 3);
    const NAME = { cover: "полнота замысла", feas: "реализуемость", trust: "доверие к источнику", simple: "простота", used: "уже работает в твоём конфиге", learned: "ты подтверждал раньше" };
    why = diff.map(x => NAME[x.k]).join(", ") || "минимальный перевес — варианты почти равноценны";
  }
  return { best, second, rows: rows.slice(0, 8), why, weights: W };
}