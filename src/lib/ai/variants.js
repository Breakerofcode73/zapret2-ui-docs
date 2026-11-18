import { OPS, assess } from "../intent";
import { synthesize } from "../synth";
import { STRAT_PROVIDES } from "./strategyMap";
import { KIND_OF } from "./study";
import { strength } from "./learn";

const WHOLE = new Set(["split", "disorder", "host", "seg"]);
const SENDS = new Set([...WHOLE, "fake", "dup"]);
const W = { cover: 0.30, feas: 0.22, proof: 0.18, fit: 0.12, simple: 0.10, learned: 0.08 };
const CRIT = { cover: "полнота замысла", feas: "реализуемость", proof: "проверенность", fit: "совпадение контекста", simple: "простота", learned: "твои подтверждения" };
export const CRITERIA = CRIT;

const argStr = a => Object.entries(a || {}).map(([k, v]) => v === true ? k : `${k}=${v}`).join(":");
const inst = (fn, args) => ({ fn, args: args || {}, kind: KIND_OF[fn] || "custom" });

function chainOps(chain) {
  const set = new Set();
  chain.forEach(i => {
    (STRAT_PROVIDES[i.fn] || []).forEach(o => set.add(o));
    if (i.kind === "custom") {
      if (/fake/.test(i.fn)) { set.add("fake"); set.add("ttl"); set.add("ipdst"); }
      if (/split|disorder/.test(i.fn)) { set.add("split"); set.add("random"); set.add("pos"); }
    }
    if (i.args.ip_ttl) set.add("ttl");
    if (i.args.ip_dst) set.add("ipdst");
    if (i.args.badsum) set.add("badsum");
    if (i.args.seqovl) set.add("seqovl");
    if (i.args.tcp_ts) set.add("ts");
    if (i.args.host) set.add("host");
    if (i.args.increment) set.add("pad");
    if (i.args.repeats) set.add("repeat");
  });
  return [...set];
}

function chainRisk(chain) {
  const kinds = chain.map(i => i.kind === "custom" ? (/disorder/.test(i.fn) ? "disorder" : /split/.test(i.fn) ? "split" : /fake/.test(i.fn) ? "fake" : "custom") : i.kind);
  const risks = [], blocks = [];
  const whole = kinds.filter(k => WHOLE.has(k));
  if (whole.length > 1) blocks.push(`Двойное разбиение: ${chain.filter(i => WHOLE.has(i.kind) || /split|disorder/.test(i.fn)).map(i => i.fn).join(" → ")} отправят одно сообщение дважды.`);
  if (kinds.includes("oob") && kinds.some(k => SENDS.has(k))) blocks.push("oob вместе с отправкой целого пейлоада разрушает десинхронизацию.");
  const me = chain.findIndex(i => i.fn === "http_methodeol");
  if (me >= 0 && chain.slice(me + 1).some(i => i.kind === "host")) risks.push("http_methodeol стоит не последним среди http-функций.");
  if (kinds.filter(k => k === "fake").length > 1) risks.push("Больше одной приманки на сообщение — лишний трафик, выигрыш не гарантирован.");
  return { risks, blocks };
}

function score({ cover, feas, proof, fit, ops, chain, learned }) {
  const parts = {
    cover: Math.min(1, cover) * W.cover,
    feas: feas * W.feas,
    proof: proof * W.proof,
    fit: fit * W.fit,
    simple: Math.max(0, 1 - (chain.length / 5 + ops.length / 10) / 2) * W.simple,
    learned: Math.min(1, learned / 4) * W.learned
  };
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

function fitOf(transport, payload, ctx) {
  let f = transport === ctx.transport ? 1 : 0.25;
  if (payload && ctx.payload && payload.split(",").some(p => ctx.payload.includes(p))) f = (f + 1) / 2;
  return f;
}

export function buildVariants(ops, ctx, S) {
  if (!ops.length) return { rows: [], best: null, why: null, criteria: CRIT };
  const want = new Set(ops);
  const rows = [];
  const push = r => {
    const { risks, blocks } = chainRisk(r.chain);
    const union = [...new Set([...ops, ...chainOps(r.chain)])];
    const a = assess(union, r.ctx);
    const allBlocks = [...blocks, ...a.blocking.map(b => `${b.op}: ${b.why}`)];
    const feas = allBlocks.length ? 0 : a.verdict === "probe" ? 0.62 : 1;
    const learned = union.reduce((s, o) => s + strength(o), 0) + strength(r.chain[0]?.fn || "");
    const sc = score({ cover: r.cover, feas, proof: r.proof, fit: r.fit, ops: union, chain: r.chain, learned });
    rows.push({ ...r, ops: union, risks: [...risks, ...a.probes.map(p => `${p.op}: нужен дамп — ${p.why}`)],
      blocks: allBlocks, verdict: allBlocks.length ? "no" : a.verdict, parts: sc.parts,
      score: allBlocks.length ? -1 : sc.total, assessment: a.items });
  };

  // 1. Проверенные цепочки из твоего конфига
  S.templates.forEach((t, i) => {
    const covered = [...want].filter(o => t.ops.includes(o));
    if (!covered.length) return;
    push({ id: "tpl" + i, origin: "config", title: t.chain.map(c => c.fn).join(" → "),
      chain: t.chain.map(c => inst(c.fn, c.args)), ctx: { ...ctx, transport: t.transport },
      cover: covered.length / want.size, proof: Math.min(1, 0.7 + t.count * 0.12), fit: fitOf(t.transport, t.payload, ctx),
      source: `Работает в ${t.count} профиле(ях): ${t.profiles.join(", ")}`,
      evidence: [{ kind: "template", title: t.key, note: "цепочка из конфига", refs: ["run"] }],
      missing: [...want].filter(o => !t.ops.includes(o)) });
  });

  // 2. Штатные стратегии
  Object.entries(STRAT_PROVIDES).forEach(([fn, provides]) => {
    const covered = [...want].filter(o => provides.includes(o));
    if (!covered.length) return;
    const args = {};
    if (provides.includes("ttl") && ops.includes("ttl")) args.ip_ttl = ctx.ttl || 4;
    if (provides.includes("badsum") && ops.includes("badsum")) args.badsum = true;
    if (provides.includes("seqovl") && ops.includes("seqovl")) args.seqovl = ctx.seqovl || 5;
    if (provides.includes("split") && ops.includes("pos")) args.pos = ctx.pos || "1,host,midsld+1";
    if (provides.includes("host") && ops.includes("host")) args.host = "www.google.com";
    if (provides.includes("pad")) args.increment = 8;
    const used = S.priors.get(fn) || 0;
    push({ id: "s:" + fn, origin: "antidpi", title: fn, chain: [inst(fn, args)], ctx,
      cover: covered.length / want.size, proof: used ? 0.95 : 0.85, fit: 1,
      source: used ? `Штатная стратегия, уже используется ${used} раз в твоём конфиге` : "Штатная стратегия zapret-antidpi",
      evidence: [{ kind: "strategy", title: fn, note: "подтверждена исходниками", refs: ["antidpi", "deep/" + fn] }],
      missing: [...want].filter(o => !provides.includes(o)) });
  });

  // 3. Твои функции
  S.docs.filter(d => d.kind === "state").forEach(d => {
    const fn = d.meta.fn;
    const provides = /fake/.test(fn) ? ["fake", "ttl", "ipdst", "ipid", "repeat", "ts"]
      : /disorder/.test(fn) ? ["disorder", "seqovl", "pos", "random"]
      : /split/.test(fn) ? ["split", "seqovl", "pos", "random"] : [];
    const covered = [...want].filter(o => provides.includes(o));
    if (!covered.length) return;
    const args = {};
    if (provides.includes("ipdst")) args.ip_dst = ctx.ipdst || "192.0.2.1";
    if (provides.includes("ttl")) args.ip_ttl = ctx.ttl || 2;
    if (provides.includes("seqovl") && ops.includes("seqovl")) args.seqovl = ctx.seqovl || 5;
    const used = S.priors.get(fn) || 0;
    push({ id: "v:" + fn, origin: "vault", title: fn, chain: [inst(fn, args)], ctx,
      cover: covered.length / want.size, proof: used ? 0.9 : d.trust, fit: 1,
      source: used ? `Твоя функция, работает в ${used} инстансах конфига` : `Твоя функция из ${d.meta.file}`,
      evidence: [{ kind: "state", title: fn, note: d.meta.note, refs: ["myapi"] }],
      missing: [...want].filter(o => !provides.includes(o)) });
  });

  // 4. Синтез новых функций и гибридов
  const has = o => ops.includes(o);
  const dies = has("ttl") || has("badsum") || has("ipdst");
  const synth = [
    { ops, ctx, tag: "как задумано" },
    ...(has("invert") || has("reverse") || has("host") || has("ipdst")) && ctx.target === "original"
      ? [{ ops: [...new Set([...ops, "fake", "ttl", "badsum"])], ctx: { ...ctx, target: "fake" }, tag: "приманка вместо правки оригинала" }] : [],
    ...(has("fake") && !dies ? [{ ops: [...new Set([...ops, "ttl", "badsum"])], ctx, tag: "приманка с механизмом смерти" }] : []),
    ...(has("split") && !has("disorder") ? [{ ops: ops.map(o => o === "split" ? "disorder" : o), ctx, tag: "обратный порядок частей" }] : []),
    ...(has("split") && !has("seqovl") ? [{ ops: [...new Set([...ops, "seqovl"])], ctx, tag: "с перекрытием sequence" }] : []),
    ...(has("split") && !has("random") ? [{ ops: [...new Set([...ops, "random"])], ctx, tag: "случайная точка реза" }] : []),
    ...(has("pad") && ctx.transport === "tcp" ? [{ ops, ctx: { ...ctx, transport: "udp" }, tag: "изменение длины по UDP" }] : [])
  ];
  const seen = new Set();
  synth.forEach((v, i) => {
    const key = v.ops.slice().sort().join(",") + "|" + v.ctx.target + "|" + v.ctx.transport;
    if (seen.has(key)) return; seen.add(key);
    const a = assess(v.ops, v.ctx);
    if (a.verdict === "no") {
      rows.push({ id: "n" + i, origin: "synth", title: v.tag, chain: [], ops: v.ops, ctx: v.ctx, verdict: "no",
        blocks: a.blocking.map(b => `${b.op}: ${b.why}`), risks: [], parts: null, score: -1, evidence: [], missing: [], cover: 0 });
      return;
    }
    const b = synthesize(v.ops, v.ctx, (ctx.name || "my_ai") + "_" + (i + 1));
    push({ id: "n" + i, origin: "synth", title: b.name, tag: v.tag, chain: [inst(b.name, {})], ctx: v.ctx,
      cover: [...want].filter(o => v.ops.includes(o)).length / want.size, proof: 0.55, fit: 1,
      source: "Новая функция, собрана из проверенных блоков", build: b,
      evidence: [{ kind: "lore", title: "Каркас desync-функции", note: "порядок守卫 → данные → replay → действие → вердикт", refs: ["contract", "writing"] }],
      missing: [...want].filter(o => !v.ops.includes(o)) });
  });

  // 5. Гибрид: приманка + лучшая сегментация
  if (has("fake") && (has("split") || has("disorder"))) {
    const seg = has("disorder") ? "multidisorder" : "multisplit";
    const fakeFn = S.priors.has("fake_ip_misdirection") ? "fake_ip_misdirection" : "fake";
    const chain = fakeFn === "fake"
      ? [inst("fake", { blob: ctx.blob || "fake_default_tls", ip_ttl: ctx.ttl || 4, badsum: true }), inst(seg, { pos: ctx.pos || "1,host,midsld+1", seqovl: ctx.seqovl || 5 })]
      : [inst("fake_ip_misdirection", { ip_dst: ctx.ipdst || "192.0.2.1", ip_ttl: ctx.ttl || 2 }), inst(seg, { pos: ctx.pos || "1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1" })];
    push({ id: "hybrid", origin: "hybrid", title: chain.map(c => c.fn).join(" → "), chain, ctx,
      cover: 1, proof: 0.88, fit: 1, source: "Порядок из твоих рабочих профилей: приманка первой, разрез вторым",
      evidence: [{ kind: "lore", title: "Порядок инстансов", note: "фейк перед разрезом", refs: ["checklist", "run"] }], missing: [] });
  }

  const viable = rows.filter(r => r.score >= 0).sort((a, b) => b.score - a.score);
  const uniq = []; const sig = new Set();
  [...viable, ...rows.filter(r => r.score < 0)].forEach(r => {
    const k = r.chain.map(c => c.fn + ":" + argStr(c.args)).join(">") || r.title;
    if (sig.has(k)) return; sig.add(k); uniq.push(r);
  });
  const best = uniq.find(r => r.score >= 0) || null;
  const second = uniq.filter(r => r.score >= 0)[1] || null;
  let why = null;
  if (best && second) {
    const d = Object.keys(best.parts).map(k => ({ k, d: best.parts[k] - second.parts[k] })).sort((a, b) => b.d - a.d).filter(x => x.d > 0.004).slice(0, 3);
    why = d.map(x => CRIT[x.k]).join(", ") || "варианты почти равноценны";
  }
  return { rows: uniq.slice(0, 7), best, second, why, criteria: CRIT };
}

export function variantBat(v) {
  const payload = v.ctx.transport === "udp" ? "quic_initial" : "tls_client_hello";
  const filter = v.ctx.transport === "udp" ? "--filter-udp=443" : "--filter-tcp=443";
  const l7 = v.ctx.transport === "udp" ? "--filter-l7=quic" : "--filter-l7=tls";
  return [`--name="${v.title.slice(0, 48)}"`, filter, l7, `--payload=${payload}`,
    ...v.chain.map(c => `--lua-desync=${c.fn}${argStr(c.args) ? ":" + argStr(c.args) : ""}`)].join(" ^\n");
}

export function applyVariant(cfg, pi, v, mode) {
  if (!cfg.found) return "";
  const out = [];
  cfg.global.tokens.forEach(t => out.push(t.raw));
  const chainRaw = v.chain.map(c => `--lua-desync=${c.fn}${argStr(c.args) ? ":" + argStr(c.args) : ""}`);
  const emitProfile = p => {
    p.tokens.forEach(t => { if (mode === "replace" && t.flag === "--lua-desync") return; out.push(t.raw); });
    if (mode !== "new") chainRaw.forEach(r => out.push(r));
  };
  cfg.profiles.forEach((p, i) => {
    if (i > 0) out.push("--new");
    if (i === pi && mode !== "new") emitProfile(p);
    else p.tokens.forEach(t => out.push(t.raw));
  });
  if (mode === "new") {
    if (cfg.profiles.length) out.push("--new");
    variantBat(v).split(" ^\n").forEach(r => out.push(r.trim()));
  }
  const body = out.map((r, i) => (i === 0 ? cfg.prefix + " " + r : " " + r) + (i < out.length - 1 ? " ^" : ""));
  return [...cfg.lines.slice(0, cfg.start), ...body, ...cfg.lines.slice(cfg.end + 1)].join("\n");
}