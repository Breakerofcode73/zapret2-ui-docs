export const fake_ip_misdirection = {
  id: "fake_ip_misdirection", title: "Разбор: fake_ip_misdirection", kind: "custom",
  lead: "Фейк с подменённым адресом, коротким TTL и битой суммой. Замысел верный, реализация — нет: 4 из 5 модификаций не применяются.",
  tags: ["desync", "fake", "твой код", "6 дефектов"],
  idea: [
    "Подсунуть DPI пакет, похожий на ClientHello, но который не дойдёт до сервера: адрес TEST-NET-1 (не маршрутизируется), TTL=1 (умирает на первом хопе), битая сумма (сервер дропнет).",
    "Дополнительно случайный seq и сдвинутый timestamp мешают DPI склеить фейк с реальным потоком."
  ],
  ideaTable: [
    ["ip_dst=192.0.2.1", "TEST-NET-1 (RFC 5737), не маршрутизируется глобально"],
    ["ip_ttl=1", "умирает на первом маршрутизаторе"],
    ["badsum=true", "невалидная L4-сумма → сервер дропнет"],
    ["tcp_seq=rnd / tcp_ts=-600000", "мешают сборке потока у DPI"]
  ],
  ideaNote: "TTL=1 не гарантирует видимость DPI: если DPI глубже первого хопа, фейк не доедет. Реальный TTL — экспериментом или ip_autottl.",
  wire: [
    { caption: "Как задумано:", diagram:
`фейк:     [dst=192.0.2.1 ttl=1][seq=RND][ClientHello] badsum → умирает на 1-м хопе
оригинал: [dst=СЕРВЕР ttl=64][seq=S][ClientHello] → PASS → сервер
DPI:      видит фейк → вывод → оригинал мимо` },
    { caption: "Как работает сейчас:", diagram:
`фейк:     [dst=СЕРВЕР ttl=64][seq=S][ClientHello] badsum → летит на сервер
оригинал: то же самое
DPI:      ДВА одинаковых ClientHello (дубль, не misdirection)` }
  ],
  wireNote: "Причина: reconstruct знает только badsum. Остальные поля лежат в таблице и никем не читаются.",
  api: [
    { name: "desync_opts", from: "zapret-lib", sig: "local opts = desync_opts(desync)", ret: "{rawsend, reconstruct, ipfrag, ipid, fooling}", text: "Разные словари для разных стадий. Поля нельзя сваливать в reconstruct." },
    { name: "deepcopy", from: "zapret-lib", sig: "local dis = deepcopy(desync.dis)", ret: "копия", text: "Использована правильно." },
    { name: "apply_fooling", from: "zapret-lib", sig: "apply_fooling(desync, dis)", ret: "модифицирует dis", text: "Вот где живут ip_ttl, tcp_seq, tcp_ts, tcp_md5." },
    { name: "apply_ip_id", from: "zapret-lib", sig: "apply_ip_id(desync, dis, nil, 'rnd')", ret: "модифицирует dis", text: "Режимы seq|rnd|zero|none. Не reconstruct." },
    { name: "rawsend_dissect_ipfrag", from: "zapret-lib", sig: "rawsend_dissect_ipfrag(dis, opts)", ret: "true", text: "Проверенный путь (как в send): реконструкция + ipfrag + отсылка." },
    { name: "pton", from: "C API", sig: "dis.ip.ip_dst = pton('192.0.2.1')", ret: "blob", text: "Адрес — бинарный blob, не строка." },
    { name: "u32 / brandom", from: "C API", sig: "dis.tcp.th_seq = u32(brandom(4))", ret: "случайное 32-бит", text: "Портируемая замена math.random(0, 0xFFFFFFFF)." }
  ],
  lines: [{ title: "исходник", items: [
    ["function fake_ip_misdirection(ctx, desync)", "Глобальная → доступна как --lua-desync."],
    ["if not desync.outgoing or #desync.dis.payload == 0 then", "Только исходящие с данными. Нет проверки tcp/udp — icmp пройдёт."],
    ["return VERDICT_PASS", "Ранний выход, оригинал не тронут."],
    ["local opts_fake = desync_opts(desync)", "Композиционные opts."],
    ["opts_fake.reconstruct.ip_dst = ...", "❌ У reconstruct нет ip_dst. Игнорируется."],
    ["opts_fake.reconstruct.ip_ttl = tonumber(...) or 1", "❌ ttl — это fooling/dis.ip.ip_ttl."],
    ["opts_fake.reconstruct.badsum = true", "✅ Единственная верная опция reconstruct."],
    ["opts_fake.reconstruct.ip_id = 'rnd'", "❌ ip_id — apply_ip_id."],
    ["opts_fake.reconstruct.tcp_seq = math.random(0, 0xFFFFFFFF)", "❌ Не reconstruct + непортируемый math.random."],
    ["opts_fake.reconstruct.tcp_ts = -600000", "❌ tcp_ts — fooling, добавляется к существующему."],
    ["local fake_dis = deepcopy(desync.dis)", "✅ Копия."],
    ["rawsend_dissect(fake_dis, opts_fake.rawsend, opts_fake.reconstruct)", "⚠️ Сигнатуру сверь; поля выше проигнорированы."],
    ["return VERDICT_PASS", "Оригинал проходит — верно для фейка."]
  ]}],
  bugs: [
    { level: "crit", title: "Модификации не в тот словарь", breaks: "ip_dst, ip_ttl, ip_id, tcp_seq, tcp_ts игнорируются. Фейк = копия с битой суммой на сервер. Misdirection нет.", fix: "Адрес/TTL — в диссект; seq/ts — apply_fooling; ip_id — apply_ip_id; reconstruct — только badsum." },
    { level: "crit", title: "Нет replay-защиты", breaks: "Фейк на каждую часть многопакетного hello.", fix: "replay_first + replay_drop." },
    { level: "crit", title: "Нет cutoff", breaks: "Вызов на каждом исходящем пакете до конца соединения.", fix: "instance_cutoff_shim после отправки." },
    { level: "warn", title: "Строка вместо blob в адресе", breaks: "ASCII вместо 4 байт.", fix: "pton()." },
    { level: "warn", title: "math.random(0, 0xFFFFFFFF)", breaks: "Непортируемо в LuaJIT.", fix: "u32(brandom(4))." },
    { level: "info", title: "Немая функция", breaks: "Нет DLOG — не видно, сработала ли.", fix: "if b_debug then DLOG(...) end." }
  ],
  fixTitle: "Исправленная версия",
  fix: `function fake_ip_misdirection(ctx, desync)
    if not (desync.dis.tcp or desync.dis.udp) then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return end
    if not payload_check(desync) then return end
    if #desync.dis.payload == 0 then return end
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return
    end
    local dis = deepcopy(desync.dis)
    apply_fooling(desync, dis)
    apply_ip_id(desync, dis, nil, "rnd")
    local dst = desync.arg.ip_dst or "192.0.2.1"
    local ttl = tonumber(desync.arg.ttl) or 1
    if dis.ip then dis.ip.ip_dst = pton(dst); dis.ip.ip_ttl = ttl
    elseif dis.ip6 then dis.ip6.ip6_dst = pton(dst); dis.ip6.ip6_hlim = ttl end
    if dis.tcp then dis.tcp.th_seq = u32(brandom(4)) end
    local opts = desync_opts(desync)
    opts.reconstruct.badsum = true
    if b_debug then DLOG("fake_ip_misdirection: dst="..dst.." ttl="..ttl) end
    rawsend_dissect_ipfrag(dis, opts)
    instance_cutoff_shim(ctx, desync)
    return VERDICT_PASS
end`,
  fixNote: "Имена полей адресов сверь через pktdebug. PASS в обоих случаях намеренно: фейк не блокирует оригинал.",
  test: `--lua-desync=pktdebug          # имена полей
--debug --lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ttl=1
--lua-init=@zapret-pcap.lua    # в дампе: два РАЗНЫХ получателя`,
  testNote: "Успех: фейк на 192.0.2.1 с ttl=1, оригинал на сервер. Если оба на сервер — модификации не применились.",
  how: [
    "Определи, что должно умереть: фейк (ttl/адрес/сумма) или оригинал (DROP).",
    "deepcopy перед изменением.",
    "Разложи по стадиям: поля dis → apply_fooling → apply_ip_id → reconstruct → ipfrag → rawsend.",
    "Строку в blob — pton/parse_hex/buX.",
    "Каркас: транспорт → direction/payload → replay → действие → cutoff → вердикт."
  ],
  seeAlso: [{ page: "deep/fake", label: "fake" }, { page: "deep/apply_fooling", label: "apply_fooling" }, { page: "deep/pton", label: "pton" }]
};

export const outline_random_split = {
  id: "outline_random_split", title: "Разбор: outline_random_split", kind: "custom",
  lead: "Случайный рез внутри SNI + fallback на 1 байт для неполного hello + перекрытие sequence. 5 дефектов, один рвёт соединение.",
  tags: ["desync", "segmentation", "твой код", "5 дефектов"],
  idea: [
    "Разрезав TCP-поток внутри имени хоста в случайной точке, ломаешь сигнатуры по offset и усложняешь сборку для DPI.",
    "Fallback split=1 для неполного ClientHello рвёт TLS record header. seqovl добавляет перекрытие второму сегменту."
  ],
  ideaTable: [
    ["resolve_range host,endhost-1", "границы имени хоста"],
    ["math.random внутри границ", "случайная точка реза на каждое соединение"],
    ["fallback split=1", "если hello неполный и маркеры не разрешаются"],
    ["seqovl на второй сегмент", "перекрытие sequence для слабой сборки DPI"]
  ],
  wire: [{ caption: "split_pos=133, seqovl=5:", diagram:
`сегмент1: seq=S+0    data[1..133]
сегмент2: seq=S+128  data[129..517]  (5 байт перекрытия)
оригинал: DROP (или PASS при nodrop)
сервер:   склеивает по seq → исходные 517 байт` }],
  wireNote: "Перекрытие не портит данные: TCP допускает перекрывающиеся сегменты, стек берёт первую версию байтов.",
  api: [
    { name: "string.byte", from: "Lua", sig: "local b1,b2 = string.byte(data,1,2)", ret: "коды байтов", text: "1-based, несколько значений." },
    { name: "pcall", from: "Lua", sig: "local ok,r = pcall(resolve_range, ...)", ret: "ok, result", text: "Защита от error в resolve_range." },
    { name: "resolve_range", from: "C API", sig: "resolve_range(data, l7, 'host,endhost-1', true)", ret: "[start,end]", text: "Как в hostfakesplit." },
    { name: "rawsend_payload_segmented", from: "zapret-lib", sig: "rawsend_payload_segmented(desync, part, offset)", ret: "true", text: "Авто-сегментация, offset 0-based." },
    { name: "replay_first / replay_drop", from: "zapret-lib", sig: "if replay_first(desync) then ... end", ret: "true", text: "Защита многопакетных." }
  ],
  lines: [
    { title: "is_complete_client_hello", start: 3, items: [
      ["local function is_complete_client_hello(data)", "local → внутренний хелпер, инстансом не вызвать."],
      ["if not data or #data < 6 then return false end", "Защита от nil/короткого буфера."],
      ["local b1,b2 = string.byte(data,1,2)", "Тип записи и версия."],
      ["if b1 ~= 0x16 or b2 ~= 0x03 then return false end", "0x16=handshake, 0x03=TLS major."],
      ["local rlen = byte(4)*256 + byte(5)", "16-бит big-endian длина записи."],
      ["return #data >= 5 + rlen", "Полнота: заголовок + тело."]
    ]},
    { title: "find_split_pos", start: 11, items: [
      ["local ok, host_range = pcall(resolve_range, ...)", "Защищённый поиск диапазона host."],
      ["if ok and host_range[1] and host_range[2] ... then", "Валидация диапазона."],
      ["sp = math.random(host_range[1], host_range[2]-1)", "Случайная точка внутри host."],
      ["local fb = math.random(floor(len*0.25), floor(len*0.75))", "Fallback: средняя половина."]
    ]},
    { title: "outline_random_split", start: 30, items: [
      ["if not desync.dis.tcp then instance_cutoff_shim return end", "❌ Отключается и на icmp (эталон — нет)."],
      ["data = reasm_data or blob or payload", "⚠️ Приоритет reasm над блобом (эталон — наоборот)."],
      ["if not replay_first then replay_drop_set return DROP end", "❌ set на поздних частях вместо проверки."],
      ["if not is_complete_client_hello(data) then", "❌ Срабатывает и для http/unknown."],
      ["local p1 = sub(data,1,1) local p2 = sub(data,2)", "Fallback: 1 байт + остальное."],
      ["if seqovl > 0 and split_pos >= seqovl then", "❌ Допускает равенство → дубль с начала."],
      ["part2 = overlap .. part2", "Перекрытие второму сегменту."],
      ["replay_drop_set return nodrop and PASS or DROP", "После успеха — верно."]
    ]}
  ],
  bugs: [
    { level: "crit", title: "replay_drop_set на поздних частях", breaks: "Если первая отправка не удалась (PASS), поздние части всё равно дропаются → сообщение обрезано → соединение рвётся.", fix: "На поздних — только replay_drop (проверка); set — после успешной отправки." },
    { level: "crit", title: "seqovl == split_pos", breaks: "Вторая часть получает offset 0 и всё сообщение → полный дубль с начала.", fix: "if seqovl >= split_pos then seqovl = 0 end." },
    { level: "crit", title: "Fallback на любом не-TLS", breaks: "http-запрос режется после 'G'.", fix: "Гейт: desync.l7payload == 'tls_client_hello'." },
    { level: "warn", title: "Нет direction_check/payload_check", breaks: "Аргументы dir/payload игнорируются.", fix: "Добавить оба вызова." },
    { level: "warn", title: "Приоритет reasm над блобом", breaks: "arg.blob молча не действует для многопакетных.", fix: "blob_or_def → reasm → payload." }
  ],
  fixTitle: "Исправленная версия",
  fix: `local function tls_record_complete(data)
    if not data or #data < 5 then return false end
    if string.byte(data,1) ~= 0x16 or string.byte(data,2) ~= 0x03 then return false end
    local rlen = string.byte(data,4)*256 + string.byte(data,5)
    return rlen > 0 and #data >= 5 + rlen
end
local function pick_split_pos(desync, data)
    local len = #data
    if len < 20 then return nil end
    local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
    if ok and r and r[1] and r[2] and r[1] >= 1 and r[2] >= r[1] and r[2] <= len then
        return (r[2] > r[1]) and math.random(r[1], r[2]-1) or r[1]
    end
    local lo = math.max(1, math.floor(len*0.25))
    return math.random(lo, math.max(lo, math.floor(len*0.75)))
end
function outline_random_split(ctx, desync)
    if not desync.dis.tcp then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return end
    if not payload_check(desync) then return end
    local data = blob_or_def(desync, desync.arg.blob) or desync.reasm_data or desync.dis.payload
    if not data or #data == 0 then return end
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return
    end
    local len = #data
    local split_pos
    if desync.l7payload == "tls_client_hello" and not tls_record_complete(data) then
        split_pos = 1
    else
        if len < 20 then return end
        split_pos = pick_split_pos(desync, data)
    end
    if not split_pos or split_pos < 1 or split_pos >= len then return end
    local seqovl = tonumber(desync.arg.seqovl) or 0
    if seqovl < 0 then seqovl = 0 end
    if seqovl >= split_pos then seqovl = 0 end
    local p1 = string.sub(data, 1, split_pos)
    local p2 = string.sub(data, split_pos + 1)
    local off2 = split_pos
    if seqovl > 0 then
        p2 = string.sub(data, split_pos - seqovl + 1, split_pos) .. p2
        off2 = split_pos - seqovl
    end
    if not rawsend_payload_segmented(desync, p1, 0) then return VERDICT_PASS end
    if not rawsend_payload_segmented(desync, p2, off2) then return VERDICT_PASS end
    replay_drop_set(desync)
    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP
end`,
  test: `--debug --lua-desync=outline_random_split:seqovl=5
# граничные: seqovl=0, seqovl=split_pos (отмена), неполный hello, http_req
--lua-init=@zapret-pcap.lua`,
  how: [
    "Источник: блоб → reasm → payload.",
    "Валидируй точку реза: 1 <= pos < len.",
    "seqovl отменяй при >= точки реза.",
    "replay_drop_set только после успеха; на поздних — replay_drop.",
    "Fallback-ветку гейти по l7payload."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }, { page: "deep/replay_first", label: "replay_first" }, { page: "deep/resolve_pos", label: "resolve_pos" }]
};