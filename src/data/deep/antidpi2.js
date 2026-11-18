export const drop = {
  id: "drop", title: "Разбор: drop", kind: "desync",
  lead: "Дропает пакет по направлению и типу пейлоада. Ничего не отправляет — чистый запрет.",
  tags: ["desync", "базовая", "эталон"],
  sig: "function drop(ctx, desync)",
  args: [["dir", "in|out|any", "any", "какое направление дропать"], ["payload", "список типов", "all", "какие пейлоады дропать, включая пустые"]],
  std: "direction, payload", ret: "VERDICT_DROP при совпадении фильтров, иначе nil (= PASS)",
  idea: ["Простейшая стратегия: запрещает пакету уйти дальше. Полезно, чтобы отсечь трафик или проверить, что профиль вообще срабатывает."],
  ideaTable: [["dir=any", "дефолт any — дропаются оба направления, в отличие от большинства функций"], ["payload=all", "дефолт all — дропаются все пейлоады, включая пустые ACK"]],
  wire: [{ caption: "--lua-desync=drop:dir=out", diagram:
`исходящий пакет → VERDICT_DROP → в провод не уходит
входящий пакет  → nil (PASS)   → проходит` }],
  api: [
    { name: "direction_cutoff_opposite", from: "zapret-lib", sig: "direction_cutoff_opposite(ctx, desync, 'any')", text: "Третий аргумент задаёт дефолт направления для этой функции." },
    { name: "payload_check", from: "zapret-lib", sig: "payload_check(desync, 'all')", ret: "true/false", text: "Второй аргумент переопределяет дефолт known на all." }
  ],
  lines: [{ title: "function drop", items: [
    ["direction_cutoff_opposite(ctx, desync, \"any\")", "Отключает инстанс для противоположного направления; дефолт any."],
    ["if direction_check(desync, \"any\") and payload_check(desync,\"all\") then", "Оба стандартных фильтра с переопределёнными дефолтами."],
    ["DLOG(\"drop\")", "Лог факта дропа, виден с --debug."],
    ["return VERDICT_DROP", "Пакет не уйдёт в сеть."],
    ["end", "Если фильтры не совпали — возврата нет, nil = PASS."]
  ]}],
  syntax: [["and", "логическое И: оба фильтра должны совпасть"], ["nil-возврат", "отсутствие return = VERDICT_PASS"], ["\"any\" / \"all\"", "строковые дефолты, передаваемые в хелперы вторым аргументом"]],
  bugs: [{ level: "warn", title: "Забыли dir/payload", breaks: "С дефолтами any/all дропается вообще всё в профиле, включая служебные ACK — соединение умирает.", fix: "Указывай :dir=out:payload=tls_client_hello для точечного дропа." }],
  fixTitle: "Эталонный вызов", fix: `-- дропать только исходящие ClientHello
--payload=tls_client_hello --lua-desync=drop:dir=out
-- дропать всё в профиле (осторожно)
--lua-desync=drop`,
  test: `--debug --lua-desync=argdebug --lua-desync=drop:dir=out
# в логе: "drop" на каждом исходящем пакете профиля`,
  how: ["Дефолты drop отличаются от других функций: any и all.", "Дроп не отправляет ничего.", "Хороший отладочный инструмент: сайт перестал открываться — профиль работает."]
};

export const send = {
  id: "send", title: "Разбор: send", kind: "desync",
  lead: "Аналог --dup из nfqws1: отправляет копию пакета с искажениями, оригинал не трогает. Умеет отложенную отправку.",
  tags: ["desync", "дубль", "таймер", "эталон"],
  sig: "function send(ctx, desync)",
  args: [["dir", "in|out|any", "any", "направление"], ["delay", "число, мс", "нет", "отложить отправку копии"], ["repeats", "число", "1", "сколько раз отправить копию"], ["ip_ttl / tcp_md5 / badsum", "fooling", "нет", "искажения копии"]],
  std: "direction, fooling, ip_id, ipfrag, rawsend, reconstruct", ret: "nil (PASS) — оригинал всегда проходит",
  idea: ["Дублирование — простейшая атака на stateful DPI: он видит два одинаковых пакета и может неверно обновить состояние.", "С delay копия уходит позже оригинала — против DPI, принимающего решение по последнему увиденному."],
  wire: [{ caption: "send:repeats=2:ip_ttl=6", diagram:
`копия 1: [ttl=6][тот же seq][тот же payload] → в сеть
копия 2: то же самое
оригинал: без изменений → PASS` },
  { caption: "send:delay=100", diagram:
`оригинал: сразу → PASS
таймер:   через 100 мс → копия вдогонку` }],
  api: [
    { name: "deepcopy", from: "zapret-lib", sig: "local dis = deepcopy(desync.dis)", ret: "копия диссекта", text: "Искажается копия, а не оригинал." },
    { name: "apply_fooling", from: "zapret-lib", sig: "apply_fooling(desync, dis)", text: "Применяет ttl/seq/ts/md5 из аргументов к копии." },
    { name: "apply_ip_id", from: "zapret-lib", sig: "apply_ip_id(desync, dis, nil, 'none')", text: "Дефолт none — IP ID не меняется без явного аргумента." },
    { name: "timer_set", from: "C API", sig: "timer_set(name, 'send_timer_delayed', ms, true, {dis=dis, opts=opts})", text: "oneshot-таймер, данные передаются таблицей." },
    { name: "rawsend_dissect_ipfrag", from: "zapret-lib", sig: "rawsend_dissect_ipfrag(dis, desync_opts(desync))", ret: "true", text: "Реконструкция + фрагментация + отправка." }
  ],
  lines: [{ title: "function send", items: [
    ["direction_cutoff_opposite(ctx, desync, \"any\")", "Дефолт направления any."],
    ["if direction_check(desync, \"any\") then", "payload здесь НЕ проверяется — дублируются и пустые пакеты."],
    ["local dis = deepcopy(desync.dis)", "Копия диссекта."],
    ["apply_fooling(desync, dis)", "Искажения копии."],
    ["apply_ip_id(desync, dis, nil, \"none\")", "IP ID по умолчанию не трогаем."],
    ["if desync.arg.delay then", "Ветка отложенной отправки."],
    ["local tname = desync_timer_name(desync)", "Уникальное имя таймера для инстанса."],
    ["timer_set(tname, \"send_timer_delayed\", tonumber(desync.arg.delay), true, {dis=dis, opts=desync_opts(desync)})", "oneshot=true; в data кладём копию и opts."],
    ["else rawsend_dissect_ipfrag(dis, desync_opts(desync)) end", "Немедленная отправка."],
    ["function send_timer_delayed(name, data) rawsend_dissect_ipfrag(data.dis, data.opts) end", "Callback таймера отправляет сохранённое."]
  ]}],
  syntax: [["tonumber(arg.delay)", "аргументы — строки, таймеру нужно число"], ["true в timer_set", "oneshot: таймер удалится сам"], ["{dis=dis, opts=opts}", "таблица-контейнер приходит в callback как data"], ["отсутствие return", "send всегда PASS"]],
  bugs: [{ level: "info", title: "Нет payload_check", breaks: "Дублируются в том числе пустые ACK — лишний трафик.", fix: "Ограничь инстанс фильтром --payload на уровне профиля." },
    { level: "warn", title: "delay без учёта RTT", breaks: "Слишком большая задержка — копия придёт после закрытия соединения.", fix: "Подбирай delay порядка десятков мс, проверяй дампом." }],
  fixTitle: "Эталонный вызов", fix: `-- два дубля с коротким TTL
--lua-desync=send:repeats=2:ip_ttl=6
-- отложенный дубль
--lua-desync=send:delay=80:badsum`,
  test: `--debug --lua-desync=send:repeats=2:ip_ttl=6
# в дампе: 3 пакета — 2 копии с ttl=6 и оригинал`,
  how: ["send не меняет оригинал — только шлёт копии.", "deepcopy обязателен.", "delay требует tonumber и уникального имени таймера.", "Для фейка с другим содержимым — fake, а не send."]
};

export const pktmod = {
  id: "pktmod", title: "Разбор: pktmod", kind: "desync",
  lead: "Аналог --orig: искажает сам оригинальный пакет и возвращает MODIFY.",
  tags: ["desync", "модификация", "эталон"],
  sig: "function pktmod(ctx, desync)",
  args: [["dir", "in|out|any", "any", "направление"], ["ip_ttl / tcp_seq / tcp_ack / tcp_ts / tcp_md5", "fooling", "нет", "искажения оригинала"], ["ip_id", "seq|rnd|zero|none", "none", "режим IP ID"]],
  std: "direction, fooling, ip_id", ret: "VERDICT_MODIFY",
  idea: ["В отличие от send/fake, копия не создаётся: меняется сам пакет, который уйдёт в сеть.", "Опасно: искажение ttl или seq у оригинала может сломать соединение. Применяется точечно."],
  wire: [{ caption: "pktmod:tcp_ts=-600000", diagram:
`было:  [tcp ts=T][payload]
стало: [tcp ts=T-600000][payload] → MODIFY
копий нет` }],
  api: [
    { name: "apply_fooling", from: "zapret-lib", sig: "apply_fooling(desync)", text: "Без второго аргумента работает по desync.dis — по оригиналу." },
    { name: "apply_ip_id", from: "zapret-lib", sig: "apply_ip_id(desync, nil, nil, 'none')", text: "dis=nil → тоже оригинал." }
  ],
  lines: [{ title: "function pktmod", items: [
    ["direction_cutoff_opposite(ctx, desync, \"any\")", "Дефолт any."],
    ["if direction_check(desync, \"any\") then", "Фильтр направления."],
    ["apply_fooling(desync)", "Ключевая строка: нет dis → меняется оригинал."],
    ["apply_ip_id(desync, nil, nil, \"none\")", "IP ID оригинала."],
    ["DLOG(\"pktmod: applied\")", "Лог."],
    ["return VERDICT_MODIFY", "C-код отправит изменённый диссект в конце цепочки."]
  ]}],
  syntax: [["apply_fooling(desync) vs (desync, dis)", "один аргумент = оригинал, два = указанная копия"], ["VERDICT_MODIFY", "не отправляет сам; помечает диссект для отправки в конце цепочки"]],
  bugs: [{ level: "crit", title: "Искажение seq у оригинала", breaks: "tcp_seq сдвигает sequence реального потока → данные вне окна → соединение рвётся.", fix: "Для seq-искажений используй fake/send. pktmod — для безопасных полей вроде tcp_ts." },
    { level: "warn", title: "MODIFY перезаписывается DROP", breaks: "Если следующий инстанс вернёт DROP, изменения не уйдут.", fix: "Порядок агрегации: DROP > MODIFY > PASS." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=pktmod:tcp_ts=-600000
--lua-desync=pktmod:tcp_nop_del:tcp_ts_up`,
  test: `--debug --lua-desync=pktmod:tcp_ts=-600000
# в дампе: ОДИН пакет с изменённым timestamp`,
  how: ["Меняешь оригинал — возвращай MODIFY.", "seq/ack у оригинала не трогай без крайней нужды.", "apply_fooling без второго аргумента = оригинал."]
};

export const rst = {
  id: "rst", title: "Разбор: rst", kind: "desync",
  lead: "Шлёт RST (или RST,ACK) с искажениями перед оригиналом. DPI считает соединение закрытым, сервер — нет.",
  tags: ["desync", "RST", "эталон"],
  sig: "function rst(ctx, desync)",
  args: [["rstack", "флаг", "нет", "слать RST,ACK вместо чистого RST"], ["dir", "in|out|any", "any", "направление"], ["ip_ttl / tcp_md5 / badsum", "fooling", "нет", "чтобы RST не дошёл до сервера"]],
  std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ret: "nil (PASS) — оригинал проходит",
  idea: ["DPI, увидев RST, удаляет состояние соединения и перестаёт анализировать последующие пакеты.", "Чтобы сервер не закрыл реальное соединение, RST отправляется с коротким TTL, битой суммой или MD5."],
  wire: [{ caption: "rst:ip_ttl=6", diagram:
`RST:     [ttl=6][flags=RST][payload пустой] → умирает по пути
оригинал:[ttl=64][ClientHello] → PASS → сервер
DPI:     увидел RST → сбросил состояние` }],
  api: [
    { name: "replay_first", from: "zapret-lib", sig: "if replay_first(desync) then", ret: "true", text: "RST шлётся один раз на сообщение." },
    { name: "TH_RST / TH_ACK", from: "C константы", sig: "dis.tcp.th_flags = TH_RST + (desync.arg.rstack and TH_ACK or 0)", text: "Флаги TCP складываются как битовые маски." }
  ],
  lines: [{ title: "function rst", items: [
    ["if not desync.dis.tcp then ... icmp-оговорка ... return end", "RST существует только в TCP."],
    ["if direction_check(desync, \"any\") and payload_check(desync) then", "Оба фильтра, дефолт направления any."],
    ["if replay_first(desync) then", "Один раз на сообщение."],
    ["local dis = deepcopy(desync.dis)", "Копия."],
    ["dis.payload = \"\"", "RST не несёт данных."],
    ["dis.tcp.th_flags = TH_RST + (desync.arg.rstack and TH_ACK or 0)", "Флаги: RST или RST+ACK."],
    ["apply_fooling(desync, dis); apply_ip_id(desync, dis, nil, \"none\")", "Искажения копии."],
    ["rawsend_dissect_ipfrag(dis, desync_opts(desync))", "Отправка. Вердикта нет → оригинал проходит."]
  ]}],
  syntax: [["a and b or c", "тернарник: rstack задан → TH_ACK, иначе 0"], ["TH_RST + TH_ACK", "сложение непересекающихся битовых масок"], ["dis.payload = \"\"", "пустая строка = нулевой пейлоад"]],
  bugs: [{ level: "crit", title: "RST без fooling", breaks: "Настоящий RST дойдёт до сервера и закроет соединение.", fix: "Обязательно ip_ttl / badsum / tcp_md5." }],
  fixTitle: "Эталонный вызов", fix: `--payload=tls_client_hello
--lua-desync=rst:ip_ttl=6
--lua-desync=rst:rstack:badsum`,
  test: `--debug --lua-desync=rst:ip_ttl=6
# в дампе: пакет с флагом RST и ttl=6, затем оригинал`,
  how: ["RST всегда должен умереть до сервера.", "payload очищается, флаги переставляются.", "Оригинал не дропается."]
};

export const syndata = {
  id: "syndata", title: "Разбор: syndata", kind: "desync",
  lead: "Кладёт данные прямо в SYN-пакет и заменяет им оригинальный SYN.",
  tags: ["desync", "SYN", "эталон"],
  sig: "function syndata(ctx, desync)",
  args: [["blob", "блоб", "16 нулевых байт", "данные для SYN, должны влезть в один пакет"], ["tls_mod", "список", "нет", "rnd, rndsni, sni=… для TLS-фейка"]],
  std: "fooling, rawsend, reconstruct, ipfrag", ret: "VERDICT_DROP при успешной отправке, иначе nil",
  idea: ["TCP допускает данные в SYN (TCP Fast Open). Многие DPI их не анализируют, ожидая ClientHello в первом пакете с данными.", "Функция отправляет копию SYN с пейлоадом и дропает оригинальный SYN — то есть заменяет его."],
  ideaNote: "Сегментация невозможна: данные должны поместиться в один пакет вместе с заголовками.",
  wire: [{ caption: "syndata:blob=fake_default_tls", diagram:
`было:  [SYN][пусто]
стало: [SYN][фейковые данные] → отправлен
оригинальный SYN → DROP` }],
  api: [
    { name: "blob", from: "zapret-lib", sig: "blob(desync, desync.arg.blob, <16 нулей>)", ret: "блоб", text: "Третий аргумент — дефолт." },
    { name: "tls_mod_shim", from: "zapret-lib", sig: "tls_mod_shim(desync, dis.payload, arg.tls_mod, nil)", ret: "модифицированный блоб", text: "Четвёртый аргумент nil — нет реального hello для копирования." },
    { name: "rawsend_dissect_ipfrag", from: "zapret-lib", sig: "if rawsend_dissect_ipfrag(dis, opts) then return VERDICT_DROP end", text: "Дроп только при успешной отправке." }
  ],
  lines: [{ title: "function syndata", items: [
    ["if bitand(desync.dis.tcp.th_flags, TH_SYN + TH_ACK)==TH_SYN then", "Только чистый SYN: SYN есть, ACK нет."],
    ["local dis = deepcopy(desync.dis)", "Копия SYN."],
    ["dis.payload = blob(desync, desync.arg.blob, <16 нулей>)", "Данные в SYN."],
    ["apply_fooling(desync, dis)", "Искажения."],
    ["if desync.arg.tls_mod then ... tls_mod_shim ... end", "Опциональная модификация TLS-фейка."],
    ["if rawsend_dissect_ipfrag(dis, desync_opts(desync)) then return VERDICT_DROP end", "Успех → дропаем оригинальный SYN."],
    ["else instance_cutoff_shim(ctx, desync) end", "Пакет без SYN → миссия выполнена."]
  ]}],
  syntax: [["bitand(flags, TH_SYN+TH_ACK)==TH_SYN", "проверка маски"], ["blob(..., default)", "третий аргумент — значение по умолчанию"], ["DROP после отправки", "замена пакета, а не дубль"]],
  bugs: [{ level: "crit", title: "Слишком большой блоб", breaks: "Пакет не влезет в MTU — отправка провалится, оригинальный SYN уйдёт нетронутым.", fix: "Держи блоб в пределах ~1400 байт." },
    { level: "warn", title: "Ожидание дубля", breaks: "syndata дропает оригинальный SYN — это замена.", fix: "Понимай семантику: успех = замена, неудача = оригинал." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=syndata
--lua-desync=syndata:blob=fake_default_tls:tls_mod=rnd,rndsni
--lua-desync=syndata:blob=0x16030100000000000000000000000000`,
  test: `--debug --lua-desync=syndata
# в дампе: SYN с непустым пейлоадом, обычного SYN нет`,
  how: ["Работает только на чистом SYN.", "Данные должны влезть в один пакет.", "Успех = DROP оригинала.", "После не-SYN — cutoff."]
};

export const tls_client_hello_clone = {
  id: "tls_client_hello_clone", title: "Разбор: tls_client_hello_clone", kind: "desync",
  lead: "Готовит модифицированную копию реального ClientHello в блоб desync.<name>. Ничего не отправляет.",
  tags: ["desync", "подготовка", "TLS", "эталон"],
  sig: "function tls_client_hello_clone(ctx, desync)",
  args: [["blob", "имя", "обязателен", "куда положить результат: desync.<blob>"], ["fallback", "блоб", "нет", "что положить, если клонировать не удалось"], ["sni_first", "имя", "нет", "добавить SNI в начало"], ["sni_last", "имя", "нет", "добавить SNI в конец"], ["sni_del", "флаг", "нет", "удалить все имена"], ["sni_del_ext", "флаг", "нет", "удалить расширение SNI"], ["sni_snt / sni_snt_new", "число", "нет", "тип server name"]],
  std: "direction", ret: "nil — функция только готовит данные",
  idea: ["Фейк работает лучше, если он похож на настоящий ClientHello вашего браузера, а не на стандартный шаблон.", "Функция берёт реальный hello, меняет SNI и кладёт результат в desync — следующий инстанс fake использует его как блоб."],
  wire: [{ caption: "Цепочка из двух инстансов", diagram:
`1) tls_client_hello_clone:blob=hello:sni_first=example.com
   → desync.hello = реальный hello с подменённым SNI
2) fake:blob=hello:ip_ttl=6
   → отправляет desync.hello как фейк
оригинал: нетронут` }],
  api: [
    { name: "tls_client_hello_mod", from: "zapret-lib", sig: "tls_client_hello_mod(desync.reasm_data or desync.dis.payload, desync.arg)", ret: "hello или nil", text: "Вся работа по SNI здесь." },
    { name: "blob", from: "zapret-lib", sig: "desync[arg.blob] = blob(desync, arg.fallback)", text: "Запасной вариант." }
  ],
  lines: [{ title: "function tls_client_hello_clone", items: [
    ["if not desync.arg.blob then error(\"'blob' arg required\") end", "Без имени класть некуда."],
    ["if desync.l7payload==\"tls_client_hello\" then", "Клонируем только настоящий ClientHello."],
    ["desync[desync.arg.blob] = tls_client_hello_mod(desync.reasm_data or desync.dis.payload, desync.arg)", "Результат кладётся в desync, не в глобальную."],
    ["if not desync[blob] and desync.arg.fallback then desync[blob] = blob(desync, arg.fallback) end", "Запасной блоб."],
    ["-- вердикта нет", "Оригинал проходит; данные ждут следующего инстанса."]
  ]}],
  syntax: [["desync[name] = value", "динамический ключ: имя блоба задаётся аргументом"], ["error(...)", "аварийный останов при отсутствии обязательного аргумента"], ["reasm_data or payload", "предпочтение собранному сообщению"]],
  bugs: [{ level: "crit", title: "Порядок инстансов", breaks: "Если fake стоит раньше clone, блоба ещё нет → error или пропуск.", fix: "clone всегда первым." },
    { level: "warn", title: "Нет fallback", breaks: "На не-TLS пакете клон не создастся, fake упадёт.", fix: ":fallback=fake_default_tls и :optional у fake." }],
  fixTitle: "Эталонный вызов", fix: `--payload=tls_client_hello
--lua-desync=tls_client_hello_clone:blob=hello:sni_first=example.com:fallback=fake_default_tls
--lua-desync=fake:blob=hello:ip_ttl=6:optional`,
  test: `--debug --lua-desync=tls_client_hello_clone:blob=hello:sni_first=example.com
# в логе: "cloned to desync.hello"`,
  how: ["Функция подготовки, не отправки.", "Результат живёт только в цепочке текущего пакета.", "Всегда перед потребителем блоба.", "fallback спасает на не-TLS."]
};

export const multidisorder_legacy = {
  id: "multidisorder_legacy", title: "Разбор: multidisorder_legacy", kind: "desync",
  lead: "multidisorder с порядком сегментов как в nfqws1: работает по каждому пакету, а не по собранному reasm.",
  tags: ["desync", "disorder", "совместимость", "эталон"],
  sig: "function multidisorder_legacy(ctx, desync)",
  args: [["pos", "список маркеров", "2", "точки реза, разрешаются на полном reasm"], ["seqovl", "маркер", "нет", "позиция перекрытия"], ["seqovl_pattern", "блоб", "нули", "заполнитель"]],
  std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ret: "VERDICT_DROP при отправке, VERDICT_PASS при неудаче",
  idea: ["Обычный multidisorder отправляет весь собранный reasm сразу. Legacy nfqws1 резал каждый пакет отдельно.", "Маркеры разрешаются на полном сообщении, затем нормализуются в диапазон текущего куска — порядок сегментов совпадает со старым nfqws1."],
  ideaTable: [["range_low = reasm_offset + 1", "начало куска в координатах полного сообщения"], ["range_hi = range_low + #data", "конец куска"], ["pos_array_normalize", "выбрасывает точки вне куска, сдвигает остальные"]],
  wire: [{ caption: "reasm 517 байт, текущий пакет — байты 200..400", diagram:
`маркеры на полном:  [1, 120, 133, 500]
нормализация в 200..400 → точек внутри нет
если точек нет → пакет отправляется как есть → DROP` }],
  api: [
    { name: "pos_array_normalize", from: "antidpi internal", sig: "pos_array_normalize(pos, range_low, range_hi)", text: "Перенос точек в координаты куска." },
    { name: "pos_normalize", from: "antidpi internal", sig: "pos_normalize(pos, low, hi)", ret: "позиция или nil", text: "(pos-low+1) если внутри диапазона." },
    { name: "multidisorder_send", from: "antidpi internal", sig: "multidisorder_send(desync, data, seqovl, pos)", ret: "вердикт", text: "Общая с multidisorder отправка в обратном порядке." }
  ],
  lines: [{ title: "function multidisorder_legacy", items: [
    ["local data = desync.dis.payload", "Работаем по текущему пакету."],
    ["local fulldata = desync.reasm_data", "Маркеры разрешаем на полном сообщении."],
    ["local range_low = (desync.reasm_offset or 0) + 1", "Координаты куска внутри reasm."],
    ["local pos = resolve_multi_pos(fulldata, desync.l7payload, spos)", "Точки на полном."],
    ["pos_array_normalize(pos, range_low, range_hi)", "Перенос в координаты куска."],
    ["delete_pos_1(pos)", "Рез по первому байту невозможен."],
    ["seqovl = resolve_pos(fulldata, ...); pos_normalize(seqovl, ...)", "Перекрытие тоже нормализуется."],
    ["return multidisorder_send(desync, data, seqovl, pos)", "Отправка в обратном порядке."],
    ["else if rawsend_payload_segmented(desync) then return VERDICT_DROP end", "Нет точек → шлём как есть и дропаем оригинал."]
  ]}],
  syntax: [["(reasm_offset or 0) + 1", "0-based смещение → 1-based координата"], ["pos_array_normalize", "сдвиг системы координат"], ["rawsend_payload_segmented(desync)", "без данных = текущий пейлоад"]],
  bugs: [{ level: "info", title: "Ожидание поведения multidisorder", breaks: "Порядок сегментов отличается от современного multidisorder.", fix: "Используй legacy только для точного повторения старой стратегии." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=multidisorder_legacy:pos=1,host,midsld+1`,
  test: `--debug --lua-desync=multidisorder_legacy:pos=1,host
# в логе: "reasm piece range", "normalized split pos"`,
  how: ["Маркеры — на полном reasm, рез — по текущему пакету.", "Нормализация координат — суть legacy.", "Пакет без точек всё равно отправляется и дропается."]
};

export const tcpseg = {
  id: "tcpseg", title: "Разбор: tcpseg", kind: "desync",
  lead: "Отправляет дополнительный сегмент с выбранным диапазоном пейлоада. Оригинал НЕ дропается.",
  tags: ["desync", "сегмент", "эталон"],
  sig: "function tcpseg(ctx, desync)",
  args: [["pos", "пара маркеров", "обязателен", "диапазон 'start,end'"], ["seqovl", "число", "0", "перекрытие sequence"], ["seqovl_pattern", "блоб", "нули", "заполнитель"], ["blob", "блоб", "нет", "данные вместо payload"], ["optional", "флаг", "нет", "пропустить, если блоба нет"]],
  std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ret: "nil (PASS) — оригинал всегда проходит",
  idea: ["Не режет поток, а добавляет сегмент с нужным фрагментом — например, отдельно отправляет только имя хоста.", "DPI получает перекрывающийся сегмент и может неверно собрать поток."],
  ideaNote: "Ключевое отличие от multisplit: tcpseg не дропает оригинал. Это добавка, а не замена.",
  wire: [{ caption: "tcpseg:pos=host,endhost", diagram:
`доп.сегмент: seq=S+host-1  data[host..endhost]
оригинал:    весь ClientHello → PASS
сервер:      перекрывающийся сегмент отбрасывает` }],
  api: [
    { name: "resolve_range", from: "C API", sig: "resolve_range(data, desync.l7payload, desync.arg.pos)", ret: "ровно 2 позиции или error", text: "При неверных маркерах вызывает error." },
    { name: "rawsend_payload_segmented", from: "zapret-lib", sig: "rawsend_payload_segmented(desync, part, pos[1]-1-seqovl)", text: "Сдвиг = начало диапазона минус перекрытие." }
  ],
  lines: [{ title: "function tcpseg", items: [
    ["if not desync.arg.pos then error(\"tcpseg: no pos specified\") end", "Обязательный аргумент."],
    ["local pos = resolve_range(data, desync.l7payload, desync.arg.pos)", "Две позиции диапазона."],
    ["local part = string.sub(data, pos[1], pos[2])", "Вырезаем включительно."],
    ["if seqovl>0 then part = pattern(pat,1,seqovl)..part end", "Перекрытие в начало."],
    ["rawsend_payload_segmented(desync, part, pos[1]-1-seqovl)", "Отправка со сдвигом."],
    ["-- return нет", "Оригинал проходит нетронутым."]
  ]}],
  syntax: [["string.sub(data, a, b)", "включительно, 1-based"], ["pos[1]-1-seqovl", "1-based позиция → 0-based сдвиг sequence"], ["error при отсутствии arg", "жёсткое требование к вызову"]],
  bugs: [{ level: "warn", title: "Ожидание дропа оригинала", breaks: "tcpseg только добавляет сегмент.", fix: "Нужен рез с заменой — это multisplit." },
    { level: "warn", title: "Неверная пара маркеров", breaks: "resolve_range требует ровно 2 позиции, иначе error.", fix: "pos='host,endhost'." }],
  fixTitle: "Эталонный вызов", fix: `--payload=http_req
--lua-desync=tcpseg:pos=host,endhost
--lua-desync=tcpseg:pos=host,endhost:seqovl=4`,
  test: `--debug --lua-desync=tcpseg:pos=host,endhost
# в дампе: доп.сегмент с диапазоном + полный оригинал`,
  how: ["pos — ровно два маркера.", "Оригинал не дропается.", "Сдвиг sequence = pos[1]-1-seqovl."]
};

export const oob = {
  id: "oob", title: "Разбор: oob", kind: "desync",
  lead: "Длящаяся десинхронизация через OOB-байт (URG): сдвигает sequence с самого SYN и держит его до конца соединения.",
  tags: ["desync", "OOB", "сложная", "эталон"],
  sig: "function oob(ctx, desync)",
  args: [["char", "символ", "нулевой байт", "OOB-байт как символ"], ["byte", "число", "нет", "OOB-байт как число"], ["urp", "маркер | b | e", "b", "позиция urgent pointer"]],
  std: "fooling, ip_id, rawsend, reconstruct, ipfrag", ret: "VERDICT_MODIFY для служебных пакетов, VERDICT_DROP для пакета с OOB",
  idea: ["Вставляется один «срочный» байт, который нормальный стек сервера выкинет, а DPI посчитает частью данных.", "Чтобы вставка не сломала нумерацию, исходящий seq уменьшается на 1, а входящий ack увеличивается на 1 — на протяжении всего соединения."],
  ideaNote: "Требует перехвата с самого SYN. Не совместим с multisplit/multidisorder: они отправят дубль без OOB.",
  wire: [{ caption: "Начало соединения", diagram:
`SYN:      seq=S-1 → MODIFY
пустой ACK: seq=S-1 → MODIFY
данные:   вставлен OOB-байт, флаг URG → отправлен → DROP
входящие: ack=A+1 → MODIFY` }],
  api: [
    { name: "pos_get", from: "zapret-lib", sig: "pos_get(desync, 's', false)", ret: "relative sequence", text: "'s' — sequence; false прямое направление, true обратное." },
    { name: "u32add", from: "C API", sig: "u32add(th_seq, -1) / u32add(th_ack, 1)", text: "Сдвиг нумерации по модулю 2^32." },
    { name: "rawsend_dissect_segmented", from: "zapret-lib", sig: "rawsend_dissect_segmented(desync, dis_oob)", ret: "true", text: "Отправка целого диссекта с сегментацией." },
    { name: "track.lua_state", from: "desync", sig: "desync.track.lua_state[desync.func_instance..'_syn']", text: "Флаг «начали с SYN» живёт между пакетами." }
  ],
  lines: [{ title: "function oob", items: [
    ["if not desync.track then return end", "Без conntrack длящаяся десинхронизация невозможна."],
    ["local key = desync.func_instance..\"_syn\"", "Уникальный ключ инстанса."],
    ["if not track.lua_state[key] then if flags~=SYN then cutoff end; track.lua_state[key]=true end", "Первый увиденный пакет обязан быть SYN."],
    ["if desync.outgoing then local pos = pos_get(desync,'s',false)", "Исходящая ветка."],
    ["if pos<=1 then dis.tcp.th_seq = u32add(th_seq,-1) end", "Сдвиг seq у SYN и первого пакета данных."],
    ["if pos==0 then return VERDICT_MODIFY end", "SYN без данных — просто модифицируем."],
    ["if #oob~=1 then error('OOB must be exactly one byte') end", "Ровно один байт."],
    ["dis_oob.payload = sub(data,1,urp-1)..oob..sub(data,urp)", "Вставка байта в позицию urp."],
    ["dis_oob.tcp.th_flags = bitor(th_flags, TH_URG)", "Ставим флаг URG."],
    ["if not rawsend_dissect_segmented(desync, dis_oob) then cutoff return end", "Отправка; при неудаче отключение."],
    ["return VERDICT_DROP", "Оригинал заменён версией с OOB."],
    ["else th_ack = u32add(th_ack,1); return MODIFY", "Входящая ветка компенсирует ack."]
  ]}],
  syntax: [["track.lua_state[key]", "состояние между пакетами соединения"], ["bitor(flags, TH_URG)", "добавление флага без сброса остальных"], ["pos_get(desync,'s',true)", "обратное направление"], ["конкатенация трёх частей", "вставка байта без потери данных"]],
  bugs: [{ level: "crit", title: "Совмещение с multisplit", breaks: "Они отправят весь пейлоад без OOB — дубль, десинхронизация сломается.", fix: "oob используется отдельно." },
    { level: "crit", title: "Старт не с SYN", breaks: "Если профиль переключился посреди соединения, seq уже не сдвинуть.", fix: "Обеспечь перехват с начала; функция сама делает cutoff." },
    { level: "warn", title: "urp=e", breaks: "OOB после всех данных — DPI видит всё оригинальное сообщение.", fix: "Используй b или маркер внутри данных." }],
  fixTitle: "Эталонный вызов", fix: `--in-range=-s1 --lua-desync=oob:char=!
--lua-desync=oob:byte=33:urp=host`,
  test: `--debug --lua-desync=oob:char=!
# в логе: "decreasing outgoing seq", "increasing incoming ack", "sending OOB"`,
  how: ["Нужно состояние потока и старт с SYN.", "Компенсируй seq исходящих и ack входящих.", "Не комбинируй с отправкой всего пейлоада.", "urp=b — самый рабочий вариант."]
};

export const udplen = {
  id: "udplen", title: "Разбор: udplen", kind: "desync",
  lead: "Меняет длину UDP-пейлоада на ±N байт. Ломает сигнатуры по точному размеру датаграммы.",
  tags: ["desync", "UDP", "эталон"],
  sig: "function udplen(ctx, desync)",
  args: [["increment", "число", "2", "+ растёт, − обрезается"], ["min", "число", "нет", "не трогать пакеты короче"], ["max", "число", "нет", "не трогать пакеты длиннее"], ["pattern", "блоб", "нули", "чем заполнять при росте"], ["pattern_offset", "число", "0", "смещение внутри pattern"]],
  std: "direction, payload", ret: "VERDICT_MODIFY при изменении, иначе nil",
  idea: ["Некоторые DPI опознают протокол по точной длине UDP-датаграммы.", "Изменение на пару байт ломает сигнатуру: при росте данные дописываются, при уменьшении обрезаются."],
  ideaNote: "Сегментация UDP невозможна: при превышении MTU ОС фрагментирует на уровне IP. На Linux ошибка, на других ОС пакет молча не уйдёт.",
  wire: [{ caption: "increment=2 / -2", diagram:
`было: [udp len=1200][data 1200]
+2:   [udp len=1202][data 1200][00 00] → MODIFY
-2:   [udp len=1198][data 1198]        → MODIFY` }],
  api: [
    { name: "pattern", from: "zapret-lib", sig: "pattern(pat, pat_offset, inc)", ret: "блоб длины inc", text: "Повторяет узор до нужной длины." },
    { name: "string.sub", from: "Lua", sig: "string.sub(payload, 1, len+inc)", text: "Обрезка при отрицательном inc." }
  ],
  lines: [{ title: "function udplen", items: [
    ["if not desync.dis.udp then ... return end", "Только UDP."],
    ["if direction_check(desync) and payload_check(desync) then", "Стандартные фильтры."],
    ["if arg.min and #payload < tonumber(arg.min) then", "Пропуск коротких."],
    ["elseif arg.max and #payload > tonumber(arg.max) then", "Пропуск длинных."],
    ["local inc = tonumber(arg.increment) or 2", "Дефолт +2."],
    ["if inc>0 then payload = payload .. pattern(pat, pat_offset, inc)", "Рост: дописываем узор."],
    ["elseif inc<0 then if (len+inc)<1 then skip else payload = sub(payload,1,len+inc) end", "Обрезка, но не до нуля."],
    ["return VERDICT_MODIFY", "Уйдёт изменённый пакет."]
  ]}],
  syntax: [["tonumber(arg.x) or default", "числовой аргумент с дефолтом"], ["#payload", "длина blob"], ["(len+inc)<1", "защита от обрезки в ноль"], ["pattern_offset+1", "0-based аргумент → 1-based индекс"]],
  bugs: [{ level: "warn", title: "Большой increment", breaks: "Пакет превысит MTU: ошибка отправки или молчаливая потеря.", fix: "Держи прирост в единицах байт." },
    { level: "warn", title: "Отрицательный increment", breaks: "Обрезанные байты — потерянные данные.", fix: "Проверяй, переживёт ли протокол обрезку." }],
  fixTitle: "Эталонный вызов", fix: `--payload=quic_initial --lua-desync=udplen:increment=2
--lua-desync=udplen:min=1000:max=1300:increment=4:pattern=0xdeadbeef`,
  test: `--debug --lua-desync=udplen:increment=2
# в логе: "udplen: 1200 => 1202"`,
  how: ["Только UDP; меняется оригинал → MODIFY.", "min/max защищают служебные пакеты.", "Прирост малый — MTU.", "Отрицательный inc теряет данные."]
};

export const dht_dn = {
  id: "dht_dn", title: "Разбор: dht_dn", kind: "desync",
  lead: "Подменяет префикс DHT 'd1:' на 'dN:' без нарушения bencode. Ломает сигнатуру torrent-DPI.",
  tags: ["desync", "UDP", "DHT", "эталон"],
  sig: "function dht_dn(ctx, desync)",
  args: [["dn", "число", "3", "N в новом префиксе"], ["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY",
  idea: ["DHT использует bencode: сообщения начинаются с 'd1:' и заканчиваются 'e'. DPI ищет именно 'd1:' или 'd2:'.", "Можно поставить 'd3:' и дальше, если корректно дописать содержимое — формат останется валидным."],
  ideaTable: [["d1:...", "исходный префикс: словарь с ключом длины 1"], ["d3:0001:x...", "ключ длины 3 ('000'), затем вложенный словарь с ключом 'x'"]],
  wire: [{ caption: "dn=3", diagram:
`было:  d1:a...e
стало: d3:0001:x a...e
bencode валиден, сигнатура DPI не совпадёт` }],
  api: [
    { name: "string.rep", from: "Lua", sig: "string.rep('0', N)", ret: "строка из N нулей", text: "Имя ключа нужной длины." },
    { name: "string.sub", from: "Lua", sig: "string.sub(payload, 2)", text: "Отбрасывает первый символ 'd'." }
  ],
  lines: [{ title: "function dht_dn", items: [
    ["if not desync.dis.udp then ... return end", "DHT поверх UDP."],
    ["if desync.l7payload==\"dht\" and direction_check(desync) then", "Только распознанный DHT."],
    ["local N = tonumber(desync.arg.dn) or 3", "Дефолт 3."],
    ["local prefix = \"d\"..N..\":\"..string.rep(\"0\",N)..\"1:x\"", "Сборка валидного bencode-префикса."],
    ["desync.dis.payload = prefix..string.sub(desync.dis.payload,2)", "Заменяем 'd' на префикс."],
    ["return VERDICT_MODIFY", "Уйдёт изменённое сообщение."]
  ]}],
  syntax: [["..", "конкатенация: число станет строкой"], ["string.rep('0',N)", "повтор символа"], ["string.sub(payload,2)", "всё со второго байта"]],
  bugs: [{ level: "info", title: "Только распознанный dht", breaks: "Если C-код не определил пейлоад как dht, функция ничего не сделает.", fix: "Проверь тип через pktdebug; при необходимости свой детектор + condition." }],
  fixTitle: "Эталонный вызов", fix: `--payload=dht --lua-desync=dht_dn:dn=3
--lua-desync=dht_dn:dn=5`,
  test: `--debug --lua-desync=dht_dn:dn=3
# в логе: "tampered dht to start with 'd3:0001:x'"`,
  how: ["Меняем оригинал → MODIFY.", "bencode должен остаться валидным.", "Работает только по l7payload=dht."]
};

export const synack = {
  id: "synack", title: "Разбор: synack", kind: "desync",
  lead: "Шлёт SYN,ACK перед настоящим SYN — TCB turnaround. DPI путает, кто клиент, а кто сервер.",
  tags: ["desync", "SYN", "NAT-ломает", "эталон"],
  sig: "function synack(ctx, desync)",
  args: [["repeats", "число", "1", "повторы отправки"], ["ifout / fwmark", "rawsend", "нет", "интерфейс и метка"]],
  std: "rawsend, reconstruct, ipfrag", ret: "nil — оригинальный SYN проходит",
  idea: ["DPI определяет направление по первому пакету: SYN = клиент.", "Если перед SYN отправить SYN,ACK, DPI может решить, что это ответ сервера, и перевернуть логику анализа."],
  ideaNote: "Ломает NAT. На проходящем трафике требует nftables и режим POSTNAT.",
  wire: [{ caption: "Исходящий SYN", diagram:
`пакет 1: [SYN,ACK] → в сеть
пакет 2: [SYN]     → оригинал, PASS
DPI:     направление определено неверно` }],
  api: [
    { name: "bitor", from: "C API", sig: "bitor(dis.tcp.th_flags, TH_ACK)", text: "Добавляет ACK к существующим флагам." },
    { name: "instance_cutoff_shim", from: "zapret-lib", sig: "instance_cutoff_shim(ctx, desync)", text: "После не-SYN миссия выполнена." }
  ],
  lines: [{ title: "function synack", items: [
    ["if bitand(th_flags, TH_SYN+TH_ACK)==TH_SYN then", "Только чистый SYN."],
    ["local dis = deepcopy(desync.dis)", "Копия."],
    ["dis.tcp.th_flags = bitor(dis.tcp.th_flags, TH_ACK)", "SYN → SYN,ACK."],
    ["rawsend_dissect_ipfrag(dis, desync_opts(desync))", "Отправка копии; вердикта нет."],
    ["else instance_cutoff_shim(ctx, desync) end", "Не SYN → отключаемся."]
  ]}],
  syntax: [["bitand(flags, SYN+ACK)==SYN", "маска: SYN есть, ACK нет"], ["bitor(flags, TH_ACK)", "добавить флаг"]],
  bugs: [{ level: "crit", title: "Применение через NAT", breaks: "NAT не пропустит SYN,ACK без состояния.", fix: "Только на самой системе или POSTNAT без NAT для этого трафика." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=synack
--lua-desync=synack:repeats=2`,
  test: `--debug --lua-desync=synack
# в дампе: SYN,ACK затем SYN`,
  how: ["Только чистый SYN.", "Копия с добавленным ACK.", "Несовместим с NAT."]
};

export const synack_split = {
  id: "synack_split", title: "Разбор: synack_split", kind: "desync",
  lead: "Серверная техника TCP split handshake: заменяет SYN,ACK на SYN или пару SYN+ACK / ACK+SYN.",
  tags: ["desync", "сервер", "handshake", "эталон"],
  sig: "function synack_split(ctx, desync)",
  args: [["mode", "syn|synack|acksyn", "synack", "во что превратить SYN,ACK"]],
  std: "rawsend, reconstruct, ipfrag", ret: "VERDICT_DROP при успехе, VERDICT_PASS при неудаче",
  idea: ["DPI ждёт от сервера стандартный SYN,ACK. Если сервер отвечает сначала SYN, а потом ACK, роли сторон путаются.", "Может сработать даже когда клиент ничего не делает для обхода."],
  ideaTable: [["mode=syn", "только SYN"], ["mode=synack", "SYN, затем ACK"], ["mode=acksyn", "ACK, затем SYN"]],
  wire: [{ caption: "mode=acksyn", diagram:
`было:  сервер → [SYN,ACK]
стало: сервер → [ACK] затем [SYN]
оригинал → DROP` }],
  api: [
    { name: "bitnot", from: "C API", sig: "bitand(th_flags, bitnot(TH_ACK))", text: "Снятие флага: И с инверсией маски." },
    { name: "rawsend_dissect_ipfrag", from: "zapret-lib", sig: "if not rawsend_dissect_ipfrag(dis, options) then return VERDICT_PASS end", text: "При неудаче отдаём оригинал." }
  ],
  lines: [{ title: "function synack_split", items: [
    ["if bitand(th_flags, TH_SYN+TH_ACK)==(TH_SYN+TH_ACK) then", "Только SYN,ACK — серверный пакет."],
    ["local mode = desync.arg.mode or \"synack\"", "Дефолт synack."],
    ["mode==\"syn\": bitand(flags, bitnot(TH_ACK))", "Снимаем ACK → чистый SYN."],
    ["if not rawsend_dissect_ipfrag(dis, options) then return VERDICT_PASS end", "Неудача → оригинал."],
    ["mode==\"synack\": SYN, затем снятие SYN → ACK", "Два пакета."],
    ["mode==\"acksyn\": ACK, затем SYN", "Обратный порядок."],
    ["else error(\"synack_split: bad mode\") end", "Неизвестный режим — ошибка."],
    ["return VERDICT_DROP", "Оригинал заменён."]
  ]}],
  syntax: [["bitand(flags, bitnot(TH_ACK))", "снять флаг"], ["elseif-цепочка", "выбор режима"], ["error при неизвестном mode", "защита от опечатки"]],
  bugs: [{ level: "warn", title: "Применение на клиенте", breaks: "Клиент не шлёт SYN,ACK — сработает cutoff.", fix: "Это серверная техника; на клиенте — synack." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=synack_split:mode=acksyn
--lua-desync=synack_split:mode=syn`,
  test: `--debug --lua-desync=synack_split:mode=synack
# в дампе: два пакета вместо одного SYN,ACK`,
  how: ["Срабатывает на SYN,ACK.", "Успех = DROP оригинала.", "Три режима задают порядок флагов."]
};

export const wsize = {
  id: "wsize", title: "Разбор: wsize", kind: "desync",
  lead: "Меняет TCP window size в SYN,ACK. Серверная техника против сигнатур по окну.",
  tags: ["desync", "сервер", "window", "эталон"],
  sig: "function wsize(ctx, desync)",
  args: [["wsize", "число", "нет", "новое значение окна"], ["scale", "число", "нет", "scale factor"]],
  std: "нет", ret: "VERDICT_MODIFY при изменении, иначе nil",
  idea: ["Некоторые DPI опознают стек или сервер по значению window size в SYN,ACK.", "Изменение окна ломает сигнатуру; применяется там, где вы контролируете ответ."],
  wire: [{ caption: "wsize=4096", diagram:
`было:  [SYN,ACK][win=65535][scale=7]
стало: [SYN,ACK][win=4096][scale=7] → MODIFY` }],
  api: [{ name: "wsize_rewrite", from: "zapret-lib", sig: "wsize_rewrite(desync.dis, desync.arg)", ret: "true если изменено", text: "Работа по окну и scale внутри хелпера." }],
  lines: [{ title: "function wsize", items: [
    ["if bitand(th_flags, TH_SYN+TH_ACK)==(TH_SYN+TH_ACK) then", "Только SYN,ACK."],
    ["if wsize_rewrite(desync.dis, desync.arg) then return VERDICT_MODIFY end", "Изменили → MODIFY."],
    ["else instance_cutoff_shim(ctx, desync) end", "Не SYN,ACK → отключаемся."]
  ]}],
  syntax: [["if f() then", "признак изменения как условие"], ["маска SYN+ACK", "проверка обоих флагов"]],
  bugs: [{ level: "warn", title: "Слишком маленькое окно", breaks: "Реально снизит пропускную способность.", fix: "Меняй минимально достаточно." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=wsize:wsize=4096
--lua-desync=wsize:wsize=8192:scale=2`,
  test: `--debug --lua-desync=wsize:wsize=4096
# в дампе SYN,ACK: win=4096`,
  how: ["Только SYN,ACK.", "Меняет оригинал → MODIFY.", "Окно влияет на скорость."]
};

export const wssize = {
  id: "wssize", title: "Разбор: wssize", kind: "desync",
  lead: "Держит маленькое окно во всех исходящих пакетах до первого пейлоада — сервер дробит ответ.",
  tags: ["desync", "window", "скорость", "эталон"],
  sig: "function wssize(ctx, desync)",
  args: [["wsize", "число", "нет", "значение окна"], ["scale", "число", "нет", "scale factor"], ["forced_cutoff", "список пейлоадов", "любой непустой", "что завершает работу"], ["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY при изменении, иначе VERDICT_PASS",
  idea: ["Против DPI, блокирующего по содержимому ответа сервера, например по сертификату в TLS 1.2.", "Маленькое окно заставляет сервер слать ответ мелкими сегментами."],
  ideaNote: "Снижает скорость и не работает с хостлистами: окно нужно менять до определения хоста.",
  wire: [{ caption: "wssize:wsize=1024", diagram:
`SYN:      win=1024 → MODIFY
ACK:      win=1024 → MODIFY
данные:   win=1024 → MODIFY + forced cutoff
далее:    окно обычное` }],
  api: [
    { name: "wsize_rewrite", from: "zapret-lib", sig: "wsize_rewrite(desync.dis, desync.arg)", ret: "true", text: "Переписывает окно в текущем пакете." },
    { name: "in_list", from: "zapret-lib", sig: "in_list(desync.arg.forced_cutoff, desync.l7payload)", ret: "true/false", text: "Проверка типа пейлоада в списке." }
  ],
  lines: [{ title: "function wssize", items: [
    ["local verdict = VERDICT_PASS", "Накопитель вердикта."],
    ["direction_cutoff_opposite(ctx, desync)", "Только исходящие."],
    ["if wsize_rewrite(desync.dis, desync.arg) then verdict = VERDICT_MODIFY end", "Меняем окно в каждом пакете."],
    ["if #payload>0 and (not arg.forced_cutoff or in_list(...)) then", "Первый пейлоад — пора завершать."],
    ["instance_cutoff_shim(ctx, desync)", "Чтобы не держать окно маленьким вечно."],
    ["return verdict", "PASS или MODIFY."]
  ]}],
  syntax: [["local verdict; return verdict", "накопление вместо раннего return"], ["not arg.x or in_list(...)", "дефолт «любой»"], ["#payload>0", "признак пакета с данными"]],
  bugs: [{ level: "crit", title: "Использование с хостлистами", breaks: "Хост определяется после первых пакетов — окно уже не изменить.", fix: "Только профили без фильтрации по домену." },
    { level: "warn", title: "Отключили forced_cutoff", breaks: "Окно останется маленьким на всё соединение.", fix: "Оставь дефолт по первому непустому пейлоаду." }],
  fixTitle: "Эталонный вызов", fix: `--lua-desync=wssize:wsize=1024
--lua-desync=wssize:wsize=1024:forced_cutoff=tls_client_hello`,
  test: `--debug --lua-desync=wssize:wsize=1024
# в логе: "wssize: forced cutoff"`,
  how: ["Работает до первого пейлоада, затем cutoff.", "Несовместим с хостлистами.", "Снижает скорость.", "Возвращай накопленный вердикт."]
};

export const http_domcase = {
  id: "http_domcase", title: "Разбор: http_domcase", kind: "desync",
  lead: "Чередующийся регистр имени хоста: example.com → ExAmPlE.CoM. Ломает регистрозависимые сигнатуры.",
  tags: ["desync", "HTTP", "эталон"],
  sig: "function http_domcase(ctx, desync)",
  args: [["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY при успехе, иначе nil",
  idea: ["Имя хоста в HTTP регистронезависимо — сервер поймёт любой регистр.", "Простейшие DPI сравнивают строку побайтово с шаблоном в нижнем регистре."],
  wire: [{ caption: "Host: example.com", diagram:
`было:  Host: example.com
стало: Host: ExAmPlE.CoM
длина не меняется` }],
  api: [
    { name: "resolve_multi_pos", from: "C API", sig: "resolve_multi_pos(payload, l7, 'host,endhost')", ret: "массив из 2 позиций", text: "endhost здесь exclusive — граница за последним символом." },
    { name: "string.upper / string.lower", from: "Lua", sig: "string.upper(string.sub(host,i,i))", text: "Посимвольное чередование." }
  ],
  lines: [{ title: "function http_domcase", items: [
    ["if desync.l7payload==\"http_req\" and direction_check(desync) then", "Только http-запросы."],
    ["local host_range = resolve_multi_pos(payload, l7, \"host,endhost\")", "Границы имени хоста."],
    ["if #host_range == 2 then", "Ровно две позиции."],
    ["local host = string.sub(payload, h[1], h[2]-1)", "endhost exclusive → вычитаем 1."],
    ["for i=1,#host do ... (i%2)==0 and lower or upper ... end", "Чётные нижний, нечётные верхний."],
    ["payload = sub(payload,1,h[1]-1)..newhost..sub(payload,h[2])", "Сборка пакета."],
    ["return VERDICT_MODIFY", "Уйдёт изменённый запрос."]
  ]}],
  syntax: [["i%2", "остаток — чередование"], ["(cond and a or b)", "тернарник"], ["h[2]-1", "exclusive-граница"], ["for i=1,#host", "1-based цикл по символам"]],
  bugs: [{ level: "info", title: "Нет Host", breaks: "Функция ничего не сделает и залогирует причину.", fix: "Убедись, что запрос HTTP/1.1 с Host." }],
  fixTitle: "Эталонный вызов", fix: `--payload=http_req --lua-desync=http_domcase
--lua-desync=http_hostcase:spell=HoSt --lua-desync=http_domcase --lua-desync=http_methodeol`,
  test: `--debug --lua-desync=http_domcase
# в логе: "http_domcase: example.com => ExAmPlE.CoM"`,
  how: ["Только http_req.", "Меняем оригинал → MODIFY.", "endhost exclusive — не забудь -1.", "methodeol ставь последним."]
};

export const http_hostcase = {
  id: "http_hostcase", title: "Разбор: http_hostcase", kind: "desync",
  lead: "Меняет написание самого заголовка Host: — например hOsT:. Ломает сигнатуры по имени заголовка.",
  tags: ["desync", "HTTP", "эталон"],
  sig: "function http_hostcase(ctx, desync)",
  args: [["spell", "строка", "host", "ровно 4 символа"], ["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY при успехе, иначе nil",
  idea: ["Имена HTTP-заголовков регистронезависимы. DPI, ищущий буквально 'Host:', не найдёт 'hOsT:'.", "Меняется имя заголовка, а не значение."],
  wire: [{ caption: "spell=HoSt", diagram:
`было:  Host: example.com
стало: HoSt: example.com
длина пакета не меняется` }],
  api: [
    { name: "http_dissect_req", from: "zapret-lib", sig: "http_dissect_req(payload)", ret: "таблица разбора", text: "Заголовки с позициями pos_start, pos_header_end." },
    { name: "array_field_search", from: "zapret-lib", sig: "array_field_search(hdis.headers, 'header_low', 'host')", ret: "индекс или nil", text: "Поиск по нормализованному имени." }
  ],
  lines: [{ title: "function http_hostcase", items: [
    ["local spell = desync.arg.spell or \"host\"", "Дефолт строчные."],
    ["if #spell ~= 4 then error(\"invalid host spelling\") end", "Ровно 4 символа, иначе поедет длина."],
    ["local hdis = http_dissect_req(desync.dis.payload)", "Разбор запроса."],
    ["local idx_host = array_field_search(hdis.headers, \"header_low\", \"host\")", "Ищем заголовок."],
    ["payload = sub(payload,1,pos_start-1)..spell..sub(payload,pos_header_end+1)", "Замена имени на месте."],
    ["return VERDICT_MODIFY", "Изменённый запрос уйдёт в сеть."]
  ]}],
  syntax: [["#spell ~= 4", "проверка длины"], ["error(...)", "жёсткая валидация"], ["array_field_search", "поиск по полю"], ["pos_header_end+1", "продолжение после имени"]],
  bugs: [{ level: "crit", title: "spell не из 4 символов", breaks: "error → инстанс падает; изменение длины сломало бы sequence.", fix: "Ровно 4: Host, hOsT, HOST." }],
  fixTitle: "Эталонный вызов", fix: `--payload=http_req --lua-desync=http_hostcase:spell=HoSt
--lua-desync=http_hostcase:spell=HOST`,
  test: `--debug --lua-desync=http_hostcase:spell=HoSt
# в логе: "http_hostcase: 'Host:' => 'HoSt:'"`,
  how: ["Меняем имя заголовка.", "Длина обязана сохраниться.", "Позиции берём из разбора http."]
};

export const http_methodeol = {
  id: "http_methodeol", title: "Разбор: http_methodeol", kind: "desync",
  lead: "Переносит CRLF: добавляет перевод строки перед запросом и убирает в конце User-Agent.",
  tags: ["desync", "HTTP", "порядок важен", "эталон"],
  sig: "function http_methodeol(ctx, desync)",
  args: [["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY при успехе, иначе nil",
  idea: ["Многие парсеры ждут, что первая строка — метод. Пустая строка перед запросом сбивает такой парсер.", "RFC допускает игнорирование ведущего CRLF, поэтому сервер запрос примет."],
  ideaNote: "Должен быть ПОСЛЕДНИМ среди http-функций: сдвигает все позиции в пакете.",
  wire: [{ caption: "Перенос CRLF", diagram:
`было:  GET / HTTP/1.1<CRLF>Host: ...<CRLF>User-Agent: X<CRLF><CRLF>
стало: <CRLF>GET / HTTP/1.1<CRLF>Host: ...<CRLF>User-Agent: X<CRLF>
длина пакета не меняется` }],
  api: [
    { name: "http_dissect_req", from: "zapret-lib", sig: "http_dissect_req(payload)", ret: "разбор", text: "Нужны позиции User-Agent." },
    { name: "array_field_search", from: "zapret-lib", sig: "array_field_search(hdis.headers,'header_low','user-agent')", ret: "индекс", text: "Ищем UA." }
  ],
  lines: [{ title: "function http_methodeol", items: [
    ["local idx_ua = array_field_search(hdis.headers, \"header_low\", \"user-agent\")", "Без UA функция не работает."],
    ["if (ua.pos_end - ua.pos_value_start) < 2 then DLOG('too short')", "Значение UA должно быть достаточно длинным."],
    ["payload = CRLF..sub(payload,1,ua.pos_end-2)..sub(payload,ua.pos_end+1)", "CRLF спереди, минус байт в конце UA."],
    ["return VERDICT_MODIFY", "Длина сохранена, sequence не едет."]
  ]}],
  syntax: [["CRLF", "два байта CR+LF"], ["ua.pos_end-2 / +1", "удаление одного байта для компенсации"], ["конкатенация трёх частей", "перенос без изменения длины"]],
  bugs: [{ level: "crit", title: "Не последний в цепочке", breaks: "Сдвигает позиции; последующие функции испортят пакет.", fix: "Ставь последним среди http-*." },
    { level: "warn", title: "Нет User-Agent", breaks: "Функция ничего не сделает.", fix: "Нужен UA в запросе." }],
  fixTitle: "Эталонный вызов", fix: `--payload=http_req
--lua-desync=http_hostcase:spell=HoSt --lua-desync=http_domcase --lua-desync=http_methodeol`,
  test: `--debug --lua-desync=http_methodeol
# в дампе: запрос начинается с пустой строки`,
  how: ["Длина обязана сохраниться.", "Всегда последний среди http-функций.", "Требует User-Agent."]
};

export const http_unixeol = {
  id: "http_unixeol", title: "Разбор: http_unixeol", kind: "desync",
  lead: "Заменяет CRLF на LF во всём запросе, компенсируя длину пробелами в User-Agent. Аналог tpws --unixeol.",
  tags: ["desync", "HTTP", "EOL", "эталон"],
  sig: "function http_unixeol(ctx, desync)",
  args: [["dir", "in|out|any", "out", "направление"]],
  std: "direction", ret: "VERDICT_MODIFY только если длина совпала, иначе nil",
  idea: ["LF вместо CRLF ломает DPI, разбирающие HTTP по CRLF; многие серверы принимают и LF.", "Каждая замена убирает байт — недостающие добираются пробелами в значении User-Agent."],
  wire: [{ caption: "5 заголовков → 5 потерянных байт", diagram:
`было:  ...<CRLF> x5 ... User-Agent: X
стало: ...<LF>   x5 ... User-Agent: X.....  (5 пробелов)
длина идентична` }],
  api: [
    { name: "http_reconstruct_req", from: "zapret-lib", sig: "http_reconstruct_req(hdis, true)", ret: "собранный запрос", text: "Второй аргумент true = unix EOL." },
    { name: "string.rep", from: "Lua", sig: "string.rep(' ', #payload - #http)", text: "Добор недостающих байт." }
  ],
  lines: [{ title: "function http_unixeol", items: [
    ["local http = http_reconstruct_req(hdis, true)", "Сборка с LF — пакет короче."],
    ["if #http < #payload then ua.value = ua.value .. string.rep(' ', #payload-#http) end", "Добираем разницу пробелами."],
    ["http = http_reconstruct_req(hdis, true)", "Пересборка."],
    ["if #http==#desync.dis.payload then payload = http; return VERDICT_MODIFY", "Только при точном совпадении длины."],
    ["else DLOG('reconstruct differs in size')", "Иначе не трогаем пакет."]
  ]}],
  syntax: [["http_reconstruct_req(hdis, true)", "флаг режима сборки"], ["#payload - #http", "число потерянных байт"], ["string.rep(' ', n)", "компенсация"], ["проверка равенства длин", "условие безопасности TCP"]],
  bugs: [{ level: "crit", title: "Изменение длины без компенсации", breaks: "Укороченный пакет сломает нумерацию TCP.", fix: "Не убирай проверку равенства длин." },
    { level: "warn", title: "Нет User-Agent", breaks: "Некуда добирать байты.", fix: "Требует UA." }],
  fixTitle: "Эталонный вызов", fix: `--payload=http_req --lua-desync=http_unixeol
--lua-desync=http_unixeol --lua-desync=http_domcase --lua-desync=http_methodeol`,
  test: `--debug --lua-desync=http_unixeol
# в логе: "http_unixeol: applied" либо причина отказа`,
  how: ["Замена EOL обязана сохранять длину.", "Компенсация пробелами в UA.", "Проверяй равенство длин перед MODIFY."]
};