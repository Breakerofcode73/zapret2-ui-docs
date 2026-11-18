import Code from "../components/Code";
import { Deep, Sec, Lines, Bug, Api, Wire } from "../components/Deep";

export default function DiveFakeIp() {
  return (
    <Deep
      title="Разбор: fake_ip_misdirection"
      lead="Фейковый пакет с подменённым адресом получателя, коротким TTL и битой контрольной суммой. Замысел верный, реализация — нет: 4 из 5 модификаций не применяются."
      tags={["desync", "fake", "L3/L4 fooling", "твой код"]}
      toc={[["idea", "1. Замысел"], ["wire", "2. Механизм"], ["api", "3. API"], ["lines", "4. Построчно"],
        ["bugs", "5. Ошибки"], ["fix", "6. Исправлено"], ["test", "7. Проверка"], ["how", "8. Как писать"]]}
    >
      <Sec id="idea" n="1" title="Замысел: что такое misdirection">
        <p>DPI принимает решение по первым пакетам соединения. Если он увидел «запрос» и сделал вывод —
          настоящий запрос может пройти уже без проверки. Задача функции: подсунуть DPI пакет, похожий на
          ClientHello, но такой, который <b>не дойдёт до сервера</b> или будет сервером отброшен.</p>
        <p>Три независимых «убийцы» пакета, которые ты задумал:</p>
        <table className="kv"><tbody>
          <tr><td>ip_dst = 192.0.2.1</td><td>адрес из TEST-NET-1 (RFC 5737), не маршрутизируется глобально — пакет уйдёт «в никуда», сервер его никогда не увидит</td></tr>
          <tr><td>ip_ttl = 1</td><td>пакет умирает на первом же маршрутизаторе; DPI, стоящий до этого хопа, его видит</td></tr>
          <tr><td>badsum = true</td><td>невалидная L4-сумма: даже если пакет дойдёт, стек сервера его молча дропнет</td></tr>
        </tbody></table>
        <p>Дополнительно <code>tcp_seq</code> вне окна и сдвинутый <code>tcp_ts</code> мешают DPI склеить фейк
          с реальным потоком в один осмысленный запрос.</p>
        <p className="note">TTL=1 не гарантирует видимость DPI: если DPI стоит глубже первого хопа провайдера,
          фейк до него не доедет. Реальный TTL подбирается экспериментом или через <code>ip_autottl</code>.</p>
      </Sec>

      <Sec id="wire" n="2" title="Механизм: что реально уходит в провод">
        <p><b>Как задумано:</b></p>
        <Wire>{`оригинал:  [ip dst=СЕРВЕР ttl=64][tcp seq=S][ClientHello]  → PASS → сервер
фейк:      [ip dst=192.0.2.1 ttl=1][tcp seq=RND][ClientHello] badsum → умирает на 1-м хопе
DPI видит: фейк (мусорный адрес) → делает вывод → оригинал проходит мимо`}</Wire>
        <p><b>Как работает сейчас:</b></p>
        <Wire>{`оригинал:  [ip dst=СЕРВЕР ttl=64][tcp seq=S][ClientHello]  → PASS → сервер
фейк:      [ip dst=СЕРВЕР ttl=64][tcp seq=S][ClientHello] badsum → летит на сервер, дропается стеком
DPI видит: ДВА одинаковых ClientHello подряд (эффект «дубля», а не misdirection)`}</Wire>
        <p>Причина: <code>reconstruct</code> — это не «список любых изменений пакета». Это узкий набор опций
          сборки пакета из диссекта, и в zapret2 v1.0.7 документирована ровно одна: <code>badsum</code>.
          Все остальные присвоенные поля просто лежат в таблице и никем не читаются.</p>
      </Sec>

      <Sec id="api" n="3" title="Каждый использованный вызов">
        <Api name="desync_opts" from="zapret-lib.lua" sig="local opts = desync_opts(desync)"
          ret="композиционную таблицу opts">
          Собирает из <code>desync.arg</code> четыре независимых группы:
          <code>opts.rawsend</code> (repeats, ifout, fwmark), <code>opts.reconstruct</code> (badsum),
          <code>opts.ipfrag</code>, <code>opts.ipid</code>, <code>opts.fooling</code>.
          Ключевое: это <b>разные</b> словари для разных стадий. Поля нельзя сваливать в одну кучу.
        </Api>
        <Api name="deepcopy" from="zapret-lib.lua" sig="local dis = deepcopy(desync.dis)"
          ret="независимую копию диссекта со всеми вложенными таблицами">
          Без неё изменение «копии» изменило бы оригинал, и VERDICT_PASS отправил бы модифицированный пакет.
          Здесь использована правильно.
        </Api>
        <Api name="apply_fooling" from="zapret-lib.lua" sig="apply_fooling(desync, dis)"
          ret="ничего; модифицирует dis на месте">
          Вот где живут ip_ttl, ip6_ttl, ip_autottl, tcp_seq, tcp_ack, tcp_ts, tcp_md5, tcp_flags_set/unset,
          tcp_ts_up, tcp_nop_del, ip6-расширения. Читает <code>desync.arg</code> и применяет к переданному диссекту.
        </Api>
        <Api name="apply_ip_id" from="zapret-lib.lua" sig="apply_ip_id(desync, dis, track, default)"
          ret="ничего; модифицирует dis">
          Режимы ip_id: seq | rnd | zero | none. Именно отсюда берётся «rnd», а не из reconstruct.
        </Api>
        <Api name="rawsend_dissect_ipfrag" from="zapret-lib.lua"
          sig="local ok = rawsend_dissect_ipfrag(dis, opts)" ret="true при успешной отправке">
          Проверенный путь (используется в стандартной <code>send</code>): реконструкция диссекта → IP-фрагментация
          по opts.ipfrag → отсылка по opts.rawsend. Реконструкция учитывает opts.reconstruct.badsum и
          пересчитывает контрольные суммы.
        </Api>
        <Api name="rawsend_dissect" from="C API (nfq2/lua.c)" sig="rawsend_dissect(dis, ...)"
          ret="результат отправки">
          Низкоуровневая C-функция. Точный порядок аргументов сверяй в исходнике
          <code>luacall_rawsend_dissect</code> или в мануале «Прием и отсылка пакетов» — не угадывай.
          В своём коде безопаснее вызывать библиотечный хелпер выше.
        </Api>
        <Api name="pton" from="C API" sig="local b = pton('192.0.2.1')" ret="blob с IP (4 или 16 байт), версия авто">
          Поля адресов в диссекте — бинарные blob, а не строки. Присваивать строку напрямую нельзя.
        </Api>
        <Api name="u32 / brandom" from="C API" sig="local n = u32(brandom(4))" ret="случайное 32-битное число">
          Портируемая замена math.random(0, 0xFFFFFFFF): работает одинаково в LuaJIT и PUC Lua.
        </Api>
      </Sec>

      <Sec id="lines" n="4" title="Построчный разбор исходника">
        <Lines items={[
          ["function fake_ip_misdirection(ctx, desync)", "Глобальная функция → её имя можно указать в --lua-desync. ctx — контекст C для управления, desync — таблица текущего пакета."],
          ["if not desync.outgoing or #desync.dis.payload == 0 then", "Фильтр: только исходящие и с непустым пейлоадом. # — длина blob в байтах. Нет проверки tcp/udp: icmp с payload тоже пройдёт внутрь."],
          ["return VERDICT_PASS", "Ранний выход: оригинал не тронут. Корректно."],
          ["end", "Конец фильтра. Заметь: при таком выходе инстанс не отключается и будет вызываться на каждом пакете потока."],
          ["local opts_fake = desync_opts(desync)", "Собирает композиционные opts из аргументов инстанса. local — переменная живёт только внутри вызова."],
          ["opts_fake.reconstruct.ip_dst = desync.arg.ip_dst or \"192.0.2.1\"", "❌ У reconstruct нет поля ip_dst. or — выбор значения по умолчанию. Адрес меняется только в диссекте через pton()."],
          ["opts_fake.reconstruct.ip_ttl = tonumber(desync.arg.ip_ttl) or 1", "❌ ttl — это fooling/dis.ip.ip_ttl. tonumber обязателен (аргументы — строки), но кладётся не туда."],
          ["opts_fake.reconstruct.badsum = true", "✅ Единственная документированная опция reconstruct. L4-сумма станет невалидной."],
          ["opts_fake.reconstruct.ip_id = \"rnd\"", "❌ ip_id обслуживает apply_ip_id / opts.ipid, не reconstruct."],
          ["if desync.dis.tcp then", "Ветка только для TCP. Для UDP поля seq/ts не существуют — проверка уместна."],
          ["opts_fake.reconstruct.tcp_seq = math.random(0, 0xFFFFFFFF)", "❌ Не reconstruct. Плюс math.random с диапазоном 2^32 может не поддерживаться в LuaJIT."],
          ["opts_fake.reconstruct.tcp_ts = -600000", "❌ tcp_ts — стандартный fooling-аргумент: добавляет N к существующему timestamp, а не задаёт абсолютное значение."],
          ["end", "Конец tcp-ветки."],
          ["local fake_dis = deepcopy(desync.dis)", "✅ Правильно: копия, оригинал не затрагивается."],
          ["rawsend_dissect(fake_dis, opts_fake.rawsend, opts_fake.reconstruct)", "⚠️ Сигнатуру нужно сверить; ipfrag не задействован; поля выше проигнорированы → уходит почти неизменённая копия."],
          ["return VERDICT_PASS", "Оригинал пропускается — для фейковой функции это верно."],
          ["end", "Конец функции. Отсутствуют: replay-защита, cutoff, DLOG, стандартные фильтры."]
        ]} />
      </Sec>

      <Sec id="bugs" n="5" title="Ошибки и их последствия">
        <Bug level="crit" title="Модификации положены не в тот словарь"
          breaks="ip_dst, ip_ttl, ip_id, tcp_seq, tcp_ts молча игнорируются. Фейк = копия оригинала с битой суммой, летящая на настоящий сервер. Никакого misdirection нет."
          fix="Адрес и TTL — прямо в поля диссекта; seq/ts — через apply_fooling; ip_id — через apply_ip_id; в reconstruct оставить только badsum.">
          reconstruct отвечает за сборку blob из диссекта, fooling — за искажение полей, ipid — за IP ID.
          Это три разные стадии обработки.
        </Bug>
        <Bug level="crit" title="Нет защиты от replay"
          breaks="Многопакетный ClientHello проигрывается частями — фейк отправится столько раз, сколько частей. Лишний мусор в сети и лишняя нагрузка."
          fix="if not replay_first(desync) then if replay_drop(desync) then return VERDICT_DROP end return end" />
        <Bug level="crit" title="Нет instance cutoff"
          breaks="Функция вызывается на каждом исходящем пакете с данными до конца соединения — сотни бесполезных вызовов Lua на одно соединение."
          fix="instance_cutoff_shim(ctx, desync) после успешной отправки; на не-tcp/udp — с оговоркой про icmp." />
        <Bug level="warn" title="Строка вместо blob в адресе"
          breaks="Если просто присвоить dis.ip.ip_dst = '192.0.2.1', в заголовок попадут ASCII-байты строки, а не 4 байта адреса."
          fix="dis.ip.ip_dst = pton('192.0.2.1'). Точное имя поля адреса узнай через pktdebug." />
        <Bug level="warn" title="math.random(0, 0xFFFFFFFF)"
          breaks="В LuaJIT большой диапазон может вызвать ошибку аргумента; поведение отличается от PUC Lua 5.3+."
          fix="u32(brandom(4)) — одинаково на всех движках." />
        <Bug level="info" title="Функция немая"
          breaks="Ни одного DLOG: в debug-логе не видно, сработала ли она и с какими параметрами."
          fix="if b_debug then DLOG(...) end — гейт обязателен, чтобы не жечь CPU без --debug." />
      </Sec>

      <Sec id="fix" n="6" title="Исправленная версия">
        <Code lines>{`-- fake_ip_misdirection.lua
-- подключение: --lua-init=@zapret-lib.lua --lua-init=@zapret-antidpi.lua
--              --lua-init=@fake_ip_misdirection.lua
-- вызов: --payload=tls_client_hello
--        --lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ttl=1:tcp_ts=-600000

function fake_ip_misdirection(ctx, desync)
    -- 1. только tcp/udp; на связанных icmp не отключаемся
    if not (desync.dis.tcp or desync.dis.udp) then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return end
    if not payload_check(desync) then return end
    if #desync.dis.payload == 0 then return end

    -- 2. многопакетный пейлоад: действуем один раз
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return
    end

    -- 3. копия: оригинал не трогаем
    local dis = deepcopy(desync.dis)

    -- 4. стандартное fooling из аргументов (ttl, tcp_ts, tcp_md5, ...)
    apply_fooling(desync, dis)
    apply_ip_id(desync, dis, nil, "rnd")

    -- 5. то, чего нет в стандартных аргументах: подмена адреса
    local dst = desync.arg.ip_dst or "192.0.2.1"
    local ttl = tonumber(desync.arg.ttl) or 1
    if dis.ip then
        dis.ip.ip_dst = pton(dst)
        dis.ip.ip_ttl = ttl
    elseif dis.ip6 then
        dis.ip6.ip6_dst = pton(dst)
        dis.ip6.ip6_hlim = ttl
    end

    -- 6. случайный seq вне окна (портируемо)
    if dis.tcp then dis.tcp.th_seq = u32(brandom(4)) end

    -- 7. битая L4-сумма + отправка проверенным хелпером
    local opts = desync_opts(desync)
    opts.reconstruct.badsum = true
    if b_debug then
        DLOG("fake_ip_misdirection: dst=" .. dst .. " ttl=" .. ttl)
    end
    local ok = rawsend_dissect_ipfrag(dis, opts)

    -- 8. миссия выполнена; оригинал проходит как есть
    instance_cutoff_shim(ctx, desync)
    return ok and VERDICT_PASS or VERDICT_PASS
end`}</Code>
        <p className="note">Имена полей адресов (<code>ip_dst</code>, <code>ip6_dst</code>) сверь дампом
          <code>--lua-desync=pktdebug</code>: он печатает весь диссект с реальными именами. Если в вашей
          сборке они другие — правь только эти две строки. Последняя строка возвращает PASS в обоих
          случаях намеренно: фейк не должен блокировать оригинал.</p>
      </Sec>

      <Sec id="test" n="7" title="Как проверить, что работает">
        <Code>{`# 1. увидеть структуру диссекта и имена полей
--lua-desync=pktdebug

# 2. убедиться, что функция вызывается и с какими аргументами
--lua-desync=argdebug --lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ttl=1

# 3. полный лог с hexdump
nfqws2 --qnum=200 --debug ... 2>&1 | tee /tmp/z2.log

# 4. дамп в провод: рядом должны быть два пакета —
#    фейк на 192.0.2.1 с ttl=1 и оригинал на сервер
--lua-init=@zapret-pcap.lua`}</Code>
        <p>Критерий успеха: в дампе видно <b>два разных</b> IP-получателя. Если оба пакета идут на сервер —
          модификации по-прежнему не применяются.</p>
      </Sec>

      <Sec id="how" n="8" title="Как писать функции этого класса">
        <ol className="check">
          <li>Определи, <b>что должно умереть</b>: фейк (TTL/адрес/сумма) или оригинал (DROP).</li>
          <li>Всегда <code>deepcopy</code> перед изменением — оригинал неприкосновенен, пока не решил MODIFY.</li>
          <li>Разложи изменения по стадиям: поля диссекта → apply_fooling → apply_ip_id → opts.reconstruct → opts.ipfrag → opts.rawsend.</li>
          <li>Строку в blob — только через <code>pton</code>/<code>parse_hex</code>/<code>buX</code>.</li>
          <li>Числа из аргументов — только <code>tonumber</code>; seq/ack — только <code>u32add</code>.</li>
          <li>Каркас обязателен:.transport-фильтр → direction/payload → replay → действие → cutoff → вердикт.</li>
          <li>Каждый нетривиальный шаг — под <code>if b_debug then DLOG(...) end</code>.</li>
        </ol>
        <p>Соседние функции для сравнения: <a href="#/antidpi">fake, send, rst</a> — там тот же каркас в эталонном виде.</p>
      </Sec>
    </Deep>
  );
}