import Page from "../components/Page";
import Code from "../components/Code";

export default function Writing() {
  return (
    <Page title="Пишем свою функцию" desc="Файл → подключение → вызов. Рабочий шаблон с построчным смыслом.">
      <h2>1. Файл и подключение</h2>
      <p><code>my.lua</code> рядом с библиотеками, подключать <b>после</b> них — код выполняется один раз при старте, по порядку:</p>
      <Code>{`--lua-init=@zapret-lib.lua --lua-init=@zapret-antidpi.lua --lua-init=@my.lua`}</Code>
      <p>Для мелочей файл не нужен: <code>--lua-init=MY_TTL=6</code>.</p>
      <h2>2. Шаблон: фейк с коротким TTL перед оригиналом</h2>
      <Code lines>{`-- my.lua
function my_fake(ctx, desync)
    if not desync.dis.tcp then return end          -- только TCP
    direction_cutoff_opposite(ctx, desync)         -- входящие не интересны
    if not direction_check(desync) then return end -- фильтр dir
    if not payload_check(desync) then return end   -- фильтр payload
    if not replay_first(desync) then return end    -- действуем 1 раз

    local ttl = tonumber(desync.arg.ttl) or 6      -- аргументы — строки!
    local fake = blob(desync, desync.arg.blob or "fake_default_tls")

    local dis = deepcopy(desync.dis)               -- меняем копию
    dis.payload = fake
    if dis.ip then dis.ip.ip_ttl = ttl             -- ipv4 ≠ ipv6
    elseif dis.ip6 then dis.ip6.ip6_hlim = ttl end

    if rawsend_dissect_segmented(desync, dis) then -- авто-сегментация
        DLOG("my_fake: sent, ttl=" .. ttl)
    end
    return VERDICT_PASS                            -- оригинал как есть
end`}</Code>
      <h2>3. Вызов</h2>
      <Code>{`--filter-tcp=443 --filter-l7=tls
--payload=tls_client_hello --lua-desync=my_fake:blob=fake_default_tls:ttl=6`}</Code>
      <p>Синтаксис: <code>--lua-desync=имя:арг=знач:флаг</code>. Флаг проверяется по наличию. Префиксы <code>%</code>, <code>#</code>, <code>\</code> — ссылки на переменные/блобы.</p>
      <h2>Эксперимент без файла</h2>
      <Code>{`--lua-desync=luaexec:code=DLOG("payload="..desync.l7payload)`}</Code>
      <h2>Своё iff-условие</h2>
      <Code>{`function cond_long_payload(desync)
    return #desync.dis.payload > 100
end
--lua-desync=condition:iff=cond_long_payload --lua-desync=multisplit:pos=2`}</Code>
      <h2>Свой таймер</h2>
      <Code>{`timer_set(desync_timer_name(desync), "my_timer_cb", 100, true, {dis = deepcopy(desync.dis)})
function my_timer_cb(name, data)
    rawsend_dissect_ipfrag(data.dis, {})
end`}</Code>
      <h2>Правила</h2>
      <ul>
        <li>Не переопределяй стандартные функции — префикс <code>my_*</code>.</li>
        <li>Состояние потока — в <code>track.lua_state[func_instance.."_key"]</code>.</li>
        <li>Биты — через bitand/bitor/bitxor; seq/ack — только u32add.</li>
        <li>Свой код — отдельным файлом: легко поделиться, не патча библиотеки.</li>
      </ul>
    </Page>
  );
}