import { STRAT_PROVIDES } from "./strategyMap";

// Рёбра знаний: подтверждённые зависимости и конфликты. Не выводятся статистически.
const DEPEND = [["seqovl", "split"], ["random", "split"], ["pos", "split"], ["host", "fake"], ["invert", "fake"], ["reverse", "fake"], ["ipdst", "fake"], ["ttl", "fake"], ["badsum", "fake"], ["md5", "fake"]];
const CONFLICT = [["oob", "fake"], ["oob", "split"], ["oob", "disorder"], ["oob", "dup"], ["split", "disorder"], ["pad", "split"], ["pad", "disorder"]];

export function buildGraph(docs) {
  const nodes = new Map(), edges = new Map();
  const node = (id, kind, label) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label, deg: 0 }); return nodes.get(id); };
  const link = (a, b, w, type) => {
    const k = a < b ? a + "|" + b : b + "|" + a;
    const e = edges.get(k) || { a, b, w: 0, type };
    e.w += w; e.type = type === "conflict" ? "conflict" : e.type; edges.set(k, e);
    node(a, "x", a).deg++; node(b, "x", b).deg++;
  };
  Object.keys(STRAT_PROVIDES).forEach(fn => {
    node("f:" + fn, "fn", fn);
    STRAT_PROVIDES[fn].forEach(op => { node("o:" + op, "op", op); link("f:" + fn, "o:" + op, 1, "provides"); });
    const ops = STRAT_PROVIDES[fn];
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) link("o:" + ops[i], "o:" + ops[j], 0.35, "cooccur");
  });
  DEPEND.forEach(([a, b]) => { node("o:" + a, "op", a); node("o:" + b, "op", b); link("o:" + a, "o:" + b, 0.8, "depend"); });
  CONFLICT.forEach(([a, b]) => link("o:" + a, "o:" + b, -1, "conflict"));
  docs.filter(d => d.kind === "marker").forEach(d => { node("m:" + d.meta.marker, "marker", d.meta.marker); link("m:" + d.meta.marker, "o:split", 0.5, "used-by"); link("m:" + d.meta.marker, "o:pos", 0.5, "used-by"); });
  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push({ to: e.b, w: e.w, type: e.type });
    adj.get(e.b).push({ to: e.a, w: e.w, type: e.type });
  });
  return { nodes, edges, adj };
}

// распространение активации от выбранных операций, 2 шага с затуханием
export function activate(graph, ops, steps = 2) {
  let act = new Map();
  ops.forEach(o => act.set("o:" + o, 1));
  for (let s = 0; s < steps; s++) {
    const next = new Map(act);
    act.forEach((v, id) => {
      (graph.adj.get(id) || []).forEach(e => {
        if (e.type === "conflict") return;
        const add = v * Math.max(0, e.w) * 0.45;
        next.set(e.to, (next.get(e.to) || 0) + add);
      });
    });
    act = next;
  }
  const conflicts = [];
  ops.forEach(o => (graph.adj.get("o:" + o) || []).forEach(e => {
    if (e.type === "conflict" && ops.includes(e.to.replace(/^o:/, ""))) conflicts.push([o, e.to.replace(/^o:/, "")]);
  }));
  const suggest = [...act.entries()].filter(([id]) => id.startsWith("o:") && !ops.includes(id.slice(2)))
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ op: id.slice(2), score: v }));
  const related = [...act.entries()].filter(([id]) => id.startsWith("f:"))
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ fn: id.slice(2), score: v }));
  return { suggest, related, conflicts };
}

export function clusters(graph) {
  // LPA-лайт: метка = самая частая метка соседей, 6 итераций
  const label = new Map(); let i = 0;
  graph.nodes.forEach((_, id) => label.set(id, i++));
  for (let it = 0; it < 6; it++) {
    let changed = 0;
    graph.nodes.forEach((_, id) => {
      const cnt = new Map();
      (graph.adj.get(id) || []).forEach(e => { if (e.w > 0) cnt.set(label.get(e.to), (cnt.get(label.get(e.to)) || 0) + e.w); });
      if (!cnt.size) return;
      const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (best !== label.get(id)) { label.set(id, best); changed++; }
    });
    if (!changed) break;
  }
  const groups = new Map();
  label.forEach((l, id) => { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(id); });
  return [...groups.values()].filter(g => g.length > 2).sort((a, b) => b.length - a.length).slice(0, 8);
}