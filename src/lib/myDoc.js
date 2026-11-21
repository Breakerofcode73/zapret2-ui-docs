import { loadVault } from "./vault";
import { docLua, KIND_RU } from "./luadoc";
import { hueFor } from "./intake";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));

export const KIND_GROUP = {
  fake: "Фейки и подмена", split: "Разрез пейлоада", disorder: "Разрез в обратном порядке",
  dup: "Дубли пакетов", modify: "Модификация оригинала", drop: "Дроп пакетов",
  prep: "Подготовка данных", orch: "Оркестрация", iff: "Условия iff", helper: "Внутренние хелперы"
};

const BASE = {
  fake: "Отправляет собственный пакет-приманку перед оригиналом. DPI принимает решение по приманке, а настоящий пакет уходит дальше по цепочке нетронутым.",
  split: "Режет пейлоад на части и отправляет их отдельными TCP-сегментами: сигнатура DPI, привязанная к смещениям, перестаёт совпадать.",
  disorder: "Режет пейлоад и отправляет части в обратном порядке — DPI обязан собирать поток задом наперёд, на чём многие реализации спотыкаются.",
  dup: "Отправляет копию пакета, оригинал не изменяет: DPI видит два одинаковых пакета и может неверно обновить состояние потока.",
  modify: "Меняет поля самого пакета и возвращает MODIFY — в провод уходит изменённый оригинал, копий не создаётся.",
  drop: "Запрещает пакету уйти дальше: ничего не отправляет и не модифицирует.",
  prep: "Готовит данные для последующих инстансов профиля и ничего не отправляет.",
  orch: "Забирает план выполнения и сам решает, какие инстансы и когда вызывать.",
  iff: "Предикат для оркестраторов: возвращает true или false, вызывается из аргумента iff=, а не как отдельный инстанс.",
  helper: "Внутренний хелпер файла: вызывается из других функций этого же файла, инстансом через --lua-desync не назначается."
};

const DETAIL = [
  [/parse_ipv4/, "Адрес разбирается собственным хелпером parse_ipv4 и собирается побайтово через bu8 — корректная замена pton() для IPv4."],
  [/\.ip6?_dst\s*=/, "Адрес получателя подменяется прямо в копии диссекта: reconstruct возьмёт поле как есть."],
  [/\.ip_ttl\s*=|ip6_hlim\s*=/, "TTL копии занижается, чтобы пакет умер по пути и не дошёл до сервера."],
  [/reconstruct\.badsum\s*=\s*true/, "L4-сумма делается невалидной: даже если копия дойдёт, стек сервера её отбросит."],
  [/apply_ip_id/, "IP ID задаётся separately через apply_ip_id — это отдельная стадия, не часть reconstruct."],
  [/apply_fooling/, "Штатные искажения полей применяются через apply_fooling."],
  [/rawsend\.repeats/, "Число повторов отправки берётся из аргумента repeats и кладётся в opts.rawsend."],
  [/is_complete_client_hello|tls_record_complete/, "Полнота TLS-записи проверяется вручную: тип 0x16, старшая версия 0x03, длина из байтов 4–5 в big-endian."],
  [/resolve_range/, "Границы имени хоста берутся через resolve_range в защищённом вызове pcall — маркеры могут не разрешиться."],
  [/math\.random\([^)]*host_range/, "Точка реза выбирается случайно внутри имени хоста, поэтому фиксированной сигнатуры разреза нет."],
  [/math\.floor\(len\s*\*\s*0\.25\)/, "Если маркеры не разрешились, точка берётся случайно в средней половине пейлоада."],
  [/string\.sub\(data,\s*1,\s*1\)/, "Неполный ClientHello режется после первого байта: заголовок TLS-записи оказывается разорван."],
  [/overlap/, "Вторая часть уходит со сдвигом sequence назад и перекрытием хвостом первой — DPI со слабой сборкой может взять неверные байты."],
  [/arg\.nodrop/, "Аргумент nodrop оставляет оригинал в проводе вместо дропа после успешной отправки частей."],
  [/reasm_data/, "Приоритет отдаётся собранному сообщению reasm: многопакетный ClientHello обрабатывается целиком."],
  [/blob\(desync/, "Данные могут быть подменены блобом из аргумента — 0xHEX, поле desync или глобальная переменная."],
  [/deepcopy/, "Работа идёт по копии диссекта: оригинал остаётся нетронутым до самого вердикта."]
];

const PROBES = [
  { re: /not\s+desync\.outgoing|not\s+desync\.dis\.tcp|not\s+desync\.dis\.udp/, t: "Фильтр пакета", d: "Отсекаются пакеты не того направления и транспорта — дальше функция их не видит." },
  { re: /#desync\.dis\.payload\s*==\s*0/, t: "Отсечение пустых", d: "Служебные пакеты без данных не обрабатываются." },
  { re: /direction_cutoff_opposite/, t: "Отключение встречного направления", d: "Инстанс перестаёт вызываться на пакетах обратного направления потока." },
  { re: /direction_check|payload_check/, t: "Стандартные фильтры", d: "Аргументы dir и payload начинают работать через штатные хелперы." },
  { re: /replay_first/, t: "Защита от повторов", d: "Действие выполняется один раз на сообщение, а не на каждую часть replay." },
  { re: /reasm_data|desync\.arg\.blob|desync\.dis\.payload\s*$/, t: "Выбор источника данных", d: "Определяется, какие байты пойдут в работу: reasm, блоб или пейлоад пакета." },
  { re: /is_complete_client_hello|tls_record_complete/, t: "Проверка ClientHello", d: "Ветка для неполного сообщения отделяется от основной." },
  { re: /deepcopy/, t: "Копия диссекта", d: "Дальнейшие правки применяются к копии, оригинал не затрагивается." },
  { re: /resolve_range|resolve_multi_pos|resolve_pos|math\.random/, t: "Выбор точки", d: "Вычисляется позиция, по которой пойдёт разрез или подмена." },
  { re: /ip_dst\s*=|ip_ttl\s*=|ip6_hlim\s*=|apply_fooling|apply_ip_id/, t: "Искажение полей", d: "Меняются адрес, TTL, timestamp и IP ID у подготовленного пакета." },
  { re: /reconstruct\.badsum/, t: "Битая сумма", d: "Пакет становится невалидным для стека получателя." },
  { re: /string\.sub/, t: "Нарезка частей", d: "Пейлоад делится на фрагменты по вычисленной позиции." },
  { re: /rawsend_/, t: "Отправка", d: "Подготовленные пакеты уходят в провод с авто-сегментацией." },
  { re: /replay_drop_set/, t: "Пометка replay", d: "Последующие части сообщения помечаются на дроп." },
  { re: /instance_cutoff/, t: "Отключение инстанса", d: "Миссия выполнена — C-код больше не входит в Lua по этому потоку." },
  { re: /return\s+VERDICT_|return\s+desync\.arg\.nodrop/, t: "Вердикт", d: "Определяется судьба оригинального пакета в конце цепочки." }
];

const RET_RU = {
  PASS: "оригинал проходит без изменений",
  MODIFY: "в провод уходит изменённый desync.dis",
  DROP: "оригинальный пакет не уходит в сеть"
};

function lineOf(body, re, start) {
  const i = body.split("\n").findIndex(l => re.test(l));
  return i < 0 ? null : start + i;
}

function build(f, issues, allDocs) {
  const body = f.body;
  const mech = [BASE[f.kind] || BASE.helper];

  const gates = [f.tcpOnly && "TCP", f.udpOnly && "UDP", f.outgoingOnly && "исходящие", ...f.gatePayload].filter(Boolean);
  mech.push(gates.length
    ? `Область работы: ${gates.join(", ")}. Всё остальное функция пропускает без действий.`
    : "Транспортных и протокольных гейтов нет: функция получает всё, что пропустил профиль.");

  for (const [re, s] of DETAIL) if (re.test(body)) mech.push(s);

  mech.push(f.verdicts.length
    ? `Возвращает ${f.verdicts.map(v => "VERDICT_" + v).join(" / ")}: ${f.verdicts.map(v => RET_RU[v]).join("; ")}.`
    : "Явного вердикта нет — возвращается nil, что эквивалентно VERDICT_PASS.");

  if (f.sends && !f.hasReplay) mech.push("Защиты от replay нет: на многопакетном сообщении отправка повторится для каждой части.");
  if (f.sends && !f.hasCutoff) mech.push("Инстанс не отключается после выполнения и будет вызываться на каждом пакете потока.");
  if (f.luaCutoff) mech.push("Вызывает lua_cutoff: дальнейшие пакеты потока перестанут получать все инстансы профиля, не только этот.");

  const steps = [];
  for (const p of PROBES) {
    const ln = lineOf(body, p.re, f.line);
    if (ln !== null && !steps.some(s => s.t === p.t)) steps.push({ n: ln, t: p.t, d: p.d });
  }
  steps.sort((a, b) => a.n - b.n);

  const pit = issues.map(i => ({ level: i.level, text: i.msg + (i.fix ? " → " + i.fix : "") }));
  if (/apply_fooling\s*\([^)]*,[^)]*,/.test(body))
    pit.push({ level: "warn", text: "apply_fooling вызван с третьим аргументом-таблицей. Штатная сигнатура — (desync[, dis]), опции читаются из desync.arg; таблица может быть проигнорирована, и TTL/timestamp не применятся." });
  if (f.foreign.length)
    pit.push({ level: "info", text: `Вызовы вне известного API: ${f.foreign.join(", ")}. Проверь имена — опечатка означает попытку вызвать nil.` });
  if (f.local && f.isDesync)
    pit.push({ level: "warn", text: "Функция объявлена local: из --lua-desync она не видна, инстанс её не найдёт." });
  if (!f.isDesync && f.kind === "helper")
    pit.push({ level: "info", text: "Не инстанс: подключается через --lua-init и вызывается из других функций." });
  const seen = new Set();
  const pits = pit.filter(p => !seen.has(p.text) && seen.add(p.text));

  const siblings = allDocs.flatMap(d => d.funcs.filter(x => x.name !== f.name).map(x => ({ name: x.name, file: d.file, same: d.file === f.file, kind: x.kind })));
  const rel = [...siblings.filter(s => s.same), ...siblings.filter(s => !s.same && s.kind === f.kind)].slice(0, 5);

  const args = f.args.map(a => [a.name, a.type, a.def, a.desc]);
  const cli = f.cli || (f.isDesync ? null : `local result = ${f.name}(${f.params || "…"})`);
  const payload = f.gatePayload[0] || (f.udpOnly ? "quic_initial" : "tls_client_hello");
  const bat = f.isDesync && !f.local
    ? `--lua-init=@"%~dp0lua\\${f.file}" ^\n--payload=${payload} ^\n${f.cli}`
    : null;

  return {
    name: f.name, file: f.file, kind: f.kind, group: KIND_GROUP[f.kind] || "Прочее",
    local: f.local, isDesync: f.isDesync, line: f.line, size: f.size,
    sig: `${f.local ? "local " : ""}function ${f.name}(${f.params})`,
    args, ret: f.verdicts.length ? f.verdicts.map(v => `VERDICT_${v} — ${RET_RU[v]}`).join("; ") : "nil — эквивалент VERDICT_PASS",
    verdicts: f.verdicts, mech: mech.join(" "), steps, pit: pits, rel, deps: f.deps,
    ex: cli, bat, lead: f.lead.join(" "), issues,
    gates: { transport: f.tcpOnly ? "TCP" : f.udpOnly ? "UDP" : "любой", dir: f.outgoingOnly ? "исходящие" : "любое", payload: f.gatePayload.join(", ") || "без гейта", replay: f.hasReplay, cutoff: f.hasCutoff, reasm: f.needsReasm },
    verified: false
  };
}

export function collectMy() {
  const items = loadVault();
  const docs = items.map(i => docLua(i.text, i.file, KNOWN));
  const records = [];
  docs.forEach((d, di) => {
    d.funcs.forEach(f => records.push({ ...build(f, d.issues.filter(i => i.line >= f.line && i.line < f.line + f.size), docs), hue: hueFor(di), fileIndex: di }));
  });
  const files = items.map((i, k) => ({ file: i.file, hue: hueFor(k), count: records.filter(r => r.file === i.file).length, tags: i.tags || [], note: i.note || "" }));
  return { records, files, docs };
}

export function mdMy(records, title = "Мои функции → Lua") {
  const L = [`# ${title}`, "", `Функций: ${records.length}. Собственный код, не входит в поставку zapret2.`, ""];
  for (const r of records) {
    L.push(`## ${r.name}`, "", "```lua", r.sig, "```", "");
    L.push(`Файл: \`${r.file}\` · тип: ${KIND_RU[r.kind]} · строка ${r.line}`, "");
    L.push(r.mech, "");
    if (r.args.length) {
      L.push("| аргумент | тип | по умолчанию | смысл |", "|---|---|---|---|");
      r.args.forEach(a => L.push(`| ${a[0]} | ${a[1]} | ${a[2]} | ${a[3]} |`));
      L.push("");
    }
    L.push(`**Возврат:** ${r.ret}`, "");
    if (r.steps.length) { L.push("**Порядок работы:**", ""); r.steps.forEach((s, i) => L.push(`${i + 1}. строка ${s.n} — ${s.t}: ${s.d}`)); L.push(""); }
    if (r.ex) L.push("```", r.ex, "```", "");
    if (r.bat) L.push("```bat", r.bat, "```", "");
    if (r.pit.length) { L.push("**Подводные камни:**", ""); r.pit.forEach(p => L.push(`- [${p.level}] ${p.text}`)); L.push(""); }
    if (r.deps.length) L.push("**Опирается на:** " + r.deps.join(", "), "");
  }
  return L.join("\n");
}