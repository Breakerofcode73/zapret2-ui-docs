export const fake = {
  id: "fake", title: "Разбор: fake", kind: "desync",
  lead: "Главная функция обхода: фейковый пейлоад перед реальным. DPI делает вывод по фейку, оригинал проходит мимо.",
  tags: ["desync", "fake", "TCP/UDP", "эталон"],
  idea: [
    "DPI часто решает по первому пакету с данными. Если подсунуть ему «запрос», который сервер не примет (короткий TTL, битая сумма, MD5), DPI удовлетворится, а настоящий запрос пойдёт уже без проверки.",
    "fake отправляет копию пейлоада (блоб) с искажениями, оригинал не трогает. Для TLS умеет модифицировать ClientHello прямо в фейке."
  ],
  ideaTable: [
    ["blob", "что слать: 0xHEX, поле desync, глобальная переменная (fake_default_tls/http)"],
    ["tls_mod", "rnd, rndsni, sni=, dupsid, padencap — искажение ClientHello в фейке"],
    ["fooling", "ip_ttl, tcp_md5, badsum — чтобы сервер фейк отбросил"],
    ["optional", "пропустить, если блоба нет (не падать)"]
  ],
  ideaNote: "fake не режет оригинал. Комбинируется с multisplit/multidisorder отдельными инстансами.",
  wire: [
    { caption: "С fooling (ttl=6, badsum):", diagram:
`фейк:     [ip ttl=6][tcp][FAKE ClientHello] badsum → умирает по пути / дропается сервером
оригинал: [ip ttl=64][tcp][REAL ClientHello]       → PASS → сервер
DPI:      видит фейк → вывод → оригинал проходит` }
  ],
  wireNote: "Сегментация фейка автоматическая (rawsend_payload_segmented) — о размерах пакетов думать не нужно.",
  api: [
    { name: "blob", from: "zapret-lib", sig: "local f = blob(desync, desync.arg.blob)", ret: "блоб или error", text: "Достаёт бинарные данные фейка. Нет блоба и нет optional → error." },
    { name: "blob_exist", from: "zapret-lib", sig: "if desync.arg.optional and not blob_exist(desync, name) then return end", ret: "true/false", text: "Мягкая проверка для optional." },
    { name: "tls_mod_shim", from: "zapret-lib", sig: "local pl = tls_mod_shim(desync, f, desync.arg.tls_mod, desync.reasm_data)", ret: "модифицированный блоб", text: "Применяет rnd/rndsni/sni/dupsid/padencap к фейковому ClientHello." },
    { name: "replay_first", from: "zapret-lib", sig: "if replay_first(desync) then ... end", ret: "true на первой части", text: "Фейк шлётся один раз на сообщение, а не на каждую часть replay." },
    { name: "rawsend_payload_segmented", from: "zapret-lib", sig: "rawsend_payload_segmented(desync, f)", ret: "true при успехе", text: "Отправка фейка с авто-сегментацией и стандартным fooling." }
  ],
  lines: [{ title: "function fake(ctx, desync)", items: [
    ["direction_cutoff_opposite(ctx, desync)", "Отключает инстанс для входящих — фейки только исходящие."],
    ["if (desync.dis.tcp or desync.dis.udp) and direction_check(desync) and payload_check(desync) then", "Только TCP/UDP, стандартные фильтры dir и payload."],
    ["if replay_first(desync) then", "Действуем на первой части сообщения."],
    ["if not desync.arg.blob then error('fake: blob required') end", "blob обязателен — без него нечего слать."],
    ["if desync.arg.optional and not blob_exist(...) then return end", "optional: нет блоба — тихо пропускаем."],
    ["local fake_payload = blob(desync, desync.arg.blob)", "Достаём фейковые байты."],
    ["if desync.reasm_data and desync.arg.tls_mod then ... tls_mod_shim ... end", "Для TLS модифицируем фейковый ClientHello."],
    ["if b_debug then DLOG('fake: '..hexdump_dlog(fake_payload)) end", "Hexdump только под --debug."],
    ["rawsend_payload_segmented(desync, fake_payload)", "Отправка фейка. Оригинал не трогается → неявный PASS."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `-- TLS: фейк с MD5 и модификациями ClientHello
--payload=tls_client_hello
--lua-desync=fake:blob=fake_default_tls:tcp_md5:tls_mod=rnd,rndsni,dupsid

-- HTTP: фейк с коротким TTL
--payload=http_req
--lua-desync=fake:blob=fake_default_http:ip_ttl=6

-- свой фейк из файла
--blob=myfake:@files/fake/tls_mod.bin
--lua-desync=fake:blob=myfake:ip_ttl=8:badsum`,
  fixNote: "fake сам не дропает оригинал. Чтобы фейк + рез оригинала — добавь вторым инстансом multisplit.",
  test: `--debug --lua-desync=argdebug --lua-desync=fake:blob=fake_default_tls:tcp_md5
# в дампе: фейк (битая сумма/короткий TTL) + оригинал на сервер
--lua-init=@zapret-pcap.lua`,
  testNote: "Успех: DPI видит фейк, сервер получает нетронутый оригинал, сайт открывается.",
  how: [
    "Фейк должен умереть до сервера: ttl, badsum, tcp_md5 — выбери под свой DPI.",
    "blob обязателен; для опциональных фейков — optional + blob_exist.",
    "Для TLS используй tls_mod, чтобы фейк отличался от оригинала.",
    "Не режь оригинал этой функцией — это работа multisplit.",
    "Комбинируй: fake (ввод DPI в заблуждение) + multisplit (разрыв сигнатуры)."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }, { page: "deep/blob", label: "blob" }]
};

export const multisplit = {
  id: "multisplit", title: "Разбор: multisplit", kind: "desync",
  lead: "Режет пейлоад на части по маркерам и шлёт по порядку. Ломает сигнатуры DPI, привязанные к смещениям.",
  tags: ["desync", "TCP segmentation", "эталон"],
  idea: [
    "Многие DPI ищут SNI/Host по фиксированным offset или собирают поток только при «нормальных» сегментах. Разрезав внутри имени хоста, ты ломаешь оба предположения.",
    "seqovl добавляет перекрытие sequence первым сегментом — DPI со слабой сборкой может взять неверные байты."
  ],
  ideaTable: [
    ["pos", "список маркеров реза: 1,host,midsld+1,-10"],
    ["seqovl", "N байт перекрытия sequence первым сегментом"],
    ["seqovl_pattern", "блоб-заполнитель перекрытия (по умолчанию нули)"],
    ["nodrop", "не дропать оригинал после отправки частей"]
  ],
  wire: [{ caption: "pos=1,host,midsld+1, seqovl=5:", diagram:
`дано:    ClientHello len=517, host на 120..145
части:   [1..1][2..120][121..133][134..517]  (по маркерам)
seq:     часть1 seq=S-5 (5 байт перекрытия), остальные по порядку
DPI:     имя хоста разорвано → сигнатура не совпадает
сервер:  склеивает по seq → исходные 517 байт` }],
  wireNote: "Порядок частей — прямой (в отличие от multidisorder). Перекрытие не портит данные для сервера.",
  api: [
    { name: "resolve_multi_pos", from: "C API", sig: "local pos = resolve_multi_pos(data, desync.l7payload, '1,host,midsld+1')", ret: "массив 1-based позиций", text: "Разрешает список маркеров в точки реза." },
    { name: "delete_pos_1", from: "zapret-lib", sig: "delete_pos_1(pos)", ret: "ничего", text: "Убирает позицию 1: резать по первому байту нельзя." },
    { name: "pattern", from: "zapret-lib", sig: "local pat = pattern(blob(desync, name), 1, seqovl)", ret: "блоб длины seqovl", text: "Заполнитель перекрытия." },
    { name: "rawsend_payload_segmented", from: "zapret-lib", sig: "rawsend_payload_segmented(desync, part, pos_start-1-seqovl)", ret: "true при успехе", text: "Отправка части со сдвигом sequence (0-based)." },
    { name: "replay_drop_set / replay_drop", from: "zapret-lib", sig: "replay_drop_set(desync)", ret: "ничего / true", text: "После успешной отправки всего reasm — дропать последующие части." }
  ],
  lines: [{ title: "function multisplit(ctx, desync)", items: [
    ["if not desync.dis.tcp then ... icmp-оговорка ... return end", "Только TCP; на связанных icmp не отключаемся."],
    ["direction_cutoff_opposite(ctx, desync)", "Входящие не интересны."],
    ["local data = blob_or_def(...) or desync.reasm_data or desync.dis.payload", "Источник: блоб → reasm → payload."],
    ["if replay_first(desync) then", "Действуем на первой части."],
    ["local pos = resolve_multi_pos(data, desync.l7payload, spos)", "Маркер → точки реза."],
    ["delete_pos_1(pos)", "Нельзя резать по байту 1."],
    ["for i=0,#pos do ... end", "Цикл по частям между точками реза."],
    ["if i==0 and seqovl>0 then part = pattern(pat,1,seqovl)..part end", "Перекрытие только первому сегменту."],
    ["if not rawsend_payload_segmented(desync, part, pos_start-1-seqovl) then return VERDICT_PASS end", "Отправка; при неудаче — оригинал."],
    ["replay_drop_set(desync)", "Последующие части дропать."],
    ["return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP", "Оригинал дропаем (если не nodrop)."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `-- рез внутри хоста + перекрытие
--payload=tls_client_hello,http_req
--lua-desync=multisplit:pos=1,host,midsld+1:seqovl=5:seqovl_pattern=0x1603030000

-- простой рез по маркеру
--lua-desync=multisplit:pos=host

-- не дропать оригинал (для комбинации)
--lua-desync=multisplit:pos=midsld:nodrop`,
  test: `--debug --lua-desync=argdebug --lua-desync=multisplit:pos=1,host,midsld+1:seqovl=5
# в дампе: N сегментов, seq первого = S - seqovl
--lua-init=@zapret-pcap.lua`,
  testNote: "Успех: имя хоста разорвано, сервер склеил верно, сайт открылся.",
  how: [
    "Точки реза валидируй: 1 <= pos < len, иначе части пусты.",
    "Сдвиг sequence части = байты до неё минус перекрытие (0-based).",
    "Перекрытие отменяй, если >= точки реза.",
    "Отправляй через rawsend_payload_segmented — MSS учтёт библиотека.",
    "Успех → replay_drop_set → DROP (или PASS при nodrop)."
  ],
  seeAlso: [{ page: "deep/multidisorder", label: "multidisorder" }, { page: "deep/resolve_pos", label: "resolve_pos" }]
};

export const multidisorder = {
  id: "multidisorder", title: "Разбор: multidisorder", kind: "desync",
  lead: "Как multisplit, но части шлются в обратном порядке. Сильнее ломает сборку потока у DPI.",
  tags: ["desync", "TCP disorder", "эталон"],
  idea: [
    "Обратный порядок сегментов заставляет DPI хранить состояние и собирать поток «задом наперёд». Многие DPI этого не умеют и пропускают соединение.",
    "seqovl здесь — маркер позиции (не число байт), применяется ко второму сегменту в исходном порядке и должен быть меньше первой точки реза."
  ],
  ideaTable: [
    ["pos", "маркеры реза (как multisplit)"],
    ["seqovl", "маркер позиции для второго сегмента (< первой точки реза)"],
    ["seqovl_pattern", "заполнитель перекрытия"]
  ],
  wire: [{ caption: "pos=1,host,midsld+1:", diagram:
`части:   [1..1][2..120][121..133][134..517]
порядок: часть4 → часть3 → часть2 → часть1  (обратный)
DPI:     должен собрать задом наперёд → часто не может
сервер:  склеивает по seq → верно` }],
  api: [
    { name: "resolve_multi_pos", from: "C API", sig: "local pos = resolve_multi_pos(data, l7, spos)", ret: "массив позиций", text: "Точки реза." },
    { name: "resolve_pos", from: "C API", sig: "local seqovl = resolve_pos(data, l7, desync.arg.seqovl)", ret: "позиция или nil", text: "seqovl — маркер, разрешается в позицию." },
    { name: "multidisorder_send", from: "antidpi (internal)", sig: "for i=#pos,0,-1 do ... end", ret: "вердикт", text: "Цикл от последней части к первой — суть disorder." }
  ],
  lines: [{ title: "function multidisorder(ctx, desync)", items: [
    ["local data = blob_or_def(...) or reasm_data or payload", "Источник данных."],
    ["local pos = resolve_multi_pos(data, l7, spos)", "Точки реза."],
    ["if desync.arg.seqovl then seqovl = resolve_pos(data, l7, arg.seqovl) end", "seqovl — маркер → позиция."],
    ["multidisorder_send(desync, data, seqovl, pos)", "Отправка в обратном порядке."],
    ["-- внутри send: for i=#pos,0,-1 do", "Цикл с конца — главное отличие от multisplit."],
    ["if i==1 and seqovl>0 then ... перекрытие второму ... end", "Перекрытие второму сегменту исходного порядка."],
    ["replay_drop_set(desync) return ... DROP", "После успеха — дроп оригинала."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `--lua-desync=multidisorder:pos=1,host,midsld+1
--lua-desync=multidisorder:pos=host:seqovl=host-1:seqovl_pattern=0x00000000`,
  fixNote: "seqovl должен разрешиться в позицию меньше первой точки реза, иначе отменится.",
  test: `--debug --lua-desync=multidisorder:pos=1,host,midsld+1
# в дампе: сегменты идут от последнего к первому`,
  how: [
    "Порядок обратный — это и есть атака; не путай с multisplit.",
    "seqovl — маркер, а не число; проверяй, что он < первой точки реза.",
    "legacy-версия повторяет порядок nfqws1 1-в-1 (по каждому пакету)."
  ],
  seeAlso: [{ page: "deep/multisplit", label: "multisplit" }]
};

export const fakedsplit = {
  id: "fakedsplit", title: "Разбор: fakedsplit", kind: "desync",
  lead: "Split с фейками вокруг реальных частей: fake1-real1-fake1-fake2-real2-fake2. Fooling только к фейкам.",
  tags: ["desync", "fake+split", "эталон"],
  idea: [
    "Реальные части окружены фейками с того же диапазона sequence. DPI видит «мусор» поверх реальных данных и может выбрать неверную версию при сборке.",
    "Ключевое: fooling и repeats применяются ТОЛЬКО к фейкам, реальные части идут чистыми (кроме tcp_ts_up)."
  ],
  ideaTable: [
    ["pos", "маркер точки реза"],
    ["nofake1..4", "отключить отдельные фейки"],
    ["pattern", "заполнитель фейков (по умолчанию нули)"],
    ["seqovl", "перекрытие sequence первой реальной части"]
  ],
  wire: [{ caption: "pos=host:", diagram:
`порядок: fake[1..pos-1] → real[1..pos-1] → fake[1..pos-1]
         → fake[pos..end] → real[pos..end] → fake[pos..end]
реальные: чистые (без fooling)
фейки:    с ttl/md5/badsum → умирают
DPI:      тонет в перекрытиях мусора` }],
  api: [
    { name: "resolve_pos", from: "C API", sig: "local pos = resolve_pos(data, l7, arg.pos)", ret: "позиция", text: "Точка реза." },
    { name: "pattern", from: "zapret-lib", sig: "local fake = pattern(fakepat, 1, pos-1)", ret: "блоб-заполнитель", text: "Фейк той же длины, что реальная часть." },
    { name: "rawsend_opts / reconstruct_opts", from: "zapret-lib", sig: "opts_fake = {rawsend=rawsend_opts(desync), reconstruct=reconstruct_opts(desync), fooling=desync.arg}", ret: "opts", text: "Fooling только фейкам; opts_orig — без fooling." }
  ],
  lines: [{ title: "function fakedsplit(ctx, desync)", items: [
    ["local pos = resolve_pos(data, l7, arg.pos)", "Точка реза."],
    ["opts_orig = {... fooling={tcp_ts_up=...}}", "Реальные части: почти без fooling."],
    ["opts_fake = {... fooling=desync.arg}", "Фейки: полный fooling."],
    ["fake = pattern(fakepat, 1, pos-1)", "Фейк первой половины."],
    ["if not arg.nofake1 then send(fake, 0, opts_fake) end", "Фейк 1 (до реальной)."],
    ["send(real1, -seqovl, opts_orig)", "Реальная часть 1."],
    ["if not arg.nofake2 then send(fake, 0, opts_fake) end", "Фейк 1 снова (после)."],
    ["fake = pattern(fakepat, pos, #data-pos+1)", "Фейк второй половины."],
    ["nofake3 → send(fake2) → send(real2) → nofake4 → send(fake2)", "Симметрично для второй половины."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `--payload=http_req
--lua-desync=fakedsplit:pos=host:ip_ttl=6:tcp_md5
-- отключить лишние фейки:
--lua-desync=fakedsplit:pos=host:nofake2:nofake4:ip_ttl=8`,
  test: `--debug --lua-desync=fakedsplit:pos=host:ip_ttl=6
# в дампе: 6 пакетов (3 фейка + 2 реальных + ...), fooling только на фейках`,
  how: [
    "Fooling применяй к фейкам, не к реальным частям — иначе сервер дропнет данные.",
    "nofake1..4 позволяют тонко настроить количество мусора.",
    "pattern задаёт содержимое фейков; по умолчанию нули."
  ],
  seeAlso: [{ page: "deep/fakeddisorder", label: "fakeddisorder" }, { page: "deep/fake", label: "fake" }]
};

export const fakeddisorder = {
  id: "fakeddisorder", title: "Разбор: fakeddisorder", kind: "desync",
  lead: "Как fakedsplit, но вторая половина шлётся первой (disorder). Комбинирует мусор и обратный порядок.",
  tags: ["desync", "fake+disorder", "эталон"],
  idea: [
    "Сочетает две атаки: фейки вокруг реальных частей + обратный порядок половин. DPI должен и собрать задом наперёд, и отфильтровать мусор.",
    "seqovl — маркер позиции для второй реальной части (< точки реза)."
  ],
  wire: [{ caption: "pos=host:", diagram:
`порядок: fake2 → real2 → fake2 → fake1 → real1 → fake1
(вторая половина раньше первой)
DPI:     обратная сборка + мусор → двойная нагрузка` }],
  api: [
    { name: "resolve_pos", from: "C API", sig: "local pos = resolve_pos(data, l7, arg.pos)", ret: "позиция", text: "Точка реза." },
    { name: "resolve_pos (seqovl)", from: "C API", sig: "seqovl = resolve_pos(data, l7, arg.seqovl) - 1", ret: "позиция", text: "Перекрытие второму сегменту; отменяется если >= pos." }
  ],
  lines: [{ title: "function fakeddisorder(ctx, desync)", items: [
    ["fake = pattern(fakepat, pos, #data-pos+1)", "Фейк второй половины."],
    ["nofake1 → send(fake2, pos-1, opts_fake)", "Сначала вторая половина."],
    ["send(real2, pos-1-seqovl, opts_orig)", "Реальная часть 2 с перекрытием."],
    ["nofake2 → send(fake2) снова", "Фейк 2 после."],
    ["fake = pattern(fakepat, 1, pos-1)", "Фейк первой половины."],
    ["nofake3 → send(fake1) → send(real1) → nofake4 → send(fake1)", "Первая половина следом."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `--payload=http_req
--lua-desync=fakeddisorder:pos=host:ip_ttl=6:seqovl=host-1`,
  test: `--debug --lua-desync=fakeddisorder:pos=host:ip_ttl=6
# в дампе: вторая половина раньше первой, фейки с fooling`,
  how: [
    "Отличие от fakedsplit — порядок половин обратный.",
    "seqovl — маркер < точки реза, иначе отмена.",
    "Fooling только фейкам."
  ],
  seeAlso: [{ page: "deep/fakedsplit", label: "fakedsplit" }]
};

export const hostfakesplit = {
  id: "hostfakesplit", title: "Разбор: hostfakesplit", kind: "desync",
  lead: "Подменяет имя хоста фейковым в отдельных сегментах: before_host → fake_host → real_host → fake → after_host.",
  tags: ["desync", "host spoof", "эталон"],
  idea: [
    "DPI видит фейковый hostname (например random.vk.com) в сегментах с fooling, а реальный hostname идёт чистыми частями. DPI делает вывод по фейковому домену.",
    "Самая тонкая функция: реальный host можно дополнительно резать (midhost), а after_host — слать в disorder."
  ],
  ideaTable: [
    ["host", "шаблон фейкового имени: vk.com → random.vk.com"],
    ["midhost", "доп. рез внутри реального host (midsld)"],
    ["nofake1/2", "отключить фейковые host-сегменты"],
    ["disorder_after", "after_host в 2 обратных сегментах"]
  ],
  wire: [{ caption: "host=vk.com, midhost=midsld:", diagram:
`before_host  [1..host-1]            чисто
fake_host    [host..endhost] random.vk.com  fooling → умирает
real_host    [host..midsld][midsld+1..endhost]  чисто, разорван
fake_host    снова               fooling
after_host   [endhost+1..end]    чисто (или disorder)` }],
  api: [
    { name: "resolve_range", from: "C API", sig: "local pos = resolve_range(data, l7, 'host,endhost-1', true)", ret: "[start,end]", text: "Границы имени хоста." },
    { name: "genhost", from: "zapret-lib", sig: "local fakehost = genhost(pos[2]-pos[1]+1, arg.host)", ret: "фейковый hostname той же длины", text: "Генерирует random.vk.com по шаблону." },
    { name: "resolve_pos (midhost)", from: "C API", sig: "local mid = resolve_pos(data, l7, arg.midhost)", ret: "позиция", text: "Доп. рез внутри host; должен быть внутри диапазона." }
  ],
  lines: [{ title: "function hostfakesplit(ctx, desync)", items: [
    ["local pos = resolve_range(data, l7, 'host,endhost-1', true)", "Диапазон host."],
    ["send(before_host, 0, opts_orig)", "Часть до host — чисто."],
    ["fakehost = genhost(len, arg.host)", "Фейковое имя той же длины."],
    ["nofake1 → send(fakehost, host-1, opts_fake)", "Фейк host с fooling."],
    ["if midhost then send(real_host1) send(real_host2) else send(real_host) end", "Реальный host, опц. разорван."],
    ["nofake2 → send(fakehost) снова", "Фейк host после."],
    ["if disorder_after then send(after2) send(after1) else send(after) end", "Хвост, опц. в disorder."]
  ]}],
  bugs: [],
  fixTitle: "Эталонный вызов",
  fix: `--lua-desync=hostfakesplit:host=vk.com:midhost=midsld:ip_ttl=6
-- с disorder хвоста:
--lua-desync=hostfakesplit:host=google.com:disorder_after=-1:ip_ttl=8`,
  test: `--debug --lua-desync=hostfakesplit:host=vk.com:midhost=midsld
# в дампе: фейковый host с fooling + реальный host чистыми частями`,
  how: [
    "Шаблон host должен давать имя той же длины (genhost подгоняет).",
    "midhost — только внутри диапазона host, иначе игнорируется.",
    "Fooling только фейковым host-сегментам."
  ],
  seeAlso: [{ page: "deep/fakedsplit", label: "fakedsplit" }]
};