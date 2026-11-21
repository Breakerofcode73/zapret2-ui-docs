import Page from "../components/Page";
import Code from "../components/Code";
import { fns as capi } from "../ref/CApi";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as lib } from "../ref/Lib";
import { fns as auto } from "../ref/Auto";

export default function Overview() {
  return (
    <Page title="zapret2 — как это работает" desc="Автономный пакетный манипулятор для обхода DPI. Стратегии живут не в C, а в Lua.">
      <div className="stats">
        <span><b>{capi.length}</b> C-функций для Lua</span>
        <span><b>{antidpi.filter(f => f.kind === "desync").length}</b> desync-стратегий</span>
        <span><b>{lib.length}</b> хелперов zapret-lib</span>
        <span><b>{auto.length}</b> функций оркестрации</span>
      </div>
      <h2>Путь пакета</h2>
      <Code copy={false}>{`ядро ОС (nftables/iptables NFQUEUE · ipfw · pf · WinDivert)
   ↓  только нужные пакеты — фильтр в ядре экономит CPU
nfqws2 (C):
   1. диссекция     → ip/ip6, tcp/udp/icmp, payload
   2. conntrack     → запись потока, позиции, направления
   3. сигнатуры     → тип пейлоада (tls_client_hello, http_req, dht, unknown…)
   4. reasm/decrypt → сборка многопакетных сообщений
   5. профиль       → первый совпавший, кэшируется в conntrack
   ↓
цепочка Lua-инстансов (--lua-desync, строго по порядку)
   function f(ctx, desync) → PASS / MODIFY / DROP
   ↓
агрегация: MODIFY > PASS, DROP > всё
   ↓
отправить / отправить изменённый / дропнуть`}</Code>
      <h2>Ключевые понятия</h2>
      <ul>
        <li><b>Профиль</b> — фильтры (порты, ipset, хостлисты, L7) + цепочка инстансов.</li>
        <li><b>Инстанс</b> — вызов функции с аргументами: <code>--lua-desync=fake:blob=…</code>. Одна функция может вызываться много раз.</li>
        <li><b>Внутрипрофильные фильтры</b> — <code>--payload</code>, <code>--in-range</code>, <code>--out-range</code>; действуют на все последующие инстансы до переопределения.</li>
        <li><b>Cutoff</b> — инстанс или вся Lua-обработка отключается для потока, когда больше не нужна.</li>
        <li><b>Оркестратор</b> — инстанс, забирающий execution plan и сам решающий, что вызывать дальше.</li>
      </ul>
      <h2>Компоненты</h2>
      <table className="tbl"><tbody>
        <tr><td>nfq2/</td><td>C: перехват, фильтры, conntrack, диссекция, Lua-мост (lua.c)</td></tr>
        <tr><td>zapret-lib.lua</td><td>хелперы: блобы, отсылка, сегментация, fooling, позиции</td></tr>
        <tr><td>zapret-antidpi.lua</td><td>готовые desync-функции</td></tr>
        <tr><td>zapret-auto.lua</td><td>оркестрация и детекторы удач/неудач</td></tr>
        <tr><td>zapret-obfs.lua / zapret-pcap.lua</td><td>обфускация / запись .cap дампов</td></tr>
        <tr><td>mdig, ip2net</td><td>ресолвер листов, группировка IP в подсети</td></tr>
        <tr><td>blockcheck2.sh</td><td>автоподбор стратегий</td></tr>
      </tbody></table>
      <h2>Минимальный запуск</h2>
      <Code>{`nfqws2 --qnum=200 --debug --lua-init=@zapret-lib.lua --lua-init=@zapret-antidpi.lua \\
  --filter-tcp=80,443 --filter-l7=tls,http \\
  --payload=tls_client_hello --lua-desync=fake:blob=fake_default_tls:tcp_md5:tls_mod=rnd,rndsni,dupsid \\
  --payload=http_req --lua-desync=fake:blob=fake_default_http:tcp_md5 \\
  --payload=tls_client_hello,http_req --lua-desync=multisplit:pos=1:seqovl=5:seqovl_pattern=0x1603030000`}</Code>
      <p className="note">LuaJIT 2.1+ или PUC Lua 5.3+. Скрипты и бинарник — строго одного релиза (NFQWS2_COMPAT_VER).</p>
    </Page>
  );
}