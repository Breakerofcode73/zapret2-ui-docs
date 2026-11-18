// Замысел на русском → формальные операции → проверка реализуемости.
// Никакого угадывания: нераспознанное показывается, двусмысленное требует выбора.

export const OPS = {
  fake:     { label: "приманка", needs: "blob", transport: "tcp|udp" },
  split:    { label: "разрез по порядку", transport: "tcp" },
  disorder: { label: "разрез в обратном порядке", transport: "tcp" },
  seqovl:   { label: "перекрытие sequence", transport: "tcp" },
  ts:       { label: "сдвиг TCP timestamp", transport: "tcp" },
  pos:      { label: "сдвиг точки реза", transport: "tcp" },
  ttl:      { label: "занижение TTL", transport: "tcp|udp" },
  badsum:   { label: "битая L4-сумма", transport: "tcp|udp" },
  md5:      { label: "TCP MD5-опция", transport: "tcp" },
  ipdst:    { label: "подмена адреса получателя", transport: "tcp|udp" },
  ipid:     { label: "режим IP ID", transport: "tcp|udp" },
  host:     { label: "подмена имени хоста", transport: "tcp" },
  invert:   { label: "инверсия байтов пейлоада", transport: "tcp|udp" },
  reverse:  { label: "разворот байтов пейлоада", transport: "tcp|udp" },
  pad:      { label: "изменение длины UDP", transport: "udp" },
  dup:      { label: "дубль пакета", transport: "tcp|udp" },
  drop:     { label: "дроп пакета", transport: "tcp|udp" },
  oob:      { label: "OOB-байт (URG)", transport: "tcp" },
  repeat:   { label: "повторы отправки", transport: "tcp|udp" },
  random:   { label: "случайная точка реза", transport: "tcp" }
};

const LEX = [
  ["fake", ["фейк", "приманк", "подставн", "обманк", "fake", "приманить"]],
  ["split", ["разрез", "резат", "рез ", "порез", "дробл", "сегмент", "split", "разбит", "раздел"]],
  ["disorder", ["обратн", "реверс порядок", "зад наперёд", "disorder", "в обратном"]],
  ["seqovl", ["перекрыт", "seqovl", "нахлёст", "нахлест", "оверлап"]],
  ["ts", ["timestamp", "таймстамп", "временн", " tcp_ts", "ts="]],
  ["pos", ["точк", "позици", "смещен", "сдвиг рез", "pos="]],
  ["ttl", ["ttl", "ттл", "хоп", "hop", "время жизни"]],
  ["badsum", ["битая сумм", "badsum", "невалидн сумм", "сумм"]],
  ["md5", ["md5", "мд5"]],
  ["ipdst", ["ip_dst", "адрес", "dst", "айпи", "ip получ", "подмен ip"]],
  ["ipid", ["ip_id", "ipid", "ип ид"]],
  ["host", ["хост", "домен", "sni", "host", "имя сайт"]],
  ["invert", ["инверс", "инвертир", "invert", "xor", "ксор", "негатив"]],
  ["reverse", ["разворот", "реверс", "reverse", "задом наперёд байт"]],
  ["pad", ["удлин", "длин", "pad", "udplen", "добав байт", "увелич пакет"]],
  ["dup", ["дубл", "копия пакет", "клон", "dup", "повтор пакет"]],
  ["drop", ["дроп", "отброс", "блокир", "drop", "не пускать"]],
  ["oob", ["oob", "ург", "urgent", "срочн байт"]],
  ["repeat", ["повтор", "repeats", "несколько раз", "ещё раз", "еще раз"]],
  ["random", ["случайн", "рандом", "random", "произвольн"]]
];

const STOP = new Set(("и + плюс с со для на в во к по из что хочу нужно сделать сделай чтобы потом затем ещё еще " +
  "запрос запроса пакета пакет ответ ответа трафик трафика мой моя моё это так же просто очень можно надо " +
  "функция функцию новая новый создать сделай добавить применить использовать при помощи через").split(/\s+/));

export function parseIdea(text) {
  const t = " " + String(text || "").toLowerCase().replace(/ё/g, "е") + " ";
  const found = [];
  const consumed = [];
  for (const [op, stems] of LEX) {
    for (const s of stems) {
      const i = t.indexOf(s);
      if (i >= 0) { found.push({ op, frag: s.trim(), at: i }); consumed.push([i, i + s.length]); break; }
    }
  }
  // «сдвиг» без уточнения — двусмысленно
  const shiftHits = [...t.matchAll(/сдвиг|сдвин|shift/g)].map(m => m.index);
  const explicit = new Set(found.filter(f => ["seqovl", "ts", "pos"].includes(f.op)).map(f => f.op));
  const ambiguous = [];
  if (shiftHits.length && explicit.size === 0) {
    ambiguous.push({ id: "shift", frag: "сдвиг", hits: shiftHits.length, options: ["seqovl", "ts", "pos"],
      why: "«Сдвиг» неsays чего именно: перекрытие sequence у сегмента, сдвиг TCP timestamp или сдвиг точки реза. Это три разные операции с разными последствиями." });
  } else if (shiftHits.length > explicit.size) {
    ambiguous.push({ id: "shift", frag: "сдвиг", hits: shiftHits.length - explicit.size, options: ["seqovl", "ts", "pos"],
      why: "Часть упоминаний «сдвиг» уточнена, часть — нет. Выбери, что означает оставшийся." });
  }
  let rest = t;
  consumed.sort((a, b) => b[0] - a[0]).forEach(([a, b]) => { rest = rest.slice(0, a) + " " + rest.slice(b); });
  const unknown = [...new Set(rest.split(/[^a-zа-я0-9_]+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)))];
  const ops = [...new Set(found.map(f => f.op))];
  return { ops, found, ambiguous, unknown, raw: text };
}

const R = (level, why, refs = []) => ({ level, why, refs });

// target: "fake" | "original"; transport: "tcp" | "udp"
export function assess(ops, { target = "original", transport = "tcp" } = {}) {
  const out = [];
  const has = o => ops.includes(o);
  const dies = has("ttl") || has("badsum") || has("md5") || has("ipdst");
  const push = (op, r) => out.push({ op, ...r });

  if (has("invert") || has("reverse")) {
    const op = has("invert") ? "invert" : "reverse";
    if (target === "original") {
      push(op, R("no",
        "Инверсия/разворот байтов делает ClientHello невалидным: сервер не разберёт ни TLS-запись, ни SNI, соединение умрёт. Операция обратима только если на другой стороне есть деобфускация — у браузера её нет. В zapret2 двусторонняя обфускация делается отдельным средством (zapret-obfs) на обоих концах, а не одной desync-функцией.",
        ["capi: bxor", "zapret-obfs.lua", "deep/contract"]));
    } else if (!dies) {
      push(op, R("warn",
        "Инверсия применена к фейку, но у фейка нет механизма смерти: он дойдёт до сервера и будет отброшен стеком. DPI при этом увидит мусор и может его проигнорировать. Добавь TTL, badsum или подмену адреса, чтобы фейк умер до сервера.",
        ["deep/fake", "capi: reconstruct_dissect"]));
    } else {
      push(op, R("ok",
        "Инверсия применяется к копии, которая умирает по TTL/сумме/адресу. Сервер её никогда не увидит, DPI получит нераспознаваемый пейлоад — это допустимая приманка.",
        ["capi: bxor", "deep/fake_ip_misdirection"]));
    }
  }
  if (has("seqovl")) {
    if (!has("split") && !has("disorder")) push("seqovl", R("warn", "Перекрытие sequence имеет смысл только внутри разреза: нужен сегмент, который перекрывает предыдущий. Без split/disorder операция превращается в сдвig seq у оригинала — это ломает поток.", ["deep/multisplit"]));
    else push("seqovl", R("ok", "Перекрытие реализуется сдвигом offset второго сегмента назад. Обязательное условие: seqovl меньше первой точки реза, иначе второй сегмент станет всем сообщением с начала потока.", ["deep/multisplit", "deep/outline_random_split"]));
  }
  if (has("ts")) push("ts", R("ok", "Сдвиг TCP timestamp — штатный fooling-аргумент, применяется через apply_fooling. Для оригинала безопасен: timestamp не влияет на нумерацию байтов.", ["capi: apply_fooling", "deep/pktmod"]));
  if (has("pos")) push("pos", R("ok", "Сдвиг точки реза — арифметика над маркером (host+1, midsld-2). Полностью безопасно: меняется только место разреза.", ["markers", "capi: resolve_pos"]));
  if (has("split") || has("disorder")) {
    const op = has("disorder") ? "disorder" : "split";
    if (transport === "udp") push(op, R("no", "TCP-сегментация невозможна для UDP: у датаграммы нет sequence и сборки потока. Для UDP доступны только фейки, изменение длины и IP-фрагментация.", ["deep/udplen", "capi: rawsend"]));
    else push(op, R("ok", "Разрез реализуется через resolve_multi_pos + rawsend_payload_segmented с авто-сегментацией по MSS. Оригинал дропается после успешной отправки частей.", ["deep/multisplit", "deep/multidisorder"]));
    if (has("split") && has("disorder")) push("disorder", R("no", "Два разбиения одного сообщения в одной функции: первое уже отправит весь reasm и поставит replay_drop_set, второе уйдёт поверх — дубль в проводе.", ["deep/multisplit"]));
  }
  if (has("pad")) {
    if (transport === "tcp") push("pad", R("no", "udplen работает только по UDP. Изменение длины TCP-пейлоада сдвинет sequence всего последующего потока и порвёт соединение, если не компенсировать нумерацию в обе стороны.", ["deep/udplen", "deep/oob"]));
    else push("pad", R("ok", "Изменение длины UDP-датаграммы на ±N байт. Прирост держи малым: при превышении MTU ОС фрагментирует на уровне IP, а на части платформ пакет молча теряется.", ["deep/udplen"]));
  }
  if (has("oob")) {
    if (has("split") || has("disorder") || has("fake") || has("dup")) push("oob", R("no", "oob — длящаяся десинхронизация: он держит сдвиг seq/ack с самого SYN. Любая отправка целого пейлоада пойдёт без OOB и разрушит десинхронизацию.", ["deep/oob"]));
    else push("oob", R("probe", "oob требует перехвата с самого SYN и компенсации ack на входящих. Работоспособность зависит от того, получает ли профиль первый пакет соединения — статически это не проверяется.", ["deep/oob"]));
  }
  if (has("host")) {
    if (target === "original") push("host", R("no", "Подмена имени хоста у оригинала приведёт к тому, что сервер не найдёт нужный виртуальный хост (http) или получит несовпадение SNI с сертификатом (tls). Подмена работает только в фейковых сегментах.", ["deep/hostfakesplit"]));
    else push("host", R("ok", "Фейковое имя той же длины в отдельных сегментах с fooling — ровно то, что делает штатная hostfakesplit. Генерируется через genhost по шаблону.", ["deep/hostfakesplit", "capi: genhost"]));
  }
  if (has("ipdst")) push("ipdst", R(target === "original" ? "no" : "ok",
    target === "original"
      ? "Подмена адреса у оригинала отправит запрос не тому серверу — соединение не установится."
      : "Адрес меняется в копии диссекта бинарным blob (pton или побайтово bu8). TEST-NET-1 192.0.2.0/24 не маршрутизируется глобально, копия умрёт по пути.",
    ["deep/pton", "deep/fake_ip_misdirection"]));
  if (has("ttl")) push("ttl", R("probe", "Занижение TTL убивает копию на первом же хопе. Но увидит ли её DPI — зависит от того, стоит ли DPI до этого хопа. Статически не проверяется: нужен дамп и подбор TTL или ip_autottl.", ["deep/fake", "capi: apply_fooling"]));
  if (has("badsum")) push("badsum", R("ok", "Невалидная L4-сумма: стек сервера отбросит копию. Часть DPI сумму не проверяет — именно это и нужно.", ["capi: reconstruct_dissect"]));
  if (has("md5")) push("md5", R("ok", "MD5-опция делает пакет невалидным для сервера без согласованного ключа. Штатный fooling-аргумент.", ["capi: apply_fooling"]));
  if (has("ipid")) push("ipid", R("ok", "Режим IP ID (seq|rnd|zero|none) — отдельная стадия apply_ip_id, на валидность пакета не влияет.", ["capi: apply_ip_id"]));
  if (has("fake")) push("fake", R(dies ? "ok" : "warn",
    dies ? "Приманка отправляется копией с механизмом смерти, оригинал проходит нетронутым."
          : "Приманка без механизма смерти дойдёт до сервера и станет обычным дублем запроса. Добавь TTL, badsum или подмену адреса.",
    ["deep/fake"]));
  if (has("dup")) push("dup", R("ok", "Дубль пакета с искажениями — штатная send. Оригинал не меняется.", ["deep/send"]));
  if (has("drop")) push("drop", R("warn", "DROP агрегируется в конце цепочки: последующие инстансы всё равно выполнятся и могут отправить данные. Если нужен именно запрет — ставь дроп последним.", ["deep/drop", "deep/contract"]));
  if (has("repeat")) push("repeat", R("ok", "Число повторов — штатный rawsend-аргумент repeats.", ["capi: rawsend"]));
  if (has("random")) push("random", R("ok", "Случайная точка внутри диапазона имени хоста: ломает сигнатуры по фиксированному offset. Реализуется math.random по границам из resolve_range.", ["deep/outline_random_split"]));

  const blocking = out.filter(x => x.level === "no");
  const probes = out.filter(x => x.level === "probe");
  const verdict = blocking.length ? "no" : probes.length ? "probe" : out.length ? "ok" : "empty";
  return { items: out, blocking, probes, verdict };
}

export function reformulate(ops, ctx, assessment) {
  const out = [];
  const has = o => ops.includes(o);
  if (assessment.blocking.some(b => ["invert", "reverse", "ipdst", "host"].includes(b.op)) && ctx.target === "original")
    out.push({ label: "То же, но приманкой, а не оригиналом", ops: [...new Set([...ops, "fake", "ttl", "badsum"])], ctx: { ...ctx, target: "fake" },
      why: "Инверсия, подмена адреса и подмена хоста ломают оригинал, но безопасны для копии, которая умрёт до сервера. Добавляем приманку и механизм смерти." });
  if (assessment.blocking.some(b => ["split", "disorder"].includes(b.op)) && ctx.transport === "udp")
    out.push({ label: "Разрез по TCP вместо UDP", ops, ctx: { ...ctx, transport: "tcp" }, why: "Сегментация существует только в TCP." });
  if (assessment.blocking.some(b => b.op === "pad") && ctx.transport === "tcp")
    out.push({ label: "Изменение длины по UDP", ops, ctx: { ...ctx, transport: "udp" }, why: "udplen работает только по UDP." });
  if (has("split") && has("disorder"))
    out.push({ label: "Оставить только обратный порядок", ops: ops.filter(o => o !== "split"), ctx, why: "Два разбиения дают дубль; disorder уже включает разрез." });
  if (has("oob") && (has("fake") || has("split") || has("disorder") || has("dup")))
    out.push({ label: "Убрать отправку целого пейлоада, оставить oob", ops: ops.filter(o => !["fake", "split", "disorder", "dup"].includes(o)), ctx, why: "oob несовместим с отправкой целого пейлоада." });
  if (has("seqovl") && !has("split") && !has("disorder"))
    out.push({ label: "Добавить разрез к перекрытию", ops: [...new Set([...ops, "split"])], ctx, why: "Перекрытие имеет смысл только внутри сегментации." });
  return out;
}

export const LIMITS = [
  ["Что система делает", "Разбирает фразу по словарю операций zapret2, проверяет каждую на реализуемость по протоколу и API, подбирает готовую стратегию или собирает новую из проверенных блоков в правильном порядке."],
  ["Чего система не делает", "Не понимает произвольную речь. Всё, что вне словаря, показывается как нераспознанное — оно не превращается в код догадкой."],
  ["Почему двусмысленность блокирует", "«Сдвиг» — это три разные операции. Молча выбрать одну значит сгенерировать не то, что задумано, и сломать соединение. Поэтому выбор остаётся за тобой."],
  ["Почему часть идей невозможна", "Инверсия или подмена хоста у оригинала ломает протокол: сервер не разберёт запрос. Это ограничение TLS/TCP, а не инструмента. Обратимо только при обфускации на обоих концах."],
  ["Почему «требует эксперимента»", "Видимость фейка для DPI зависит от его места в сети относительно хопа смерти. Это нельзя вывести из кода — нужен дамп и подбор TTL."],
  ["Приоритет готового", "Если замысел покрывается штатной стратегией, система предлагает её вместо генерации: проверенный код надёжнее свежего."]
];