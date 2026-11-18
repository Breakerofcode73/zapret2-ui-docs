const STOP = new Set(("и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам сказал ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между хочу нужно сделать сделай создать добавить применить использовать плюс затем ещё еще очень просто мой моя моё запрос запроса пакет пакета ответ ответа трафик трафика функция функцию новый новая код скрипт").split(/\s+/));
const END = /(ий|ый|ая|яя|ое|ее|ые|ие|ами|ями|ах|ях|ов|ев|ей|ом|ем|ам|ям|ах|ого|его|ому|ему|ыми|ими|ость|ости|ей|у|ю|а|я|ы|и|е|о|ь|й|ся|ть|ти|ешь|ет|ут|ют)$/;

export function stem(w) {
  if (/^[a-z_][a-z0-9_]*$/.test(w) && w.includes("_")) return w;
  if (/^[a-z0-9]+$/.test(w)) return w;
  return w.length > 4 ? w.replace(END, "") : w;
}
export function tokens(text) {
  return String(text || "").toLowerCase().replace(/ё/g, "е")
    .split(/[^a-zа-я0-9_+]+/).filter(w => w.length > 1 && !STOP.has(w)).map(stem);
}
const grams = s => { const g = new Set(); const t = s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " "); for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3)); return g; };
export function fuzzy(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(g => { if (B.has(g)) n++; }); return n / Math.sqrt(A.size * B.size); }

export function buildIndex(docs) {
  const tf = docs.map(d => {
    const t = tokens(d.text); const m = new Map();
    t.forEach(w => m.set(w, (m.get(w) || 0) + 1));
    return { len: t.length, m };
  });
  const df = new Map();
  tf.forEach(x => x.m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length, avg = tf.reduce((s, x) => s + x.len, 0) / Math.max(1, N);
  const idf = new Map();
  df.forEach((n, w) => idf.set(w, Math.log(1 + (N - n + 0.5) / (n + 0.5))));
  return { docs, tf, idf, avg, N };
}

export function search(index, query, k = 12, weights = null) {
  const q = tokens(query);
  if (!q.length) return [];
  const k1 = 1.5, b = 0.75;
  const out = index.docs.map((d, i) => {
    const { len, m } = index.tf[i];
    let s = 0; const hits = [];
    q.forEach(w => {
      const f = m.get(w); if (!f) return;
      const idf = index.idf.get(w) || 0;
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len / index.avg));
      hits.push(w);
    });
    if (weights) s *= weights(d) || 1;
    return { doc: d, score: s, hits };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}