import { checkLua } from "./checkLua";

const ARG_DESC = {
  ip_dst: "адрес получателя фейка (IPv4, TEST-NET-1 по умолчанию)",
  ip_ttl: "TTL фейкового пакета, чтобы он умер по пути",
  ip6_ttl: "hop limit для IPv6",
  tcp_ts: "сдвиг TCP timestamp",
  tcp_seq: "сдвиг sequence",
  tcp_md5: "добавить MD5-опцию (пакет станет невалидным для сервера)",
  repeats: "сколько раз отправить пакет",
  delay: "задержка отправки в миллисекундах",
  seqovl: "величина перекрытия sequence",
  seqovl_pattern: "блоб-заполнитель перекрытия",
  pos: "маркер или список маркеров точки реза",
  blob: "источник данных: 0xHEX, поле desync или глобальная переменная",
  pattern: "блоб-заполнитель",
  nodrop: "не дропать оригинал после отправки частей",
  optional: "пропустить вместо ошибки, если блоба нет",
  host: "шаблон фейкового имени хоста",
  midhost: "дополнительный рез внутри имени хоста",
  dir: "направление: in|out|any",
  payload: "список допустимых типов пейлоада",
  min: "не трогать пакеты короче",
  max: "не трогать пакеты длиннее",
  increment: "на сколько изменить длину пейлоада",
  dn: "N в префиксе dN: для DHT",
  spell: "написание заголовка Host (ровно 4 символа)",
  urp: "позиция urgent pointer",
  char: "OOB-байт как символ",
  byte: "OOB-байт как число",
  wsize: "значение TCP window size",
  scale: "scale factor окна",
  dummy: "пустой аргумент-заглушка, на логику не влияет"
};

const RULES = [
  [/^\s*--/, "comment", "Комментарий: на исполнение не влияет."],
  [/^\s*(local\s+)?function\s+[\w.:]+\s*\(\s*ctx\s*,\s*desync\s*\)/, "entry", "Точка входа desync-инстанса: C-код передаёт контекст и таблицу пакета. Глобальная функция видна из --lua-desync."],
  [/^\s*local\s+function/, "entry", "Внутренний хелпер файла: снаружи не виден, инстансом не вызывается."],
  [/^\s*function\s/, "entry", "Объявление функции в глобальном пространстве имён."],
  [/not\s+desync\.outgoing/, "guard", "Фильтр направления: входящие пакеты отсекаются сразу."],
  [/#desync\.dis\.payload\s*==\s*0/, "guard", "Отсечение пакетов без данных: служебные ACK не обрабатываются."],
  [/not\s+desync\.dis\.tcp/, "guard", "Транспортный гейт: функция работает только по TCP."],
  [/not\s+desync\.dis\.udp/, "guard", "Транспортный гейт: только UDP."],
  [/not\s+\(desync\.dis\.tcp\s+or\s+desync\.dis\.udp\)/, "guard", "Транспортный гейт: TCP или UDP, остальное отсекается."],
  [/desync\.dis\.icmp/, "guard", "Оговорка про связанные icmp: на них инстанс не отключается, чтобы не потерять контекст потока."],
  [/l7payload\s*==/, "guard", "Гейт по типу пейлоада: ветка выполняется только для указанного протокола."],
  [/direction_cutoff_opposite/, "action", "Отключает инстанс для противоположного направления потока — экономия вызовов Lua."],
  [/instance_cutoff_shim/, "action", "Отключает инстанс для потока: миссия выполнена, дальше C-код не будет входить в Lua."],
  [/lua_cutoff\s*\(/, "warn", "Отключает ВСЮ Lua-обработку направления: остальные инстансы профиля перестанут получать пакеты."],
  [/direction_check/, "guard", "Стандартный фильтр dir=in|out|any; без него аргумент dir не работает."],
  [/payload_check/, "guard", "Стандартный фильтр по типам пейлоада; без него аргумент payload не работает."],
  [/not\s+replay_first/, "guard", "Проверка replay: дальше идёт ветка для поздних частей многопакетного сообщения."],
  [/replay_first\s*\(/, "guard", "true только на первой части сообщения (или когда replay нет) — защита от повторной отправки."],
  [/replay_drop_set/, "action", "Помечает последующие части replay на дроп. Ставить можно только после успешной отправки всего сообщения."],
  [/replay_drop\s*\(/, "guard", "Читает флаг дропа: часть уже отправлена в составе целого, оригинал не нужен."],
  [/desync_opts\s*\(/, "data", "Собирает композиционные opts: rawsend, reconstruct, ipfrag, ipid, fooling — разные словари для разных стадий."],
  [/\.reconstruct\.badsum/, "action", "Единственная документированная опция reconstruct: L4-сумма станет невалидной, сервер пакет отбросит."],
  [/\.reconstruct\.(\w+)/, "warn", "Поля в reconstruct, кроме badsum, не существуют и будут проигнорированы: искажения делаются в диссекте или через apply_fooling."],
  [/deepcopy\s*\(/, "data", "Глубокая копия диссекта: меняется копия, оригинал остаётся нетронутым."],
  [/apply_fooling\s*\([^)]*,[^)]*,/, "warn", "apply_fooling вызван с третьим аргументом. Штатная сигнатура — (desync[, dis]); таблица опций читается из desync.arg, третий аргумент может игнорироваться."],
  [/apply_fooling/, "action", "Применяет стандартные искажения (ttl, seq, ts, md5, флаги) из desync.arg к указанному диссекту."],
  [/apply_ip_id/, "action", "Обработка IP ID: seq|rnd|zero|none. Отдельная стадия, не часть reconstruct."],
  [/blob_or_def/, "data", "Мягкое получение блоба: без ошибки, если блоб не найден."],
  [/blob_exist/, "guard", "Проверка существования блоба — обязательна для аргумента optional."],
  [/\bblob\s*\(/, "data", "Разрешает блоб: 0xHEX, поле desync или глобальная переменная. Без блоба вызывает error."],
  [/resolve_multi_pos/, "data", "Список маркеров через запятую → массив точек реза (1-based)."],
  [/resolve_range/, "data", "Пара маркеров → диапазон. Может вызвать error, поэтому нужен pcall."],
  [/resolve_pos/, "data", "Один маркер → позиция в пейлоаде (1-based) или nil."],
  [/delete_pos_1/, "data", "Убирает позицию 1: резать по первому байту нельзя, первая часть была бы пустой."],
  [/pcall\s*\(/, "guard", "Защищённый вызов: error внутри C-хелпера не уронит инстанс, вернётся ok=false."],
  [/string\.byte/, "data", "Чтение кодов байтов, индексы 1-based. Так разбирается заголовок TLS."],
  [/string\.sub/, "data", "Вырезание подстроки-blob, включительно с обеих сторон, 1-based."],
  [/string\.rep/, "data", "Повторение строки; для бинарных узоров удобнее pattern() из zapret-lib."],
  [/:match\(/, "data", "Разбор строки по Lua-шаблону; возвращает захваченные группы или nil."],
  [/math\.random\(\s*0\s*,\s*(0x[Ff]{8}|4294967295)/, "warn", "Диапазон 2^32 непортируем в LuaJIT: используй u32(brandom(4))."],
  [/math\.random/, "data", "Случайная точка в диапазоне; требует m<=n."],
  [/math\.floor/, "data", "Округление вниз до целого."],
  [/tonumber/, "data", "Аргументы инстанса — строки; перед арифметикой нужно преобразование в число."],
  [/u32add/, "action", "Модульная арифметика 2^32 — единственный корректный способ менять seq/ack."],
  [/bu8|bu16|bu32/, "data", "Число → бинарный блоб big-endian: так собирается адрес или поле заголовка."],
  [/rawsend_payload_segmented/, "action", "Отправка пейлоада с авто-сегментацией по MSS; третий аргумент — сдвиг sequence (0-based)."],
  [/rawsend_dissect_ipfrag/, "action", "Реконструкция + IP-фрагментация + отсылка диссекта. Проверенная обёртка."],
  [/rawsend_dissect_segmented/, "action", "Отправка целого диссекта с TCP-сегментацией."],
  [/rawsend_dissect\s*\([^)]*,[^)]*,/, "warn", "rawsend_dissect с тремя аргументами: сигнатуру нужно сверить в luacall_rawsend_dissect. Надёжнее rawsend_dissect_ipfrag(dis, desync_opts(desync))."],
  [/rawsend_dissect/, "action", "Низкоуровневая отправка диссекта: порядок аргументов сверяется по исходнику."],
  [/timer_set/, "action", "Создаёт таймер; callback получает (name, data). Значение мс должно быть числом."],
  [/execution_plan_cancel/, "warn", "Забирает план выполнения: инстанс становится оркестратором и обязан сам обойти оставшиеся инстансы."],
  [/execution_plan/, "data", "Получает план оставшихся инстансов профиля — основа оркестрации."],
  [/\.ip_dst\s*=/, "action", "Подмена адреса получателя в диссекте. Значение обязано быть бинарным blob, не строкой."],
  [/\.ip_ttl\s*=|\.ip6_hlim\s*=/, "action", "Установка TTL / hop limit: короткий TTL убивает пакет по пути к серверу."],
  [/\.th_seq\s*=|\.th_ack\s*=/, "action", "Изменение sequence/ack: только через u32add, иначе пакет невалиден на границе диапазона."],
  [/\.payload\s*=/, "action", "Замена пейлоада диссекта: так подставляется фейк или часть сообщения."],
  [/return\s+VERDICT_DROP/, "verdict", "DROP: оригинальный пакет не уйдёт в сеть. Агрегируется поверх PASS и MODIFY."],
  [/return\s+VERDICT_MODIFY/, "verdict", "MODIFY: в конце цепочки уйдёт изменённый desync.dis."],
  [/return\s+VERDICT_PASS/, "verdict", "PASS: оригинал проходит без изменений; для фейковых функций это штатный исход."],
  [/return\s+desync\.arg\.nodrop/, "verdict", "Условный вердикт: DROP обычно, PASS при аргументе nodrop."],
  [/\bDLOG_ERR/, "log", "Сообщение об ошибке в лог без прерывания инстанса."],
  [/b_debug/, "log", "Гейт отладки: тяжёлый вывод только при --debug."],
  [/\bDLOG/, "log", "Запись в debug-лог. Аргумент вычисляется всегда, поэтому дорогое — под b_debug."],
  [/\berror\s*\(/, "warn", "error прервёт инстанс («desync ERR»), пакет пройдёт без обработки."],
  [/^\s*local\s/, "struct", "Локальная переменная: живёт только внутри текущей области видимости."],
  [/^\s*for\s/, "struct", "Цикл: в Lua 1-based, границы включительно."],
  [/^\s*elseif/, "struct", "Альтернативная ветка условия."],
  [/^\s*else\s*$/, "struct", "Ветка по умолчанию."],
  [/^\s*if\s/, "struct", "Условие: в Lua ложны только nil и false, 0 и пустая строка истинны."],
  [/^\s*end\s*$/, "struct", "Закрытие блока function/if/for/while."],
  [/^\s*return\s*$/, "verdict", "Выход без вердикта: nil эквивалентен VERDICT_PASS."]
];

export function explainLine(line) {
  for (const [re, kind, text] of RULES) if (re.test(line)) return { kind, text };
  if (!line.trim()) return { kind: "blank", text: "" };
  if (/=/.test(line)) return { kind: "struct", text: "Присваивание: вычисляется правая часть, результат сохраняется в переменную или поле." };
  if (/\w\s*\(/.test(line)) return { kind: "struct", text: "Вызов функции; результат используется как значение или условие." };
  return { kind: "struct", text: "Выражение Lua." };
}

function inferArgs(body) {
  const names = [...new Set([...body.matchAll(/desync\.arg\.(\w+)/g)].map(m => m[1]))];
  return names.map(n => {
    const def = body.match(new RegExp(`desync\\.arg\\.${n}\\s+or\\s+([^\\n,)]+)`));
    const numeric = new RegExp(`tonumber\\(\\s*desync\\.arg\\.${n}`).test(body);
    const asBlob = new RegExp(`blob\\(\\s*desync\\s*,\\s*desync\\.arg\\.${n}`).test(body) || /blob|pattern/.test(n);
    const presenceOnly = !numeric && !def && new RegExp(`(if|and|or)\\s+desync\\.arg\\.${n}\\b`).test(body);
    const type = numeric ? "number" : asBlob ? "blob" : presenceOnly ? "flag" : "string";
    return { name: n, type, def: def ? def[1].trim() : "—", desc: ARG_DESC[n] || "пользовательский аргумент функции" };
  });
}

export function docLua(text, file = "my.lua", known = new Set()) {
  const lines = text.split(/\r?\n/);
  const fre = /^([ \t]*)(local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(([^)]*)\)/;
  const marks = [];
  lines.forEach((l, i) => { const m = l.match(fre); if (m) marks.push({ line: i, loc: !!m[2], name: m[3], params: m[4].trim() }); });

  const funcs = marks.map((mk, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    const bodyLines = lines.slice(mk.line, end);
    const body = bodyLines.join("\n");
    const lead = [];
    for (let j = mk.line - 1; j >= 0 && lines[j].trim().startsWith("--"); j--) lead.unshift(lines[j].trim().replace(/^--\s?/, ""));
    const isDesync = /^ctx\s*,\s*desync$/.test(mk.params.replace(/\s+/g, " "));
    const sends = /rawsend_/.test(body);
    const splits = /resolve_(multi_pos|pos|range)/.test(body) && /string\.sub/.test(body);
    const reverse = /for\s+\w+\s*=\s*#\w+\s*,\s*0\s*,\s*-1/.test(body);
    const setsPayload = /\.payload\s*=/.test(body);
    const setsIp = /\.ip6?_(dst|src)\s*=/.test(body);
    const verdicts = [...new Set([...body.matchAll(/VERDICT_(PASS|MODIFY|DROP)/g)].map(m => m[1]))];
    let kind = "helper";
    if (isDesync) {
      if (/execution_plan/.test(body)) kind = "orch";
      else if (splits && reverse) kind = "disorder";
      else if (splits) kind = "split";
      else if (sends && (/\bblob\(/.test(body) || setsPayload || setsIp)) kind = "fake";
      else if (sends) kind = "dup";
      else if (verdicts.includes("DROP") && !verdicts.includes("MODIFY")) kind = "drop";
      else if (verdicts.includes("MODIFY")) kind = "modify";
      else kind = "prep";
    } else if (/^cond_/.test(mk.name) || /^desync$/.test(mk.params)) kind = "iff";

    const called = [...new Set([...body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]))];
    const local = new Set(marks.map(m => m.name));
    const deps = called.filter(n => known.has(n));
    const foreign = called.filter(n => !known.has(n) && !local.has(n) &&
      !["not", "and", "or", "if", "for", "while", "return", "function", "tonumber", "tostring", "pcall", "error", "print", "assert", "type", "pairs", "ipairs", "select", "unpack"].includes(n));

    const args = inferArgs(body);
    const gatePayload = [...new Set([...body.matchAll(/l7payload\s*==\s*["'](\w+)["']/g)].map(m => m[1]))];
    const expl = bodyLines.map((l, i) => ({ no: mk.line + i + 1, code: l, ...explainLine(l) })).filter(x => x.kind !== "blank");

    const cli = isDesync && !mk.loc
      ? `--lua-desync=${mk.name}` + (args.length ? ":" + args.map(a => a.type === "flag" ? a.name : `${a.name}=${a.def !== "—" ? a.def.replace(/^["']|["']$/g, "") : "<" + a.type + ">"}`).join(":") : "")
      : null;

    return {
      name: mk.name, params: mk.params, local: mk.loc, isDesync, kind, line: mk.line + 1,
      lead, args, verdicts, deps, foreign, gatePayload, sends, splits,
      tcpOnly: /not\s+desync\.dis\.tcp/.test(body), udpOnly: /not\s+desync\.dis\.udp/.test(body),
      needsReasm: /reasm_data/.test(body), hasReplay: /replay_first/.test(body),
      hasCutoff: /instance_cutoff/.test(body), luaCutoff: /lua_cutoff\s*\(/.test(body),
      planCancel: /execution_plan_cancel/.test(body),
      outgoingOnly: /not\s+desync\.outgoing/.test(body) || /direction_cutoff_opposite/.test(body),
      body, expl, cli, size: bodyLines.length
    };
  });

  const chk = checkLua(text, known);
  return { file, funcs, issues: chk.issues, lines: lines.length, entry: funcs.filter(f => f.isDesync && !f.local).map(f => f.name) };
}

export const KIND_RU = {
  fake: "фейк", split: "разрез", disorder: "disorder", dup: "дубль", modify: "модификация",
  drop: "дроп", prep: "подготовка", orch: "оркестратор", iff: "iff-условие", helper: "хелпер"
};

export function mdDoc(doc) {
  const L = [`# ${doc.file}`, "", `Строк: ${doc.lines} · функций: ${doc.funcs.length} · замечаний: ${doc.issues.length}`, ""];
  for (const f of doc.funcs) {
    L.push(`## ${f.name}`, "", "```lua", `function ${f.name}(${f.params})`, "```", "");
    L.push(`Тип: **${KIND_RU[f.kind]}** · строка ${f.line} · ${f.local ? "local (внутренняя)" : "глобальная"}`, "");
    if (f.lead.length) L.push(f.lead.join(" "), "");
    if (f.args.length) {
      L.push("| аргумент | тип | по умолчанию | смысл |", "|---|---|---|---|");
      f.args.forEach(a => L.push(`| ${a.name} | ${a.type} | ${a.def} | ${a.desc} |`));
      L.push("");
    }
    L.push(`Вердикты: ${f.verdicts.join(", ") || "nil (PASS)"}`);
    L.push(`Гейты: ${[f.tcpOnly && "TCP", f.udpOnly && "UDP", f.outgoingOnly && "исходящие", ...f.gatePayload].filter(Boolean).join(", ") || "нет"}`);
    L.push(`Защита replay: ${f.hasReplay ? "есть" : "нет"} · cutoff: ${f.hasCutoff ? "есть" : "нет"}`);
    if (f.deps.length) L.push(`Опирается на: ${f.deps.join(", ")}`);
    if (f.cli) L.push("", "```", f.cli, "```");
    L.push("", "### Построчно", "");
    f.expl.forEach(e => L.push(`- \`${e.no}\` ${e.code.trim()} — ${e.text}`));
    L.push("");
  }
  if (doc.issues.length) {
    L.push("## Замечания", "");
    doc.issues.forEach(i => L.push(`- **${i.id}** строка ${i.line}: ${i.msg}${i.fix ? ` → ${i.fix}` : ""}`));
  }
  return L.join("\n");
}