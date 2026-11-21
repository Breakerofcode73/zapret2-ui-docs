import Code from "../components/Code";
import { Deep, Sec, Lines, Bug, Api, Wire } from "../components/Deep";

export default function DiveRandomSplit() {
  return (
    <Deep
      title="Разбор: outline_random_split"
      lead="Случайная точка реза внутри SNI + fallback на 1 байт для неполного ClientHello + перекрытие sequence. Три функции, 5 дефектов, один из них рвёт соединение."
      tags={["desync", "TCP segmentation", "TLS", "твой код"]}
      toc={[["idea", "1. Замысел"], ["wire", "2. Механизм"], ["helpers", "3. Хелперы"], ["main", "4. Основная"],
        ["bugs", "5. Ошибки"], ["fix", "6. Исправлено"], ["test", "7. Проверка"], ["how", "8. Как писать"]]}
    >
      <Sec id="idea" n="1" title="Замысел: зачем случайный рез внутри хоста">
        <p>Многие DPI ищут SNI/Host по фиксированным смещениям или собирают поток только если сегменты
          приходят «нормально». Разрезав TCP-поток <b>внутри имени хоста</b> в случайной точке, ты ломаешь
          оба предположения: сигнатура не совпадает по offset, а сборка требует от DPI больше состояния.</p>
        <p>Три идеи, заложенные в код:</p>
        <table className="kv"><tbody>
          <tr><td>resolve_range host,endhost-1</td><td>найти границы имени хоста в пейлоаде (работает и для TLS SNI, и для http Host)</td></tr>
          <tr><td>math.random внутри границ</td><td>каждое соединение режется по-новому — фиксированной сигнатуры «реза» нет</td></tr>
          <tr><td>fallback split=1</td><td>если ClientHello неполный и маркеры не разрешаются — резать после первого байта, чтобы TLS record header оказался разорван</td></tr>
          <tr><td>seqovl на второй сегмент</td><td>второй сегмент начинается раньше и повторяет хвост первого — DPI со «слабой» сборкой может взять неверную версию данных</td></tr>
        </tbody></table>
      </Sec>

      <Sec id="wire" n="2" title="Механизм на проводе">
        <Wire>{`дано:  ClientHello, len=517, SNI на байтах 120..145 (1-based)
выбран split_pos = 133 (случайно внутри SNI), seqovl = 5

сегмент 1: seq=S+0    данные[1..133]      ← начало TLS + половина имени
сегмент 2: seq=S+128  данные[129..517]    ← 5 байт перекрытия + остаток
оригнал:   VERDICT_DROP (или PASS при :nodrop)

DPI видит: имя хоста разорвано, второй сегмент перекрывает первый.
Сервер:    склеивает по seq, перекрытие отбрасывает → получает исходные 517 байт.`}</Wire>
        <p>Важно: перекрытие не портит данные для сервера — TCP допускает перекрывающиеся сегменты,
          и нормальный стек оставляет первую полученную версию байтов. Именно поэтому порядок отправки
          (сначала первый сегмент, потом второй) здесь корректен.</p>
        <p>Fallback-ветка даёт другой рисунок:</p>
        <Wire>{`сегмент 1: seq=S+0  1 байт  (0x16 — тип TLS record)
сегмент 2: seq=S+1  всё остальное
DPI, которому нужен весь record header в первом сегменте, теряет сигнатуру.`}</Wire>
      </Sec>

      <Sec id="helpers" n="3" title="Хелпер 1: is_complete_client_hello — построчно">
        <Api name="string.byte" from="стандартная Lua" sig="local b1, b2 = string.byte(data, 1, 2)"
          ret="числовые коды байтов; несколько значений сразу">
          Индексы 1-based. Функция возвращает по значению на каждый запрошенный индекс.
        </Api>
        <Lines items={[
          ["local function is_complete_client_hello(data)", "local function — видна только внутри файла. Инстансом (--lua-desync) её вызвать нельзя, и это правильно: это внутренний хелпер."],
          ["if not data or #data < 6 then return false end", "Защита от nil и от слишком короткого буфера. 6 — минимум, чтобы прочитать заголовок и первый байт тела."],
          ["local b1, b2 = string.byte(data, 1, 2)", "Читает два первых байта: тип записи и старшая версия."],
          ["if b1 ~= 0x16 or b2 ~= 0x03 then return false end", "0x16 = handshake, 0x03 = SSL3/TLS major. ~= это «не равно». Проверка «это вообще TLS?»."],
          ["local rlen = (string.byte(data, 4) or 0) * 256 + (string.byte(data, 5) or 0)", "Ручное чтение 16-битного big-endian: старший байт * 256 + младший. Эквивалент u16(data, 3) из C API (там смещение 0-based)."],
          ["if rlen < 1 then return false end", "Пустая запись не считается валидной."],
          ["return #data >= (5 + rlen)", "Полнота: 5 байт заголовка + тело. Если буфер короче — ClientHello ещё не собран."],
          ["end", "Конец. Замечание: байт 3 (minor version) не проверяется, а многозаписные ClientHello не учитываются — для практики это допустимо."]
        ]} />
      </Sec>

      <Sec id="main" n="4" title="Хелпер 2 и основная функция — построчно">
        <Api name="pcall" from="стандартная Lua" sig="local ok, res = pcall(f, arg1, arg2, ...)"
          ret="ok=true и результат, либо ok=false и текст ошибки">
          Защищённый вызов. Нужен потому, что <code>resolve_range</code> при неразрешимых маркерах
          может вызвать <code>error()</code> — без pcall это уронило бы весь инстанс («desync ERR»).
        </Api>
        <Lines start={9} items={[
          ["local function find_split_pos(desync, data)", "Внутренний выбор точки реза: сначала по имени хоста, иначе случайно."],
          ["local len = #data", "Длина пейлоада в байтах."],
          ["if len < 20 then return nil end", "Слишком короткий буфер резать бессмысленно. nil — «позиции нет»."],
          ["local ok, host_range = pcall(resolve_range, data, desync.l7payload, \"host,endhost-1\", true)", "Тот же вызов, что в стандартной hostfakesplit: диапазон имени хоста, endhost-1 — последний байт включительно."],
          ["if ok and host_range and host_range[1] and host_range[2]", "Проверка четырёх условий: вызов не упал, таблица есть, обе позиции есть. and короткозамкнут — дальше не пойдёт при nil."],
          ["and host_range[1] >= 1 and host_range[2] >= host_range[1]", "Валидация: позиции 1-based и не перевёрнуты."],
          ["and host_range[2] <= len then", "Диапазон не выходит за буфер."],
          ["local sp", "Объявление без значения = nil."],
          ["if host_range[2] > host_range[1] then", "Есть хотя бы два байта — можно выбрать точку внутри."],
          ["sp = math.random(host_range[1], host_range[2] - 1)", "Случайная точка так, чтобы обе части были непустыми."],
          ["else sp = host_range[1] end", "Однобайтовое имя: режем по его началу."],
          ["DLOG(...)", "Лог без гейта b_debug — тратит CPU даже без --debug."],
          ["return sp", "Возврат 1-based позиции реза."],
          ["end", "Конец ветки успеха."],
          ["local fb = math.random(math.floor(len * 0.25), math.floor(len * 0.75))", "Fallback: случайная точка в средней половине пейлоада. floor — вниз до целого."],
          ["DLOG(...) return fb", "Лог и возврат. При len>=20 границы всегда >=1 и lo<hi — безопасно."],
          ["end", "Конец find_split_pos."]
        ]} />
        <Lines start={27} items={[
          ["function outline_random_split(ctx, desync)", "Глобальная → доступна как --lua-desync=outline_random_split."],
          ["if not desync.dis.tcp then instance_cutoff_shim(ctx, desync) return end", "Не TCP → отключиться. Отличие от эталона: стандартные функции НЕ отключаются на связанных icmp."],
          ["direction_cutoff_opposite(ctx, desync)", "Отключает инстанс для противоположного направления — верно."],
          ["local data", "Источник данных будет выбран ниже."],
          ["if desync.reasm_data and #desync.reasm_data > 0 then data = desync.reasm_data", "Приоритет собранному сообщению. Отличие от эталона: там блоб из аргумента важнее reasm."],
          ["elseif desync.arg.blob then data = blob(desync, desync.arg.blob)", "Иначе — блоб. При многопакетном hello эта ветка недостижима."],
          ["else data = desync.dis.payload end", "Иначе — пейлоад текущего пакета."],
          ["if not data or #data == 0 then return VERDICT_PASS end", "Пусто → пропускаем."],
          ["if not replay_first(desync) then", "Не первая часть многопакетного сообщения."],
          ["DLOG(...) replay_drop_set(desync) return VERDICT_DROP end", "❌ Устанавливает флаг дропа на поздних частях вместо проверки. Рвёт сообщение, если первая отправка не удалась."],
          ["if not is_complete_client_hello(data) then", "❌ Срабатывает и для http/unknown — там тоже «не TLS»."],
          ["DLOG(...) local p1 = string.sub(data, 1, 1)", "Первый байт. string.sub(data, a, b) — 1-based, включительно."],
          ["local p2 = string.sub(data, 2)", "Всё остальное; без b — до конца."],
          ["if not rawsend_payload_segmented(desync, p1, 0) then return VERDICT_PASS end", "Отправка с авто-сегментацией; 0 — сдвиг sequence. При неудаче отдаём оригинал."],
          ["if not rawsend_payload_segmented(desync, p2, 1) then return VERDICT_PASS end", "Вторая часть со сдвигом 1. Риск: первая уже ушла, оригинал уйдёт целиком → дубль начала."],
          ["replay_drop_set(desync)", "Пометить последующие части на дроп — здесь корректно."],
          ["return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP", "Идиома тернарника. В Lua ложны только nil/false, поэтому 0 и \"\" истинны — идиома безопасна."],
          ["end", "Конец fallback-ветки."],
          ["local len = #data", "Повторный подсчёт длины (уже был выше) — безвредно."],
          ["if len < 20 then return VERDICT_PASS end", "Короткие не режем."],
          ["local split_pos = find_split_pos(desync, data)", "Выбор точки."],
          ["if not split_pos or split_pos < 1 or split_pos >= len then return VERDICT_PASS end", "Валидация: рез должен оставлять обе части непустыми. Хорошая защита."],
          ["local seqovl = 0", "Перекрытие по умолчанию выключено."],
          ["if desync.arg.seqovl and tonumber(desync.arg.seqovl) > 0 then seqovl = tonumber(...) end", "Строку в число — правильно."],
          ["local part1 = string.sub(data, 1, split_pos)", "Первая часть включительно до точки реза."],
          ["if b_debug then DLOG(...) end", "✅ Гейт отладки — эталонный приём."],
          ["if not rawsend_payload_segmented(desync, part1, 0) then return VERDICT_PASS end", "Отправка первой части."],
          ["local part2_offset = split_pos", "Сдвиг второй части = число байтов в первой (0-based)."],
          ["local part2 = string.sub(data, split_pos + 1)", "Хвост."],
          ["if seqovl > 0 and split_pos >= seqovl then", "❌ Допускает равенство: при split_pos == seqovl вторая часть станет всем сообщением с offset 0."],
          ["part2_offset = split_pos - seqovl", "Сдвигаем начало второй части назад."],
          ["local overlap = string.sub(data, split_pos - seqovl + 1, split_pos)", "Хвост первой части длиной seqovl."],
          ["part2 = overlap .. part2", ".. — конкатенация blob."],
          ["end", "Конец перекрытия."],
          ["if b_debug then DLOG(...) end", "Лог второй части."],
          ["if not rawsend_payload_segmented(desync, part2, part2_offset) then return VERDICT_PASS end", "Отправка второй части."],
          ["replay_drop_set(desync)", "Последующие части replay дропать."],
          ["return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP", "Оригинал дропаем, если не попросили nodrop."],
          ["end", "Конец функции. Нет direction_check/payload_check — стандартные аргументы dir/payload не работают."]
        ]} />
      </Sec>

      <Sec id="bugs" n="5" title="Ошибки и их последствия">
        <Bug level="crit" title="replay_drop_set на поздних частях"
          breaks="Если отправка первой части не удалась (функция вернула PASS и оригинал ушёл), все последующие части сообщения всё равно дропаются → сообщение обрезано → соединение висит или рвётся."
          fix="На поздних частях только проверять: if replay_drop(desync) then return VERDICT_DROP end; устанавливать флаг — лишь после успешной отправки.">
          Флаг ставит тот, кто успешно отправил всё сообщение. Ставить его «на всякий случай» — терять данные.
        </Bug>
        <Bug level="crit" title="seqovl == split_pos"
          breaks="Вторая часть получает offset 0 и всё сообщение целиком: сервер получает полный дубль с начала потока. В лучшем случае бесполезно, в худшем — ломает состояние у DPI и у сервера."
          fix="Условие отмены: if seqovl >= split_pos then seqovl = 0 end (как в стандартном multidisorder)." />
        <Bug level="crit" title="Fallback срабатывает на любом не-TLS пейлоаде"
          breaks="При --payload=tls_client_hello,http_req каждый http-запрос режется после первого байта («G» отдельно). Это не то, что задумано, и может ломать http."
          fix="Гейт по типу: if desync.l7payload == 'tls_client_hello' and not tls_record_complete(data)." />
        <Bug level="warn" title="Нет direction_check / payload_check"
          breaks="Аргументы :dir= и :payload= игнорируются — функция работает по своим правилам, а не по стандартным. Неожиданно при композиции с другими инстансами."
          fix="Добавить оба вызова после direction_cutoff_opposite." />
        <Bug level="warn" title="Приоритет reasm над блобом"
          breaks="Аргумент :blob= не действует для многопакетных сообщений — молча. Отладка таких «необъяснимых» случаев отнимает часы."
          fix="Порядок как в эталоне: blob_or_def(desync, arg.blob) or reasm_data or dis.payload." />
        <Bug level="info" title="cutoff на связанных icmp и DLOG без гейта"
          breaks="Отключение на icmp может преждевременно выключить инстанс; логи без b_debug жгут CPU на роутере."
          fix="if not desync.dis.icmp then instance_cutoff_shim(...) end; тяжёлые DLOG — под if b_debug." />
      </Sec>

      <Sec id="fix" n="6" title="Исправленная версия">
        <Code lines>{`-- random_split.lua (исправлено)
-- вызов: --payload=tls_client_hello
--        --lua-desync=outline_random_split:seqovl=5

local function tls_record_complete(data)
    if not data or #data < 5 then return false end
    if string.byte(data, 1) ~= 0x16 then return false end
    if string.byte(data, 2) ~= 0x03 then return false end
    local rlen = string.byte(data, 4) * 256 + string.byte(data, 5)
    return rlen > 0 and #data >= 5 + rlen
end

local function pick_split_pos(desync, data)
    local len = #data
    if len < 20 then return nil end
    local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
    if ok and r and r[1] and r[2] and r[1] >= 1 and r[2] >= r[1] and r[2] <= len then
        local sp = (r[2] > r[1]) and math.random(r[1], r[2] - 1) or r[1]
        if b_debug then
            DLOG("random_split: host " .. r[1] .. "-" .. r[2] .. " split=" .. sp .. "/" .. len)
        end
        return sp
    end
    local lo = math.max(1, math.floor(len * 0.25))
    local hi = math.max(lo, math.floor(len * 0.75))
    local sp = math.random(lo, hi)
    if b_debug then DLOG("random_split: fallback split=" .. sp .. "/" .. len) end
    return sp
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
        if b_debug then DLOG("random_split: incomplete hello len=" .. len .. ", split=1") end
        split_pos = 1
    else
        if len < 20 then return end
        split_pos = pick_split_pos(desync, data)
    end
    if not split_pos or split_pos < 1 or split_pos >= len then return end

    local seqovl = tonumber(desync.arg.seqovl) or 0
    if seqovl < 0 then seqovl = 0 end
    if seqovl >= split_pos then
        DLOG("random_split: seqovl " .. seqovl .. " >= split " .. split_pos .. " — отменён")
        seqovl = 0
    end

    local p1 = string.sub(data, 1, split_pos)
    local p2 = string.sub(data, split_pos + 1)
    local off2 = split_pos
    if seqovl > 0 then
        p2 = string.sub(data, split_pos - seqovl + 1, split_pos) .. p2
        off2 = split_pos - seqovl
    end

    if b_debug then
        DLOG("random_split: p1 len=" .. #p1 .. " p2 off=" .. off2 .. " len=" .. #p2)
    end
    if not rawsend_payload_segmented(desync, p1, 0) then return VERDICT_PASS end
    if not rawsend_payload_segmented(desync, p2, off2) then return VERDICT_PASS end

    replay_drop_set(desync)
    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP
end`}</Code>
        <p className="note">Что изменилось по существу: гейт по типу пейлоада, безопасный replay,
          отмена seqovl при равенстве, стандартные фильтры, приоритет блоба, гейты b_debug.
          Логика случайного реза внутри хоста сохранена полностью.</p>
      </Sec>

      <Sec id="test" n="7" title="Проверка">
        <Code>{`# аргументы и точка реза
--debug --lua-desync=argdebug --lua-desync=outline_random_split:seqovl=5

# граничные случаи, которые надо прогнать явно:
#  seqovl=0            — обычное разбиение
#  seqovl=split_pos    — должно отмениться с DLOG, не слать дубль
#  неполный ClientHello — split=1 только для tls_client_hello
#  http_req            — обычная ветка, не fallback

# в дампе: два сегмента, seq второго = seq первого + len(p1) - seqovl
--lua-init=@zapret-pcap.lua`}</Code>
      </Sec>

      <Sec id="how" n="8" title="Как писать функции сегментации">
        <ol className="check">
          <li>Источник данных — в эталонном порядке: блоб → reasm → payload.</li>
          <li>Точку реза всегда валидируй: <code>1 &lt;= pos &lt; len</code>, иначе части пусты.</li>
          <li>Сдвиг sequence второй части = число байтов первой минус перекрытие; это 0-based.</li>
          <li>Перекрытие отменяй, если оно <code>&gt;=</code> точки реза — иначе дубль с начала потока.</li>
          <li>Отправляй через <code>rawsend_payload_segmented</code>: MSS/MTU посчитает библиотека.</li>
          <li>Не удалось отправить — верни PASS и не ставь флаг дропа: пусть оригинал дойдёт.</li>
          <li>Успех → <code>replay_drop_set</code> → DROP (или PASS при nodrop).</li>
          <li>Ветку «неполный hello» гейти по <code>l7payload</code>, иначе она поймает чужие протоколы.</li>
        </ol>
        <p>Эталон для сравнения: <a href="#/antidpi">multisplit, multidisorder, hostfakesplit</a>.</p>
      </Sec>
    </Deep>
  );
}