// Построчный diff (LCS) + группировка в ханки + Markdown-отчёт.
export function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  if (n * m > 2_000_000) {
    return [
      ...A.map((text, i) => ({ t: "-", a: i + 1, text })),
      ...B.map((text, j) => ({ t: "+", b: j + 1, text }))
    ];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: "=", a: i + 1, b: j + 1, text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", a: i + 1, text: A[i] }); i++; }
    else { ops.push({ t: "+", b: j + 1, text: B[j] }); j++; }
  }
  while (i < n) { ops.push({ t: "-", a: i + 1, text: A[i] }); i++; }
  while (j < m) { ops.push({ t: "+", b: j + 1, text: B[j] }); j++; }
  return ops;
}

export function hunks(ops, ctx = 2) {
  const mark = new Set();
  ops.forEach((o, i) => {
    if (o.t === "=") return;
    for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) mark.add(k);
  });
  const out = [];
  let cur = null;
  ops.forEach((o, i) => {
    if (!mark.has(i)) { cur = null; return; }
    if (!cur) { cur = []; out.push(cur); }
    cur.push(o);
  });
  return out;
}

const LV = { crit: "критично", warn: "warning", info: "замечание" };

export function mdReport(res, name = "fixed.lua") {
  const L = [];
  L.push(`# Отчёт об исправлениях: ${name}`, "");
  L.push(`Замечаний: **${res.before.length} → ${res.after.length}** · проходов: ${res.passes.length} · правок: ${res.changes.length}`, "");
  if (!res.changes.length) L.push("Изменений не потребовалось.", "");
  for (const c of res.changes) {
    L.push(`## ${c.rule} — ${c.title}`, "");
    L.push(`Проход ${c.pass} · уровень: ${LV[c.level] || c.level}`, "");
    if (c.problem) L.push(`**Что было не так.** ${c.problem}`, "");
    if (c.action) L.push(`**Что сделано.** ${c.action}`, "");
    if (c.why) L.push(`**Почему именно так.** ${c.why}`, "");
    if (c.refs?.length) L.push(`**Опора:** ${c.refs.join(", ")}`, "");
    for (const h of c.hunks) {
      L.push("```diff");
      for (const o of h) L.push((o.t === "=" ? "  " : o.t === "-" ? "- " : "+ ") + o.text);
      L.push("```", "");
    }
  }
  if (res.after.length) {
    L.push("## Осталось", "");
    for (const x of res.after) L.push(`- **${x.id}** (${LV[x.level]}, строка ${x.line}): ${x.msg}${x.fix ? ` → ${x.fix}` : ""}`);
    L.push("");
  }
  if (res.manual.length) {
    L.push("## Требует ручного решения", "");
    for (const m of res.manual) L.push(`- ${m.title}: ${m.note}`);
  }
  return L.join("\n");
}