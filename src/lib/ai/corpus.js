import { C_FUNCS } from "../../data/capi";
import { MARKERS } from "../../data/markers";
import { DEEP } from "../../data/deep";
import { loadVault } from "../vault";
import { docLua } from "../luadoc";
import { fns as antidpi } from "../../pages/Antidpi";
import { fns as lib } from "../../pages/Lib";
import { fns as auto } from "../../pages/Auto";
import { OPS } from "../intent";

// Авторские описания операций: чем богаче перефразировки, тем шире понимание.
// Это учебный корпус, а не «понимание языка» — граница метода показывается в UI.
const OP_TEXT = {
  fake: "фейк приманка подставной ложный запрос обмануть dpi подсовить мусор вместо настоящего запроса отправить копию раньше оригинала приманить анализатор fake обманка подделка",
  split: "разрез разрезать порезать нарезать дробить сегменты разбить запрос на части расчленить пейлоад split порубить разделить надвое куски фрагменты по маркерам",
  disorder: "обратный порядок задом наперёд реверс перепутать сегменты disorder хаотичный порядок сначала конец потом начало переставить части",
  seqovl: "перекрытие нахлёст нахлест оверлап seqovl перекрыть sequence повторить байты предыдущего сегмента наложение сегментов сдвиг нумерации назад",
  ts: "timestamp таймстамп временная метка сдвиг времени tcp_ts изменить время метки ts омолодить состарить метку",
  pos: "точка реза позиция смещение сдвиг места разреза подвинуть маркер pos позиция разреза сдвинуть где резать",
  ttl: "ttl ттл время жизни хоп hop limit короткий ттл чтобы пакет умер по пути не дошёл до сервера истечение хопов занижение",
  badsum: "битая сумма невалидная контрольная сумма badsum испортить чексумму сумма чтобы сервер отбросил пакет",
  md5: "md5 мд5 tcp md5 опция подпись чтобы сервер не принял пакет невалидный для стека",
  ipdst: "подменить адрес ip получателя dst другой айпи неверный адрес test-net адрес в никуда ip_dst перенаправить копию не туда",
  ipid: "ip id идентификатор пакета ipid случайный ip_id zero rnd обнулить идентификатор",
  host: "имя хоста домен sni подмена домена чужой хост fake host подставить другой домен google вместо настоящего имени сайта",
  invert: "инверсия инвертировать негатив xor ксор перевернуть биты мусор нераспознаваемый пейлоад нечитаемый запрос испортить байты bxor искажение содержимого",
  reverse: "разворот реверс байтов задом наперёд содержимое reverse перевернуть порядок байтов пейлоада",
  pad: "удлинить увеличить длину пакета добавить байты паддинг pad udplen изменить размер датаграммы добить мусором уменьшить длину",
  dup: "дубль дублировать копия пакета клон повторить тот же пакет send два одинаковых пакета",
  drop: "дроп отбросить заблокировать не пускать запретить пакет drop выбросить",
  oob: "oob ург urgent срочный байт вне полосы десинхронизация нумерации на всё соединение",
  repeat: "повторы несколько раз repeats ещё раз повторить отправку много копий подряд",
  random: "случайный рандом random произвольная точка недетерминированно каждый раз по-новому плавающая позиция"
};

const PROV = { verified: 0.95, config: 0.8, manual: 0.7, authored: 0.6, custom: 0.75 };

export function buildCorpus() {
  const docs = [];
  const add = (id, kind, title, text, meta = {}) =>
    docs.push({ id, kind, title, text: (title + " " + text).toLowerCase(), meta, trust: PROV[meta.src || "authored"] });

  Object.entries(OP_TEXT).forEach(([op, text]) =>
    add("op:" + op, "op", OPS[op]?.label || op, text, { src: "authored", op, note: "авторские перефразировки операции" }));

  C_FUNCS.forEach(f => add("c:" + f.name, "c", f.name,
    f.mech + " " + f.args.map(a => a.join(" ")).join(" ") + " " + f.pit.join(" "),
    { src: f.v ? "verified" : "manual", fn: f.name, note: f.v ? "сигнатура подтверждена исходниками" : "сигнатуру сверить" }));

  antidpi.forEach(f => add("s:" + f.name, "strategy", f.name, f.ru + " " + (f.std || ""),
    { src: "verified", fn: f.name, note: "штатная стратегия antidpi" }));
  lib.forEach(f => add("l:" + f.name, "helper", f.name, f.ru, { src: "verified", fn: f.name, note: "хелпер zapret-lib" }));
  auto.forEach(f => add("a:" + f.name, "orch", f.name, f.ru, { src: "verified", fn: f.name, note: "оркестратор zapret-auto" }));
  MARKERS.forEach(m => add("m:" + m.name, "marker", m.name, m.meaning + " " + m.ex,
    { src: m.certainty === "verified" ? "verified" : m.certainty === "config" ? "config" : "manual", marker: m.name, note: "маркер позиции" }));
  DEEP.forEach(d => add("d:" + d.id, "deep", d.id, d.lead + " " + (d.idea || []).join(" "),
    { src: "verified", deep: d.id, note: "полный разбор" }));

  const KNOWN = new Set([...C_FUNCS.map(f => f.name), ...antidpi.map(f => f.name), ...lib.map(f => f.name), ...auto.map(f => f.name)]);
  loadVault().forEach(it => {
    const d = docLua(it.text, it.file, KNOWN);
    d.funcs.forEach(f => add("v:" + f.name, "custom", f.name,
      (f.lead || []).join(" ") + " " + f.args.map(a => a.name + " " + a.desc).join(" ") + " " + f.kind,
      { src: "custom", fn: f.name, file: it.file, note: "твоя функция из хранилища" }));
  });
  return docs;
}