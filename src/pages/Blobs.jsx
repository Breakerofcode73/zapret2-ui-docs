import Page from "../components/Page";
import Code from "../components/Code";

export default function Blobs() {
  return (
    <Page title="Блобы и свои данные" desc="Бинарные данные для фейков: штатные, из файла, из своего lua-init и прямо из командной строки.">
      <h2>Что такое блоб</h2>
      <p>Блоб — Lua-строка с бинарными данными любой длины. Вместо зашитых в C фейков zapret2 хранит их как блобы и разрешает по имени в рантайме.</p>
      <Code>{`--blob=myfake:0x1603030000deadbeef     # hex прямо в параметре
--blob=myfake:@files/fake/tls.bin      # из файла
--blob=myfake:+10@files/fake/tls.bin   # из файла со смещением +10`}</Code>
      <p>В аргументе <code>blob=</code> можно указать <b>0xHEX</b>, <b>имя поля desync</b> или <b>имя глобальной переменной</b>. Разрешает это хелпер <code>blob(desync, name)</code> в таком порядке.</p>

      <h2>Штатные блобы</h2>
      <p>Создаются автоматически: <code>fake_default_tls</code>, <code>fake_default_http</code>, фейк для quic. Полный список — мануал «Стандартные блобы».</p>

      <h2>Свои блобы: файл blobs.lua</h2>
      <p>В рабочем конфиге первым подключается <code>blobs.lua</code> — он определяет <code>stun2</code> и <code>quic_google</code>, которые потом используются в <code>--lua-desync=fake:blob=stun2</code>. Это обычный Lua-файл с глобальными переменными.</p>
      <Code label="lua/blobs.lua">{`-- свои блобы: глобальные переменные, видимые всем инстансам
stun2 = parse_hex("0x000100002112a442") .. brandom(16)
quic_google = parse_hex("0xc00000000108") .. brandom(64)

-- узор-заполнитель можно собрать и без parse_hex
zero256 = string.rep(string.char(0), 256)`}</Code>
      <p className="note">blobs.lua идёт до zapret-lib — это безопасно, пока он только определяет данные и не вызывает хелперы библиотеки. Если нужны <code>pattern()</code>, <code>blob()</code> и прочие — подключай после lib.</p>

      <h2>Inline-код в --lua-init</h2>
      <p>Значение <code>--lua-init</code> без <code>@</code> — это Lua-код строкой, выполняется один раз при старте. Удобно для констант, ради которых не хочется заводить файл.</p>
      <Code>{`--lua-init="zero256=string.rep(string.char(0),256)" ^
--lua-desync=udplen:increment=8:pattern=zero256`}</Code>

      <h2>Порядок подключения</h2>
      <Code label="рабочий порядок из tests.txt">{`--lua-init=@"%~dp0lua\\blobs.lua"                 # данные
--lua-init=@"%~dp0lua\\zapret-lib.lua"            # хелперы
--lua-init=@"%~dp0lua\\zapret-antidpi.lua"        # штатные стратегии
--lua-init=@"%~dp0lua\\random_split.lua"          # свои функции
--lua-init=@"%~dp0lua\\fake_ip_misdirection.lua"
--lua-init="zero256=string.rep(string.char(0),256)"`}</Code>
      <p>Свои desync-функции обязаны идти <b>после</b> lib и antidpi: иначе они не найдут хелперы, а одноимённые штатные функции перезапишут их. Проверка конфигов ловит это правилом B033.</p>

      <h2>Динамические блобы между инстансами</h2>
      <Code>{`--lua-desync=tls_client_hello_clone:blob=hello:sni_first=example.com:fallback=fake_default_tls
--lua-desync=fake:blob=hello:ip_ttl=6:optional`}</Code>
      <p>Первый инстанс кладёт модифицированный ClientHello в <code>desync.hello</code>, второй использует его как блоб. Живёт только в цепочке текущего пакета.</p>

      <h2>Узор и перекрытие</h2>
      <Code>{`--lua-desync=multisplit:pos=1,host,midsld+1:seqovl=5:seqovl_pattern=0x1603030000
--lua-desync=udplen:increment=8:pattern=0x0F0F0E0F`}</Code>
      <p><code>pattern</code> и <code>seqovl_pattern</code> принимают те же блобы. Хелпер <code>pattern(pat, offset, len)</code> повторяет узор до нужной длины.</p>

      <h2>Маркеры</h2>
      <p>Позиции реза задаются символьно — полный справочник вынесен на страницу <a href="#/markers">Маркеры позиций</a>, включая <code>sniext</code> из твоего конфига.</p>
    </Page>
  );
}