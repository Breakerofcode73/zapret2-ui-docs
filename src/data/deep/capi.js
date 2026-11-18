export const resolve_pos = {
  id: "resolve_pos", title: "Разбор: resolve_pos / resolve_multi_pos / resolve_range", kind: "c",
  lead: "Разрешают символьные маркеры (host, midsld, -10) в байтовые позиции пейлоада. Основа всей сегментации.",
  tags: ["C API", "маркеры", "ядро"],
  sig: "resolve_pos(data, l7payload, marker)",
  args: [
    ["data", "string", "обязателен", "пейлоад, в котором ищем позицию"],
    ["l7payload", "string", "обязателен", "тип пейлоада: desync.l7payload"],
    ["marker", "string", "обязателен", "'host', 'midsld+1', '-10', '5'"],
    ["sorted (range)", "boolean", "нет", "4-й аргумент resolve_range, как в hostfakesplit"]
  ],
  ret: "resolve_pos → число (1-based) или nil; resolve_multi_pos → массив; resolve_range → пара позиций, nil или error",
  idea: [
    "Вместо ручного подсчёта байтов ты пишешь 'host' или 'midsld+1' — C-код находит реальную позицию с учётом протокола.",
    "Один и тот же маркер в http и tls даёт разные смещения: host в http — заголовок Host, в tls — расширение SNI."
  ],
  ideaTable: [
    ["resolve_pos", "один маркер → одна позиция"],
    ["resolve_multi_pos", "список через запятую → массив точек реза"],
    ["resolve_range", "ровно два маркера → диапазон [start, end]"],
    ["1-based", "все результаты в Lua-индексах; для сдвига sequence вычитай 1"]
  ],
  ideaNote: "Полный список маркеров по протоколам — в мануале, раздел «маркеры». Здесь разобраны подтверждённые практикой: числа, отрицательные, host, endhost, midsld и арифметика ±N.",
  wire: [{ caption: "resolve_pos(data, 'tls_client_hello', 'host')", diagram:
`ClientHello: [record hdr][handshake][...][SNI: "example.com"]
                                            ↑
resolve_pos → 120 (1-based)
string.sub(data, 120, 130) → "example.com"
сдвиг sequence для этой позиции → 119 (0-based)` }],
  wireNote: "endhost в разных вызовах ведёт себя по-разному: в http_domcase он exclusive (берут h[2]-1), в hostfakesplit диапазон задают как 'host,endhost-1'. Всегда сверяй по дампу.",
  api: [
    { name: "resolve_pos", from: "C API", sig: "local p = resolve_pos(data, desync.l7payload, 'host')", ret: "число или nil", text: "nil означает «маркер не найден» — это штатная ситуация, а не ошибка." },
    { name: "resolve_multi_pos", from: "C API", sig: "local arr = resolve_multi_pos(data, l7, '1,host,midsld+1')", ret: "массив позиций", text: "Точки реза для multisplit/multidisorder." },
    { name: "resolve_range", from: "C API", sig: "local ok, r = pcall(resolve_range, data, l7, 'host,endhost-1', true)", ret: "пара позиций / nil / error", text: "Может вызвать error при неразрешимых маркерах — отсюда pcall." },
    { name: "delete_pos_1", from: "zapret-lib", sig: "delete_pos_1(arr)", ret: "ничего", text: "Убирает позицию 1: резать по первому байту нельзя." },
    { name: "zero_based_pos", from: "zapret-lib", sig: "zero_based_pos(arr)", ret: "массив 0-based", text: "Только для красивых логов, не для расчётов." }
  ],
  lines: [{ title: "типовое использование", items: [
    ["local p = resolve_pos(data, desync.l7payload, desync.arg.pos)", "Маркер из аргумента инстанса → позиция."],
    ["if not p then DLOG('cannot resolve') return end", "nil обработан: функция тихо выходит, пакет проходит."],
    ["local arr = resolve_multi_pos(data, l7, '1,host,midsld+1,-10')", "Список точек реза одной строкой."],
    ["delete_pos_1(arr)", "Выкидываем позицию 1 — иначе получится пустая первая часть."],
    ["if #arr == 0 then return end", "После фильтрации точек может не остаться — выходим."],
    ["local ok, r = pcall(resolve_range, data, l7, 'host,endhost-1', true)", "Защищённый вызов: error не уронит инстанс."],
    ["if ok and r and r[1] >= 1 and r[2] <= #data then", "Валидация диапазона перед string.sub."],
    ["local host = string.sub(data, r[1], r[2])", "Вырезаем имя хоста включительно."],
    ["rawsend_payload_segmented(desync, part, r[1] - 1)", "1-based позиция → 0-based сдвиг sequence."]
  ]}],
  syntax: [
    ["pcall(f, ...)", "возвращает ok, result; ловит error внутри C-функции"],
    ["and / or в условии", "короткое замыкание: при nil дальше не вычисляется"],
    ["#arr", "длина массива позиций"],
    ["r[1] - 1", "перевод Lua-индекса в сетевое смещение"]
  ],
  bugs: [
    { level: "warn", title: "resolve_range без pcall", breaks: "На пейлоаде без имени хоста (unknown, dht) вызов может упасть → «desync ERR», пакет пройдёт без обработки.", fix: "Оборачивай в pcall, как в hostfakesplit и в твоём random_split." },
    { level: "warn", title: "Путаница 1-based и 0-based", breaks: "Сдвиг sequence на единицу больше нужного → сервер получает дубль或缺 байт, соединение ломается.", fix: "resolve_* дают 1-based; offset для rawsend_payload_segmented = pos - 1." },
    { level: "info", title: "Список вместо пары в resolve_range", breaks: "Функция ждёт ровно два маркера; список из трёх — ошибка.", fix: "Для списка используй resolve_multi_pos." }
  ],
  fixTitle: "Рабочие фрагменты",
  fix: `-- одна точка (multisplit-стиль)
local p = resolve_pos(data, desync.l7payload, desync.arg.pos or "host")
if not p then return end

-- список точек реза
local pos = resolve_multi_pos(data, desync.l7payload, "1,host,midsld+1,-10")
delete_pos_1(pos)
if #pos == 0 then return end

-- диапазон имени хоста, защищённо
local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
if ok and r and r[1] and r[2] and r[1] >= 1 and r[2] >= r[1] and r[2] <= #data then
    local host = string.sub(data, r[1], r[2])
    if b_debug then DLOG("host=" .. host .. " at " .. (r[1] - 1)) end
end`,
  test: `-- посмотреть позиции потока и тип пейлоада
--lua-desync=posdebug
-- проверить конкретный маркер
--lua-desync=luaexec:code=DLOG(tostring(resolve_pos(desync.dis.payload,desync.l7payload,"host")))
-- в дампе: смещение имени хоста должно совпадать с реальным`,
  testNote: "Если маркер возвращает nil на tls — проверь, что пейлоад действительно tls_client_hello, а не unknown.",
  how: [
    "Маркер зависит от протокола: всегда передавай desync.l7payload, а не константу.",
    "nil — штатный результат, обработай ветку без error.",
    "resolve_range может бросить error — только через pcall.",
    "Для sequence вычитай 1; для string.sub — не вычитай.",
    "После resolve_multi_pos обязательно delete_pos_1 и проверка #pos."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }, { page: "deep/hostfakesplit", label: "hostfakesplit" }, { page: "deep/outline_random_split", label: "outline_random_split" }]
};

export const u32add = {
  id: "u32add", title: "Разбор: u32add", kind: "c",
  lead: "Сложение по модулю 2^32 с переносом и заёмом. Единственный корректный способ менять TCP sequence и ack.",
  tags: ["C API", "арифметика", "ядро"],
  sig: "u32add(a, b, ...)",
  args: [
    ["a", "number", "обязателен", "исходное значение (например th_seq)"],
    ["b, ...", "number", "нет", "любое число слагаемых, отрицательные допустимы"]
  ],
  ret: "number в диапазоне 0..4294967295",
  idea: [
    "TCP sequence — 32-битный счётчик, который переполняется: после 4294967295 идёт 0. Обычная арифметика Lua этого не знает.",
    "u32add делает модульную арифметику как в реальном TCP, поэтому одинаково работает и в LuaJIT (double), и в PUC Lua 5.3+ (int64)."
  ],
  ideaTable: [
    ["u32add(4294967290, 10)", "4 — перенос через границу"],
    ["u32add(0, -1)", "4294967295 — заём"],
    ["u32add(100, 5, -3)", "102 — несколько слагаемых"],
    ["u32(brandom(4))", "портируемое случайное 32-битное число"]
  ],
  ideaNote: "Семейство uXadd существует для 8/16/24/32/48 бит. Разрядность должна совпадать с полем: th_win — 16 бит, th_seq — 32.",
  wire: [{ caption: "Сдвиг sequence для oob / seqovl", diagram:
`было:  th_seq = 0
-1:    u32add(0, -1) = 4294967295   ← корректно, пакет валиден
       0 - 1        = -1            ← невалидно, пакет отбросят

было:  th_seq = 4294967290
+10:   u32add(...) = 4              ← перенос
       ... + 10    = 4294967300     ← вне диапазона поля` }],
  api: [
    { name: "u32add", from: "C API", sig: "dis.tcp.th_seq = u32add(dis.tcp.th_seq, -1)", ret: "number", text: "Функция чистая: результат нужно присвоить, аргумент не мутируется." },
    { name: "u32", from: "C API", sig: "local n = u32(blob)", ret: "32-битное число из блоба", text: "Чтение поля в сетевом порядке байтов." },
    { name: "bu32", from: "C API", sig: "local b = bu32(n)", ret: "4 байта big-endian", text: "Обратно в бинарный вид." },
    { name: "brandom", from: "C API", sig: "brandom(4)", ret: "4 случайных байта", text: "В паре с u32 даёт случайный seq без math.random." },
    { name: "apply_fooling", from: "zapret-lib", sig: "apply_fooling(desync, dis)", text: "Внутри уже использует u32add для аргументов tcp_seq/tcp_ack." }
  ],
  lines: [{ title: "типовое использование", items: [
    ["dis.tcp.th_seq = u32add(dis.tcp.th_seq, -1)", "Уменьшить seq на 1 — приём из oob и seqovl."],
    ["dis.tcp.th_ack = u32add(dis.tcp.th_ack, 1)", "Компенсация ack во входящем направлении."],
    ["dis.tcp.th_seq = u32(brandom(4))", "Случайный seq вне окна для фейка."],
    ["local seq = u32(tcp_header_blob)", "Прочитать seq из сырого заголовка."],
    ["local b = bu32(seq)", "Собрать поле обратно в блоб."],
    ["-- НЕ: dis.tcp.th_seq = dis.tcp.th_seq - 1", "Обычное вычитание ломает пакет на границе диапазона."]
  ]}],
  syntax: [
    ["функция чистая", "u32add возвращает значение, а не меняет аргумент — присваивание обязательно"],
    ["отрицательное слагаемое", "u32add(x, -1) корректно занимает старший разряд"],
    ["несколько аргументов", "u32add(a, b, c) складывает все по модулю 2^32"],
    ["u32(brandom(4))", "композиция двух C-функций вместо math.random"]
  ],
  bugs: [
    { level: "crit", title: "Обычная арифметика вместо u32add", breaks: "При seq=0 выражение seq-1 даст -1 → невалидный заголовок; при больших seq в LuaJIT теряется точность.", fix: "Всегда u32add для th_seq/th_ack." },
    { level: "warn", title: "math.random(0, 0xFFFFFFFF)", breaks: "В LuaJIT большой диапазон может вызвать ошибку аргумента — поведение отличается от PUC Lua.", fix: "u32(brandom(4))." },
    { level: "warn", title: "Не та разрядность", breaks: "u32add для 16-битного поля (th_win) даст значение вне диапазона поля.", fix: "Для окна — u16add." },
    { level: "info", title: "Забытое присваивание", breaks: "Строка u32add(dis.tcp.th_seq, -1) без присваивания ничего не меняет.", fix: "Присвой результат полю." }
  ],
  fixTitle: "Рабочие фрагменты",
  fix: `-- сдвиг sequence (копия диссекта!)
local dis = deepcopy(desync.dis)
if dis.tcp then
    dis.tcp.th_seq = u32add(dis.tcp.th_seq, -1)
end

-- компенсация ack на входящих
if desync.dis.tcp and not desync.outgoing then
    desync.dis.tcp.th_ack = u32add(desync.dis.tcp.th_ack, 1)
    return VERDICT_MODIFY
end

-- случайный seq для фейка (портируемо)
dis.tcp.th_seq = u32(brandom(4))

-- 16-битное поле окна
dis.tcp.th_win = u16add(dis.tcp.th_win, -1)`,
  test: `--lua-desync=luaexec:code=DLOG(u32add(0,-1))
# ожидаем 4294967295
--lua-desync=luaexec:code=DLOG(u32add(4294967290,10))
# ожидаем 4`,
  testNote: "Если вместо этого видишь -1 или 4294967300 — используется обычная арифметика, а не u32add.",
  how: [
    "seq/ack — только u32add, без исключений.",
    "Разрядность uXadd должна совпадать с разрядностью поля.",
    "Случайные числа — u32(brandom(N)), не math.random с большим диапазоном.",
    "Результат всегда присваивай: функция не мутирует аргумент.",
    "Меняешь копию — deepcopy; меняешь оригинал — VERDICT_MODIFY."
  ],
  seeAlso: [{ page: "deep/apply_fooling", label: "apply_fooling" }, { page: "deep/oob", label: "oob" }, { page: "deep/fake_ip_misdirection", label: "fake_ip_misdirection" }]
};

export const pton = {
  id: "pton", title: "Разбор: pton / ntop", kind: "c",
  lead: "Конвертация IP-адреса: текст ↔ бинарный блоб. Поля адресов в диссекте бинарные, строку в них класть нельзя.",
  tags: ["C API", "IP", "ядро"],
  sig: "pton(str) / ntop(blob)",
  args: [
    ["str (pton)", "string", "обязателен", "'192.0.2.1' или '2001:db8::1'"],
    ["blob (ntop)", "string", "обязателен", "4 байта для IPv4, 16 для IPv6"]
  ],
  ret: "pton → блоб 4/16 байт; ntop → читаемая строка",
  idea: [
    "В заголовке IP адрес занимает 4 байта (ipv4) или 16 (ipv6). Lua-строка '192.0.2.1' — это 11 ASCII-байт, совсем другое.",
    "pton превращает текст в сетевое бинарное представление, ntop — обратно для логов. Версия IP определяется автоматически."
  ],
  ideaTable: [
    ["pton('192.0.2.1')", "4 байта: C0 00 02 01"],
    ["pton('2001:db8::1')", "16 байт"],
    ["ntop(dis.ip.ip_dst)", "строка для DLOG"],
    ["TEST-NET-1", "192.0.2.0/24 не маршрутизируется глобально — удобно для фейков"]
  ],
  ideaNote: "Точные имена полей адресов в диссекте сверь дампом --lua-desync=pktdebug: в разных сборках они могут отличаться. Ниже использованы ip_dst / ip6_dst.",
  wire: [{ caption: "Подмена получателя у фейка", diagram:
`оригинал: [ip dst=СЕРВЕР ][tcp][ClientHello] → PASS
фейк:     [ip dst=192.0.2.1][tcp][ClientHello] → умирает по маршруту

присваивание строкой:
  dis.ip.ip_dst = "192.0.2.1"   → 11 ASCII-байт вместо 4 → заголовок разрушен
присваивание блобом:
  dis.ip.ip_dst = pton("192.0.2.1") → 4 байта → корректный пакет` }],
  wireNote: "После подмены адреса контрольные суммы TCP/UDP зависят от псевдозаголовка — реконструкция в rawsend_dissect пересчитывает их сама; при ручной сборке используй csum_tcp_fix.",
  api: [
    { name: "pton", from: "C API", sig: "local b = pton('192.0.2.1')", ret: "блоб", text: "Единственный корректный способ записать адрес в диссект." },
    { name: "ntop", from: "C API", sig: "DLOG('dst=' .. ntop(dis.ip.ip_dst))", ret: "строка", text: "Без ntop в логе будут непечатные байты." },
    { name: "csum_tcp_fix", from: "C API", sig: "csum_tcp_fix(pkt)", text: "Нужен при ручной сборке пакета после смены адреса." },
    { name: "get_source_ip", from: "C API", sig: "get_source_ip(target)", ret: "блоб адреса", text: "Какой локальный адрес выбрала бы ОС для маршрута." }
  ],
  lines: [{ title: "типовое использование", items: [
    ["local dis = deepcopy(desync.dis)", "Меняем копию: оригинал должен уйти нетронутым."],
    ["if dis.ip then dis.ip.ip_dst = pton(dst)", "IPv4: адрес как блоб."],
    ["elseif dis.ip6 then dis.ip6.ip6_dst = pton(dst) end", "IPv6: другое поле и другая длина."],
    ["if b_debug then DLOG('dst=' .. ntop(dis.ip.ip_dst)) end", "Читаемый лог под гейтом отладки."],
    ["rawsend_dissect_ipfrag(dis, opts)", "Реконструкция пересчитает суммы."],
    ["-- НЕ: dis.ip.ip_dst = '192.0.2.1'", "ASCII вместо адреса — пакет разрушен."]
  ]}],
  syntax: [
    ["if / elseif по dis.ip и dis.ip6", "одно из полей всегда nil — ветвление обязательно"],
    ["ntop внутри конкатенации", "блоб нельзя склеить со строкой напрямую, нужен ntop"],
    ["deepcopy перед правкой", "иначе изменишь оригинал"],
    ["b_debug-гейт", "лог только при --debug"]
  ],
  bugs: [
    { level: "crit", title: "Строка вместо pton", breaks: "В поле адреса попадают ASCII-байты: заголовок невалиден, пакет отбрасывается первым же узлом — эффекта фейка нет.", fix: "dis.ip.ip_dst = pton('192.0.2.1')." },
    { level: "crit", title: "Адрес положен в reconstruct", breaks: "opts.reconstruct.ip_dst не существует и молча игнорируется — фейк уйдёт на настоящий сервер.", fix: "Меняй поле диссекта, а не opts.reconstruct." },
    { level: "warn", title: "IPv4-адрес в ipv6-поле", breaks: "4 байта в 16-байтовом поле ломают заголовок.", fix: "Ветвление по dis.ip / dis.ip6 и адрес соответствующего семейства." },
    { level: "info", title: "Неверное имя поля", breaks: "Обращение к nil-полю — ошибка инстанса.", fix: "Сверь имена через pktdebug." }
  ],
  fixTitle: "Рабочий фрагмент",
  fix: `local dis = deepcopy(desync.dis)
local dst = desync.arg.ip_dst or "192.0.2.1"

if dis.ip then
    dis.ip.ip_dst = pton(dst)
elseif dis.ip6 then
    dis.ip6.ip6_dst = pton(dst)
end

if b_debug then
    DLOG("fake dst=" .. (dis.ip and ntop(dis.ip.ip_dst) or ntop(dis.ip6.ip6_dst)))
end

local opts = desync_opts(desync)
opts.reconstruct.badsum = true
rawsend_dissect_ipfrag(dis, opts)
return VERDICT_PASS`,
  test: `-- узнать точные имена полей адреса
--lua-desync=pktdebug
-- проверить конвертацию
--lua-desync=luaexec:code=DLOG(ntop(pton("192.0.2.1")))
# ожидаем 192.0.2.1
-- в дампе: у фейка и оригинала РАЗНЫЕ получатели`,
  testNote: "Если оба пакета идут на сервер — адрес не применился: проверь, что меняешь поле диссекта, а не opts.reconstruct.",
  how: [
    "Адрес в диссекте — блоб; запись только через pton.",
    "Для логов — ntop, иначе в консоли мусор.",
    "Всегда ветвление ipv4/ipv6: поля и длины разные.",
    "После смены адреса суммы пересчитывает реконструкция; при ручной сборке — csum_*_fix.",
    "Имена полей сверяй дампом pktdebug, а не догадкой."
  ],
  seeAlso: [{ page: "deep/fake_ip_misdirection", label: "fake_ip_misdirection" }, { page: "deep/blob", label: "blob" }, { page: "deep/fake", label: "fake" }]
};