// Цикл: не понял -> спросил -> выучил -> в следующий раз понимает без вопроса.
import { interpret, feedback, rebuild } from "./engine";
import * as L from "./learn";
import * as M from "./memory";
import { OPS } from "../intent";
import { tokens } from "./tfidf";

const LEX = "z2ai:lex:v1";
const LOG = "z2ai:tutor:v1";

function lex() { try { return JSON.parse(localStorage.getItem(LEX) || "{}"); } catch { return {}; } }
function lexSave(o) { try { localStorage.setItem(LEX, JSON.stringify(o)); } catch { /* ignore */ } }
export function lexicon() {
  return Object.entries(lex()).map(([w, v]) => ({ word: w, ...v })).sort((a, b) => b.n - a.n || b.at - a.at);
}
export function teachWord(word, ops) {
  const w = String(word || "").toLowerCase().trim();
  if (!w || !ops || !ops.length) return null;
  const o = lex(), cur = o[w] || { ops: [], n: 0, at: 0 };
  o[w] = { ops: Array.from(new Set(cur.ops.concat(ops))), n: cur.n + 1, at: Date.now() };
  lexSave(o); return o[w];
}
export function forgetWord(word) { const o = lex(); delete o[String(word).toLowerCase().trim()]; lexSave(o); }

function log() { try { return JSON.parse(localStorage.getItem(LOG) || "[]"); } catch { return []; } }
function push(e) { try { const a = log(); a.unshift({ ...e, at: Date.now() }); localStorage.setItem(LOG, JSON.stringify(a.slice(0, 300))); } catch { /* ignore */ } }
export function dialog(limit) { return log().slice(0, limit || 40); }

export function understanding(res, threshold) {
  const th = threshold === undefined ? 0.45 : threshold;
  const reasons = []; let level = "clear";
  if (!res.ops.length) { level = "lost"; reasons.push("не распознана ни одна операция"); }
  else if (res.confidence < th) { level = "fuzzy"; reasons.push("уверенность " + Math.round(res.confidence * 100) + "% ниже порога"); }
  if (res.unknown.length >= 2) { if (level === "clear") level = "fuzzy"; reasons.push("нераспознанные слова: " + res.unknown.slice(0, 5).join(", ")); }
  if (res.question) { if (level === "clear") level = "fuzzy"; reasons.push("есть равноценные варианты замысла"); }
  if (res.verdict && res.verdict.verdict === "no") { if (level === "clear") level = "fuzzy"; reasons.push("замысел нереализуем как описан"); }
  return { level, reasons, score: res.confidence };
}

const INTENT_Q = {
  id: "intent", kind: "цель", text: "Что должно произойти с трафиком?",
  why: "Базовый замысел не определён. Выбери ближайшее — это станет опорой для остальных шагов.",
  options: [
    { label: "Обмануть анализатор подставными данными", ops: ["fake"], hint: "DPI видит приманку, настоящее проходит" },
    { label: "Разрезать запрос, чтобы имя не собралось", ops: ["split"], hint: "сегментация внутри SNI/Host" },
    { label: "Изменить поля пакета, не ломая соединение", ops: ["ts"], hint: "timestamp, окна, метки" },
    { label: "Сделать копию и погубить её по пути", ops: ["fake", "ttl", "badsum"], hint: "копия умирает, оригинал цел" },
    { label: "Не пропустить пакет вообще", ops: ["drop"], hint: "полный запрет" }
  ]
};
const TARGET_Q = {
  id: "target", kind: "объект", text: "Воздействуем на оригинал или на копию?",
  why: "От этого зависит вердикт: копия даёт PASS для оригинала, оригинал — MODIFY/DROP. Ошибка здесь ломает соединение.",
  options: [
    { label: "На копии, оригинал должен дойти", ops: ["fake"], ctx: { target: "copy" }, hint: "безопасно: VERDICT_PASS" },
    { label: "На оригинале, изменить его", ops: ["ts"], ctx: { target: "original" }, hint: "осторожно: MODIFY" }
  ]
};
const MECH_Q = {
  id: "mech", kind: "механизм", text: "Чем именно губим копию / ломаем сигнатуру?",
  why: "Механизм определяет, дойдёт ли приманка до сервера. Неверный выбор — и соединение рвётся вместо обхода.",
  options: [
    { label: "Короткий TTL — умрёт по пути", ops: ["ttl"], hint: "нужен подбор: 6-10 хопов" },
    { label: "Битая контрольная сумма", ops: ["badsum"], hint: "сервер отбросит, DPI разберёт" },
    { label: "Немаршрутизируемый адрес", ops: ["ipdst"], hint: "192.0.2.0/24, TEST-NET" },
    { label: "Разрез в непредсказуемой точке", ops: ["split", "random"], hint: "ломает привязку к смещению" },
    { label: "Обратный порядок с перекрытием", ops: ["disorder", "seqovl"], hint: "сборка потока у DPI ломается" }
  ]
};

export function nextQuestion(res, asked, threshold) {
  const hist = asked || [];
  const u = understanding(res, threshold);
  if (u.level === "clear") return null;
  if (res.question && !hist.includes("engine")) {
    return { id: "engine", kind: "уточнение", text: res.question.text, why: res.question.why,
      options: res.question.options.map(o => ({ label: o.label || (OPS[o.op] && OPS[o.op].label) || o.op, ops: [o.op], hint: (OPS[o.op] && OPS[o.op].label) || "" })) };
  }
  const known = lex();
  const unk = res.unknown.find(w => !known[w] && !hist.includes("word:" + w));
  if (unk) {
    return { id: "word:" + unk, kind: "слово", word: unk,
      text: "Что означает «" + unk + "» в твоём замысле?",
      why: "Слова нет ни в корпусе, ни в выученном словаре. Один ответ — и оно начнёт распознаваться всегда.",
      options: [
        { label: "Подставить приманку вместо настоящего", ops: ["fake"] },
        { label: "Разрезать / сегментировать", ops: ["split"] },
        { label: "Изменить порядок или перекрыть", ops: ["disorder", "seqovl"] },
        { label: "Сделать содержимое нечитаемым", ops: ["invert"] },
        { label: "Погубить копию по пути", ops: ["ttl", "badsum"] },
        { label: "Изменить размер пакета", ops: ["pad"] },
        { label: "Это не про приём — просто слово", ops: [], skip: true }
      ] };
  }
  if (!res.ops.length && !hist.includes("intent")) return INTENT_Q;
  if (res.ops.length && !hist.includes("target") && !(res.ctx && res.ctx.target)) return TARGET_Q;
  if (res.ops.includes("fake") && !res.ops.some(o => ["ttl", "badsum", "ipdst"].includes(o)) && !hist.includes("mech")) return MECH_Q;
  if (u.level === "lost" && !hist.includes("mech")) return MECH_Q;
  return null;
}

export function learnAnswer(q, option, phrase, ctx) {
  const c = ctx || {};
  const ops = option.ops || [];
  if (!option.skip && ops.length) {
    if (q.word) teachWord(q.word, ops);
    const merged = Array.from(new Set((c.ops || []).concat(ops)));
    L.train(phrase, merged, 1);
    M.remember(phrase, merged, { ...c, ...(option.ctx || {}) }, 1);
    tokens(phrase).forEach(w => { if (w.length > 3) teachWord(w, ops); });
  }
  push({ q: q.id, kind: q.kind, text: q.text, answer: option.label, ops, phrase, skipped: !!option.skip });
  rebuild();
  return { ops, learned: !option.skip && ops.length > 0 };
}

export function resolve(phrase, ctx, asked, threshold) {
  const res = interpret(phrase, ctx || {});
  const known = lex(), tk = tokens(phrase), fromLex = new Map();
  tk.forEach(w => { const e = known[w]; if (e) e.ops.forEach(o => fromLex.set(o, (fromLex.get(o) || 0) + e.n)); });
  let ops = res.ops, lexUsed = [];
  if (fromLex.size) {
    lexUsed = Array.from(fromLex.entries()).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    ops = Array.from(new Set(ops.concat(lexUsed.slice(0, 3))));
  }
  const merged = { ...res, ops, lexUsed, lexicon: lexicon().slice(0, 20) };
  const u = understanding(merged, threshold);
  const q = nextQuestion(merged, asked || [], threshold);
  return { ...merged, understanding: u, question: q, needAsk: !!q };
}

export function confirm(res, sign, note) {
  feedback({ phrase: res.phrase, ops: res.ops, ctx: res.ctx }, sign);
  if (sign > 0) res.ops.forEach(o => tokens(res.phrase).forEach(w => { if (w.length > 3) teachWord(w, [o]); }));
  push({ q: "confirm", kind: "исход", text: res.phrase, answer: note || (sign > 0 ? "сработало" : "не сработало"), ops: res.ops, sign });
  return { ok: true };
}

export function progress() {
  const l = lexicon(), d = log();
  const asked = d.filter(x => x.q !== "confirm").length;
  const learned = d.filter(x => x.q !== "confirm" && x.ops && x.ops.length).length;
  return { words: l.length, asked, learned, skipped: d.filter(x => x.skipped).length,
    rate: asked ? learned / asked : 0, model: L.stats(), memory: M.stats(),
    contradictions: L.contradictions().length, recent: d.slice(0, 12) };
}
export function exportTutor() { return JSON.stringify({ lexicon: lex(), dialog: log() }, null, 2); }
export function importTutor(txt) {
  const o = JSON.parse(txt);
  if (o.lexicon) lexSave(o.lexicon);
  if (Array.isArray(o.dialog)) { try { localStorage.setItem(LOG, JSON.stringify(o.dialog.slice(0, 300))); } catch { /* ignore */ } }
  rebuild(); return { words: Object.keys(o.lexicon || {}).length };
}
export function resetTutor() { try { localStorage.removeItem(LEX); localStorage.removeItem(LOG); } catch { /* ignore */ } rebuild(); }
