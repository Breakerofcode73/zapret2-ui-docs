import Page from "../components/Page";
import Code from "../components/Code";

export default function Debugging() {
  return (
    <Page title="Отладка" desc="От первого лога до автоматического перебора стратегий.">
      <h2>Debug-лог</h2>
      <p>Запуск с <code>--debug</code>; в Lua — <code>DLOG</code>, ошибки — <code>DLOG_ERR</code>; дорогое — под <code>if b_debug then</code>.</p>
      <h2>Что приходит в функцию</h2>
      <Code>{`--lua-desync=pktdebug     # вся таблица desync
--lua-desync=argdebug     # аргументы инстанса
--lua-desync=posdebug     # позиции conntrack
--lua-desync=luaexec:code=var_debug(desync.track)`}</Code>
      <h2>«desync ERR»</h2>
      <p>Инстанс упал через error() или синтаксис Lua. Пакет проходит без изменений; текст ошибки рядом в логе.</p>
      <h2>Метод маленьких шагов</h2>
      <p>Начни с pass/argdebug, добавляй инстансы по одному, проверяй лог и curl.</p>
      <h2>blockcheck2</h2>
      <Code>{`BATCH=1 DOMAINS=bbc.com CURL_CMD=1 SKIP_DNSCHECK=1 ./blockcheck2.sh
# уровни: standard / quick / veryquick / force
./blockcheck2.sh | tee /tmp/blockcheck2.log`}</Code>
      <h2>Дампы</h2>
      <p><code>zapret-pcap.lua</code> пишет .cap — открой в wireshark и сравни провод с замыслом функции.</p>
    </Page>
  );
}