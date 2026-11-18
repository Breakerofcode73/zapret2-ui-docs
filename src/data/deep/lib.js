export const blob = {
  id: "blob", title: "Разбор: blob", kind: "helper",
  lead: "Достаёт бинарные данные из аргумента: 0xHEX, поле desync или глобальная переменная. Фундамент всех фейков.",
  tags: ["helper", "blobs", "ядро"],
  idea: [
    "Блоб — Lua-строка с бинарными данными любой длины. Вместо того чтобы зашивать фейки в C, zapret2 хранит их как блобы и разрешает по имени в рантайме.",
    "blob() — единая точка доступа: принимает имя и возвращает байты, проверяя три источника по порядку."
  ],
  ideaTable: [
    ["0xHEX", "если имя начинается с 0x — парсится как hex прямо в аргументе"],
    ["desync.<name>", "динамический блоб, положенный предыдущим инстансом"],
    ["_G.<name>", "глобальная переменная (fake_default_tls и др.)"]
  ],
  wire: [{ caption: "Разрешение имени:", diagram:
`blob(desync, "fake_default_tls")
  → не 0x... → ищем desync.fake_default_tls (нет)
  → ищем _G.fake_default_tls (есть, стандартный фейк)
  → возвращаем байты

blob(desync, "0x1603030000")
  → 0x... → parse_hex → 5 байт` }],
  api: [
    { name: "parse_hex", from: "C API", sig: "local b = parse_hex('0x1603')", ret: "blob", text: "Hex-строка → байты." },
    { name: "blob_exist", from: "zapret-lib", sig: "if blob_exist(desync, name) then ... end", ret: "true/false", text: "Проверка без error — для optional." },
    { name: "blob_or_def", from: "zapret-lib", sig: "local b = blob_or_def(desync, name)", ret: "блоб или nil/default", text: "Мягкий вариант без error." }
  ],
  lines: [{ title: "логика blob(desync, name, default)", items: [
    ["if name начинается с 0x then return parse_hex(name) end", "Hex прямо в аргументе."],
    ["if desync[name] ~= nil then return desync[name] end", "Динамический блоб из цепочки инстансов."],
    ["if _G[name] ~= nil then return _G[name] end", "Глобальная переменная / стандартный фейк."],
    ["if default then return default end", "Значение по умолчанию."],
    ["error('blob not found: '..name)", "Нет нигде и нет default → аварийный останов."]
  ]}],
  bugs: [
    { level: "crit", title: "Нет блоба и нет optional", breaks: "error → инстанс падает, «desync ERR», пакет проходит без фейка.", fix: "Для опциональных фейков: blob_exist + аргумент optional, либо blob_or_def." },
    { level: "warn", title: "Строка вместо blob", breaks: "Присвоить dis.payload = 'текст' — это ASCII-байты, а не бинарный протокол.", fix: "Бинарные данные — через parse_hex / pton / buX / blob." }
  ],
  fixTitle: "Использование",
  fix: `-- стандартный фейк
local f = blob(desync, "fake_default_tls")
-- hex прямо в аргументе
local h = blob(desync, "0x1603030000")
-- динамический блоб от предыдущего инстанса
--lua-desync=tls_client_hello_clone:blob=hello:sni_first=example.com
--lua-desync=fake:blob=hello
-- опциональный (не падать если нет)
if desync.arg.optional and not blob_exist(desync, name) then return end`,
  test: `--lua-desync=luaexec:code=DLOG(#blob(desync,"fake_default_tls"))
# должно вывести длину стандартного фейка`,
  how: [
    "Три источника: 0xHEX → desync → глобальная. Порядок важен.",
    "Нет блоба — error, если не задан default/optional.",
    "Динамические блобы (desync.<name>) — способ передачи данных между инстансами.",
    "Стандартные фейки создаются автоматически: fake_default_tls/http/quic."
  ],
  seeAlso: [{ page: "deep/fake", label: "fake" }, { page: "deep/pton", label: "pton" }]
};

export const apply_fooling = {
  id: "apply_fooling", title: "Разбор: apply_fooling", kind: "helper",
  lead: "Применяет стандартные искажения (ttl, seq, ts, md5, флаги) к диссекту. Именно здесь живут fooling-аргументы.",
  tags: ["helper", "fooling", "ядро"],
  idea: [
    "Все fooling-аргументы (ip_ttl, tcp_seq, tcp_ts, tcp_md5, tcp_flags_set/unset, ip6-расширения) обрабатываются в одном месте — apply_fooling. Не в reconstruct!",
    "Принимает desync (источник аргументов) и dis (что менять). Модифицирует dis на месте."
  ],
  ideaTable: [
    ["ip_ttl / ip6_ttl", "задаёт TTL / hop limit"],
    ["ip_autottl", "авто-TTL по delta,min-max"],
    ["tcp_seq / tcp_ack", "добавляет N к sequence/ack (через u32add)"],
    ["tcp_ts", "добавляет N к timestamp"],
    ["tcp_md5", "добавляет MD5-опцию (16 байт)"],
    ["tcp_flags_set/unset", "ставит/снимает флаги"],
    ["fool", "своя функция искажения"]
  ],
  wire: [{ caption: "apply_fooling(desync, dis) при ip_ttl=6, tcp_md5:", diagram:
`dis.ip.ip_ttl:  64 → 6
dis.tcp:        добавлена MD5-опция (16 байт)
dis.tcp.th_seq: без изменений (tcp_seq не задан)
результат:      диссект готов к реконструкции и отправке` }],
  api: [
    { name: "u32add", from: "C API", sig: "dis.tcp.th_seq = u32add(dis.tcp.th_seq, N)", ret: "число по модулю 2^32", text: "Безопасная арифметика seq/ack." },
    { name: "find_tcp_options", from: "zapret-lib", sig: "local opts = find_tcp_options(dis.tcp)", ret: "таблица опций", text: "Для работы с timestamp/MD5." }
  ],
  lines: [{ title: "логика apply_fooling(desync, dis)", items: [
    ["local arg = desync.arg", "Источник fooling-аргументов."],
    ["if arg.ip_ttl then dis.ip.ip_ttl = tonumber(arg.ip_ttl) end", "TTL ipv4."],
    ["if arg.ip6_ttl then dis.ip6.ip6_hlim = tonumber(arg.ip6_ttl) end", "Hop limit ipv6."],
    ["if arg.tcp_seq then dis.tcp.th_seq = u32add(dis.tcp.th_seq, tonumber(arg.tcp_seq)) end", "Сдвиг sequence."],
    ["if arg.tcp_md5 then ... добавить MD5-опцию ... end", "MD5 делает пакет невалидным для сервера."],
    ["if arg.tcp_ts then ... сдвинуть timestamp ... end", "Сдвиг временной метки."],
    ["if arg.fool then _G[arg.fool](dis, arg) end", "Кастомное искажение."]
  ]}],
  bugs: [
    { level: "crit", title: "Fooling кладут в reconstruct", breaks: "opts.reconstruct.ip_ttl = 6 игнорируется — reconstruct знает только badsum.", fix: "Вызывай apply_fooling(desync, dis), а не присваивай поля в reconstruct." },
    { level: "warn", title: "Применяют к оригиналу без копии", breaks: "apply_fooling(desync) без dis меняет desync.dis → оригинал искажается.", fix: "Для фейка: local dis = deepcopy(desync.dis); apply_fooling(desync, dis)." }
  ],
  fixTitle: "Использование",
  fix: `-- к копии (фейк):
local dis = deepcopy(desync.dis)
apply_fooling(desync, dis)   -- применит ip_ttl, tcp_md5 из аргументов
rawsend_dissect_ipfrag(dis, desync_opts(desync))

-- к оригиналу (модификация):
apply_fooling(desync)        -- без dis = меняет desync.dis
return VERDICT_MODIFY`,
  fixNote: "Аргументы: --lua-desync=...:ip_ttl=6:tcp_md5:tcp_ts=-600000. apply_fooling прочитает их сам.",
  test: `--debug --lua-desync=fake:blob=fake_default_tls:ip_ttl=6:tcp_md5
# в дампе фейка: ttl=6, MD5-опция в tcp`,
  how: [
    "Fooling — это apply_fooling, не reconstruct.",
    "Копия для фейка, оригинал для MODIFY.",
    "seq/ack только через u32add (внутри apply_fooling так и сделано).",
    "Своё искажение — аргумент fool=имя_функции."
  ],
  seeAlso: [{ page: "deep/u32add", label: "u32add" }, { page: "deep/fake", label: "fake" }]
};

export const rawsend_payload_segmented = {
  id: "rawsend_payload_segmented", title: "Разбор: rawsend_payload_segmented", kind: "helper",
  lead: "Отправляет пейлоад с автоматической TCP-сегментацией по MSS и сдвигом sequence. Не нужно думать о размерах пакетов.",
  tags: ["helper", "send", "segmentation", "ядро"],
  idea: [
    "Главная боль zapret1 — вручную считать размеры сегментов. В zapret2 эта функция сама режет пейлоад на MSS-куски, ставит правильные sequence и применяет fooling.",
    "Третий аргумент — сдвиг sequence (0-based): для seqovl и для отправки части с нужной позиции."
  ],
  ideaTable: [
    ["desync", "источник opts (fooling, rawsend, reconstruct)"],
    ["payload", "что слать (часть или весь пейлоад)"],
    ["offset", "сдвиг sequence: 0 для начала, split_pos для второй части, -seqovl для перекрытия"]
  ],
  wire: [{ caption: "payload len=3000, MSS=1460, offset=100:", diagram:
`сегмент1: seq=S+100   bytes[1..1460]
сегмент2: seq=S+1560  bytes[1461..2920]
сегмент3: seq=S+3020  bytes[2921..3000]
(авто-разбиение, fooling применён к каждому)` }],
  api: [
    { name: "desync_opts", from: "zapret-lib", sig: "local opts = desync_opts(desync)", ret: "композиционные opts", text: "rawsend/reconstruct/ipfrag/fooling." },
    { name: "rawsend_dissect_segmented", from: "zapret-lib", sig: "rawsend_dissect_segmented(desync, dis)", ret: "true", text: "Аналог для целого диссекта (не только пейлоада)." }
  ],
  lines: [{ title: "логика rawsend_payload_segmented(desync, payload, offset, opts)", items: [
    ["opts = opts or desync_opts(desync)", "Берём opts из аргументов."],
    ["local dis = deepcopy(desync.dis)", "Копия диссекта-основы."],
    ["dis.payload = payload", "Подставляем наш пейлоад."],
    ["dis.tcp.th_seq = u32add(base_seq, offset)", "Сдвиг sequence."],
    ["apply_fooling(desync, dis)", "Fooling к каждому сегменту."],
    ["for каждый MSS-кусок do rawsend_dissect(...) end", "Авто-сегментация."]
  ]}],
  bugs: [
    { level: "warn", title: "Путают 0-based offset и 1-based позицию", breaks: "offset=split_pos (0-based) верно; offset=split_pos-1 даст сдвиг на байт.", fix: "offset = число байтов ДО этой части (0-based). Первая часть: 0. Вторая: split_pos." },
    { level: "info", title: "Собирают сегменты вручную", breaks: "Лишний код и ошибки с MSS/MTU.", fix: "Всегда через эту функцию — сегментация автоматическая." }
  ],
  fixTitle: "Использование",
  fix: `-- весь пейлоад:
rawsend_payload_segmented(desync, data)
-- первая часть (с начала):
rawsend_payload_segmented(desync, part1, 0)
-- вторая часть (после split_pos байт):
rawsend_payload_segmented(desync, part2, split_pos)
-- с перекрытием (seqovl):
rawsend_payload_segmented(desync, part2, split_pos - seqovl)`,
  test: `--debug --lua-desync=multisplit:pos=host:seqovl=5
# в дампе: части с правильными seq, авто-разбиение по MSS`,
  how: [
    "offset — 0-based сдвиг sequence, не 1-based позиция.",
    "Не режь на MSS вручную — функция сделает сама.",
    "При неудаче верни PASS, не ставь replay_drop_set.",
    "opts можно передать явно (как в fakedsplit: opts_orig/opts_fake)."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }, { page: "deep/apply_fooling", label: "apply_fooling" }]
};

export const replay_first = {
  id: "replay_first", title: "Разбор: replay_first / replay_drop", kind: "helper",
  lead: "Управление многопакетными пейлоадами: действовать один раз на сообщение, а не на каждую часть.",
  tags: ["helper", "replay", "ядро"],
  idea: [
    "Большой ClientHello приходит несколькими пакетами. C-код задерживает их, собирает reasm, затем «проигрывает» (replay) части по цепочке инстансов.",
    "Без защиты функция отправит фейк/разбиение столько раз, сколько частей. replay_first/replay_drop решают это."
  ],
  ideaTable: [
    ["replay_first(desync)", "true на первой части (или если replay нет)"],
    ["replay_drop_set(desync)", "пометить: последующие части дропать"],
    ["replay_drop(desync)", "проверить: дропать ли текущую часть"]
  ],
  wire: [{ caption: "ClientHello из 3 пакетов:", diagram:
`часть1: replay_first=true  → отправляем весь reasm → replay_drop_set → DROP
часть2: replay_first=false → replay_drop=true → DROP
часть3: replay_first=false → replay_drop=true → DROP
(фейк/разбиение отправлены ОДИН раз)` }],
  api: [
    { name: "desync.replay", from: "desync", sig: "if desync.replay then ... end", ret: "true/false", text: "Идёт ли перепроигрывание." },
    { name: "desync.reasm_data", from: "desync", sig: "local data = desync.reasm_data", ret: "собранный пейлоад", text: "Полное сообщение для отправки." }
  ],
  lines: [{ title: "канонический паттерн", items: [
    ["if replay_first(desync) then", "Первая часть — действуем."],
    ["if rawsend_payload_segmented(desync, desync.reasm_data) then", "Отправляем всё сообщение."],
    ["replay_drop_set(desync)", "Помечаем последующие на дроп."],
    ["return VERDICT_DROP end", "Первую часть дропаем (она уже отправлена в重组 виде)."],
    ["else", "Не первая часть."],
    ["if replay_drop(desync) then return VERDICT_DROP end", "Дропаем, если помечено."],
    ["end", "Иначе пропускаем."]
  ]}],
  bugs: [
    { level: "crit", title: "replay_drop_set на поздних частях", breaks: "Если первая отправка не удалась (PASS), поздние части всё равно дропаются → сообщение обрезано → соединение рвётся.", fix: "На поздних частях только replay_drop (проверка). replay_drop_set — лишь после успешной отправки." },
    { level: "warn", title: "Нет защиты вообще", breaks: "Фейк/разбиение на каждую часть → дубли в сети.", fix: "Всегда replay_first в начале действия." }
  ],
  fixTitle: "Канонический паттерн",
  fix: `if replay_first(desync) then
    if rawsend_payload_segmented(desync, desync.reasm_data) then
        replay_drop_set(desync)
        return VERDICT_DROP
    end
    return VERDICT_PASS   -- не удалось: оригинал дойдёт
else
    if replay_drop(desync) then return VERDICT_DROP end
    return VERDICT_PASS
end`,
  test: `--debug --lua-desync=multisplit:pos=host
# в логе: "not acting on further replay pieces" для частей 2,3`,
  how: [
    "Действуй на replay_first, не на каждую часть.",
    "replay_drop_set — только после успешной отправки всего reasm.",
    "На поздних частях — replay_drop (проверка), не set.",
    "Не удалось отправить — PASS и без флага дропа."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }]
};