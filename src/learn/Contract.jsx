import Page from "../components/Page";
import Code from "../components/Code";

export default function Contract() {
  return (
    <Page title="Контракт desync-функции" desc="Что получает функция, что она может менять и что обязана вернуть.">
      <Code copy={false}>{`function my_func(ctx, desync)
    -- работа с пакетом
    return VERDICT_PASS   -- или MODIFY / DROP / nil (= PASS)
end`}</Code>
      <p>Вызывается на каждый пакет, прошедший фильтры. Все инстансы пакета получают <b>одну и ту же таблицу desync</b> — так данные идут по цепочке.</p>
      <h2>Поля desync</h2>
      <table className="tbl"><tbody>
        <tr><td><code>dis</code></td><td>диссект: dis.ip / dis.ip6 / dis.tcp / dis.udp / dis.icmp / dis.payload</td></tr>
        <tr><td><code>arg</code></td><td>аргументы инстанса. ВСЕ значения — строки</td></tr>
        <tr><td><code>l7payload</code></td><td>"tls_client_hello", "http_req", "dht", "unknown"…</td></tr>
        <tr><td><code>outgoing</code></td><td>true для исходящих</td></tr>
        <tr><td><code>reasm_data / reasm_offset</code></td><td>собранный многопакетный пейлоад и смещение части</td></tr>
        <tr><td><code>replay / replay_piece_last</code></td><td>перепроигрывание задержанных частей</td></tr>
        <tr><td><code>track</code></td><td>запись conntrack (может отсутствовать!)</td></tr>
        <tr><td><code>track.lua_state</code></td><td>ваше состояние потока между пакетами</td></tr>
        <tr><td><code>track.pos</code></td><td>позиции n,d,b,s,p + dt (см. posdebug)</td></tr>
        <tr><td><code>func_instance</code></td><td>уникальный id инстанса — ключ для lua_state и таймеров</td></tr>
        <tr><td><code>&lt;ваше поле&gt;</code></td><td>динамические блобы для следующих инстансов</td></tr>
      </tbody></table>
      <p><b>ctx</b> — контекст C для instance_cutoff, lua_cutoff, execution_plan, execution_plan_cancel, raw_packet, conntrack_feed.</p>
      <h2>Вердикты</h2>
      <ul>
        <li><code>VERDICT_PASS</code> — не трогать диссект (nil тоже PASS).</li>
        <li><code>VERDICT_MODIFY</code> — отправить изменённый desync.dis в конце цепочки.</li>
        <li><code>VERDICT_DROP</code> — дропнуть.</li>
      </ul>
      <h2>Replay</h2>
      <Code copy={false}>{`if replay_first(desync) then
    if rawsend_payload_segmented(desync, desync.reasm_data) then
        replay_drop_set(desync)   -- последующие части дропать
        return VERDICT_DROP
    end
else
    if replay_drop(desync) then return VERDICT_DROP end
end`}</Code>
      <h2>Cutoff</h2>
      <Code copy={false}>{`instance_cutoff_shim(ctx, desync)          -- миссия выполнена
-- но НЕ на связанных icmp:
if not desync.dis.tcp then
    if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
    return
end`}</Code>
    </Page>
  );
}