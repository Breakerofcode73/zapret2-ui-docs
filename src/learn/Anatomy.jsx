import Code from "../components/Code";
import { Deep, Sec, Api, Wire } from "../components/Deep";

export default function Anatomy() {
  return (
    <Deep
      title="Как читать и писать любую функцию"
      lead="Универсальный метод разбора, полный синтаксис Lua в применении к zapret2 и шаблон, по которому документируется каждая следующая функция."
      tags={["метод", "синтаксис", "шаблон"]}
      toc={[["method", "1. Метод"], ["skeleton", "2. Каркас"], ["syntax", "3. Синтаксис"],
        ["rules", "4. Правила zapret2"], ["discover", "5. Как узнать неизвестное"], ["tpl", "6. Шаблон разбора"]]}
    >
      <Sec id="method" n="1" title="Метод: пять вопросов к любой функции">
        <p>Любая desync-функция читается одинаково. Ищи в ней пять блоков — и она перестаёт быть непонятной:</p>
        <table className="kv"><tbody>
          <tr><td>1. Охранники (guards)</td><td>что функция отказывается обрабатывать: транспорт, направление, тип пейлоада, пустоту, replay</td></tr>
          <tr><td>2. Источник данных</td><td>откуда берутся байты: dis.payload, reasm_data, блоб из аргумента</td></tr>
          <tr><td>3. Действие</td><td>что делается: модификация полей, разбиение, генерация копии, отправка</td></tr>
          <tr><td>4. Вердикт</td><td>что возвращается и что это значит для оригинального пакета</td></tr>
          <tr><td>5. Уборка</td><td>cutoff, replay_drop_set, таймеры — что изменится для следующих пакетов</td></tr>
        </tbody></table>
        <p>Если блок отсутствует — это дефект, а не «так задумано». Именно так найдены ошибки в обоих твоих файлах.</p>
      </Sec>

      <Sec id="skeleton" n="2" title="Каркас, который есть у всех эталонных функций">
        <Code lines>{`function my_func(ctx, desync)
    -- 1. ОХРАННИКИ
    if not desync.dis.tcp then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return end
    if not payload_check(desync) then return end

    -- 2. ИСТОЧНИК ДАННЫХ
    local data = blob_or_def(desync, desync.arg.blob) or desync.reasm_data or desync.dis.payload
    if not data or #data == 0 then return end

    -- 3. REPLAY
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return
    end

    -- 4. ДЕЙСТВИЕ
    local n = tonumber(desync.arg.n) or 1
    local dis = deepcopy(desync.dis)
    -- ... изменения ...
    if not rawsend_dissect_ipfrag(dis, desync_opts(desync)) then
        return VERDICT_PASS
    end

    -- 5. УБОРКА И ВЕРДИКТ
    replay_drop_set(desync)
    instance_cutoff_shim(ctx, desync)
    return VERDICT_DROP
end`}</Code>
      </Sec>

      <Sec id="syntax" n="3" title="Синтаксис Lua: всё, что встречается в этих файлах">
        <table className="kv"><tbody>
          <tr><td>function f() / local function f()</td><td>глобальная (видна из --lua-desync) / файловая (внутренний хелпер, инстансом не вызвать)</td></tr>
          <tr><td>local x</td><td>локальная переменная; без local — глобальная, живёт между пакетами и видна всем инстансам</td></tr>
          <tr><td>nil / false</td><td>единственные «ложные» значения. 0, "" и {} — ИСТИННЫ. Поэтому desync.arg.flag проверяют по наличию</td></tr>
          <tr><td>a and b or c</td><td>тернарник. Работает, пока b не nil/false. Безопасен даже если b == 0</td></tr>
          <tr><td>a or b</td><td>значение по умолчанию: b, если a nil/false</td></tr>
          <tr><td>~= == &lt;= &gt;=</td><td>не равно / равно / сравнения. ~= это не !=</td></tr>
          <tr><td>#s</td><td>длина строки-blob в байтах</td></tr>
          <tr><td>a .. b</td><td>конкатенация blob. Числа приводятся к строке автоматически</td></tr>
          <tr><td>string.sub(s, a, b)</td><td>подстрока, 1-based, включительно; без b — до конца; отрицательные — от конца</td></tr>
          <tr><td>string.byte(s, i, j)</td><td>коды байтов, несколько возвращаемых значений</td></tr>
          <tr><td>string.rep(s, n)</td><td>повторение; для бинарных узоров удобнее pattern() из zapret-lib</td></tr>
          <tr><td>tonumber(x) / tostring(x)</td><td>строка→число / число→строка. Аргументы инстанса ВСЕГДА строки</td></tr>
          <tr><td>math.random(m, n)</td><td>целое в [m,n]; требует m&lt;=n; большие диапазоны непортируемы → u32(brandom(4))</td></tr>
          <tr><td>math.floor / math.max</td><td>округление вниз / максимум</td></tr>
          <tr><td>pcall(f, ...)</td><td>защищённый вызов: ok, result. Ловит error() внутри C-хелперов</td></tr>
          <tr><td>error("текст")</td><td>аварийный останов инстанса: «desync ERR» в логе, пакет проходит без изменений</td></tr>
          <tr><td>t.a.b</td><td>доступ к вложенным таблицам; обращение к полю nil-таблицы — ошибка</td></tr>
          <tr><td>-- / --[[ ... ]]</td><td>строчный / блочный комментарий</td></tr>
          <tr><td>return несколько</td><td>Lua возвращает список значений: local ok, r = pcall(...)</td></tr>
        </tbody></table>
      </Sec>

      <Sec id="rules" n="4" title="Правила, специфичные для zapret2">
        <Api name="Стадии изменений" from="архитектура" sig="поля dis → apply_fooling → apply_ip_id → opts.reconstruct → opts.ipfrag → opts.rawsend">
          Каждую модификацию кладётся в свою стадию. <code>reconstruct</code> знает только <code>badsum</code>;
          ttl/seq/ts/md5 — это fooling; ip_id — отдельная стадия; адрес — прямое поле диссекта.
        </Api>
        <Api name="Индексы" from="соглашение" sig="Lua и resolve_* : 1-based   |   сеть и uX/rawsend offsets : 0-based">
          Точка реза из resolve_pos — 1-based. Сдвиг sequence в rawsend_payload_segmented — 0-based.
          Путаница здесь даёт сдвиг на единицу по всему потоку.
        </Api>
        <Api name="Арифметика seq" from="C API" sig="dis.tcp.th_seq = u32add(dis.tcp.th_seq, -1)">
          Только u32add: сложение по модулю 2^32. Обычное вычитание уйдёт в отрицательные и сломает пакет.
        </Api>
        <Api name="Вердикты" from="C константы" sig="VERDICT_PASS | VERDICT_MODIFY | VERDICT_DROP | nil (= PASS)">
          Агрегация по цепочке: MODIFY замещает PASS, DROP замещает оба. Никогда не пиши числа вместо констант.
        </Api>
      </Sec>

      <Sec id="discover" n="5" title="Как узнать то, чего нет в документации">
        <Wire>{`имена полей диссекта   → --lua-desync=pktdebug      (печатает всю таблицу desync)
аргументы инстанса     → --lua-desync=argdebug
позиции потока         → --lua-desync=posdebug
сигнатура C-функции    → исходник luacall_ИМЯ в nfq2/lua.c
семантика аргументов   → docs/manual.md, раздел «C функции»
что ушло в провод      → zapret-pcap.lua + wireshark
быстрая проба кода     → --lua-desync=luaexec:code=...`}</Wire>
        <p>Правило: если сигнатура или имя поля не проверены — не угадывай в коде. Сначала дамп, потом строка.</p>
      </Sec>

      <Sec id="tpl" n="6" title="Шаблон полного разбора для новой функции">
        <p>Каждая функция документируется восемью блоками. Скопируй файл разбора, замени содержимое — и добавь строку в <code>PAGES</code>:</p>
        <Code lines>{`// src/pages/DiveMyFunc.jsx
import Code from "../components/Code";
import { Deep, Sec, Lines, Bug, Api, Wire } from "../components/Deep";

export default function DiveMyFunc() {
  return (
    <Deep title="Разбор: my_func" lead="Одно предложение о сути."
      tags={["desync", "класс задачи"]}
      toc={[["idea","1. Замысел"],["wire","2. Механизм"],["api","3. API"],
            ["lines","4. Построчно"],["bugs","5. Ошибки"],["fix","6. Исправлено"],
            ["test","7. Проверка"],["how","8. Как писать"]]}>

      <Sec id="idea"  n="1" title="Замысел">Какую уязвимость DPI атакуем и почему это должно работать.</Sec>
      <Sec id="wire"  n="2" title="Механизм"><Wire>{\`пакеты до и после, с seq и смещениями\`}</Wire></Sec>
      <Sec id="api"   n="3" title="API"><Api name="..." from="..." sig="..." ret="...">описание</Api></Sec>
      <Sec id="lines" n="4" title="Построчно"><Lines items={[["строка кода", "что делает"]]}/></Sec>
      <Sec id="bugs"  n="5" title="Ошибки"><Bug level="crit" title="..." breaks="..." fix="..."/></Sec>
      <Sec id="fix"   n="6" title="Исправлено"><Code lines>{\`полный рабочий код\`}</Code></Sec>
      <Sec id="test"  n="7" title="Проверка"><Code>{\`команды и критерии успеха\`}</Code></Sec>
      <Sec id="how"   n="8" title="Как писать"><ol className="check"><li>правило</li></ol></Sec>
    </Deep>
  );
}`}</Code>
        <p>Порядок работы с незнакомой функцией: прогони пять вопросов → выпиши каждый вызов в блок API →
          разбери построчно → отметь отсутствующие блоки каркаса как дефекты → напиши исправленную версию →
          сформулируй критерий проверки в дампе.</p>
      </Sec>
    </Deep>
  );
}