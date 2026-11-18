import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { MARKERS, RULES, parseMarkerList } from "../data/markers";
import "../styles/extra.css";

const CERT = { verified: "подтверждён исходниками", config: "из рабочего конфига", manual: "по мануалу" };

export default function Markers() {
  const [q, setQ] = useState("");
  const [list, setList] = useState("1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1");
  const parsed = useMemo(() => parseMarkerList(list), [list]);
  const s = q.trim().toLowerCase();
  const rows = MARKERS.filter(m => !s || (m.name + m.meaning + m.proto + m.ex).toLowerCase().includes(s));

  return (
    <Page title="Маркеры позиций" desc="Символьные позиции вместо ручного счёта байтов. Полный список с пометкой, чем каждый подтверждён, и живой разбор строки pos=.">
      <div className="stats">
        <span><b>{MARKERS.length}</b> маркеров и форм</span>
        <span><b>{MARKERS.filter(m => m.certainty === "verified").length}</b> подтверждены исходниками</span>
        <span><b>{MARKERS.filter(m => m.certainty === "config").length}</b> из твоего конфига</span>
      </div>

      <div className="mk-parse">
        <div className="mk-h">Разбор строки маркеров</div>
        <input className="search" value={list} onChange={e => setList(e.target.value)} placeholder="pos=1,sniext+1,host+1,midsld-2…" />
        <div className="mk-chips">
          {parsed.map((p, i) => (
            <span key={i} className={"mk-chip" + (p.bad ? " bad" : p.known ? "" : " unknown")}>
              <b>{p.base}</b>
              {p.delta !== 0 && <i>{p.delta > 0 ? "+" + p.delta : p.delta}</i>}
              <em>{p.bad ? "не разобрано" : p.numeric ? "число" : p.known ? "маркер" : "неизвестен"}</em>
            </span>
          ))}
        </div>
        <p className="note">Числа и арифметика ±N работают всегда. Неизвестное имя вернёт nil из resolve_pos — функция должна обработать эту ветку, а не падать.</p>
      </div>

      <input className="search" placeholder="Поиск по маркерам…" value={q} onChange={e => setQ(e.target.value)} />
      <table className="mk-tbl">
        <thead><tr><th>маркер</th><th>протоколы</th><th>смысл</th><th>чем подтверждён</th><th>пример</th></tr></thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.name}>
              <td><code>{m.name}</code></td>
              <td>{m.proto}</td>
              <td>{m.meaning}</td>
              <td><span className={"mk-cert " + m.certainty}>{CERT[m.certainty]}</span></td>
              <td><code>{m.ex}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="note">Ничего не найдено.</p>}

      <h2>Правила работы с позициями</h2>
      <table className="kv"><tbody>{RULES.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>

      <h2>Разрешение маркеров в коде</h2>
      <Code label="один маркер, список и диапазон">{`-- одна точка
local p = resolve_pos(data, desync.l7payload, desync.arg.pos or "host")
if not p then return end

-- список точек реза
local pos = resolve_multi_pos(data, desync.l7payload, "1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1")
delete_pos_1(pos)
if #pos == 0 then return end

-- диапазон имени хоста, защищённо
local ok, r = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)
if ok and r and r[1] >= 1 and r[2] <= #data then
    local host = string.sub(data, r[1], r[2])
    if b_debug then DLOG("host=" .. host .. " at " .. (r[1] - 1)) end
end`}</Code>

      <h2>Как проверить неизвестный маркер</h2>
      <Code>{`--lua-desync=posdebug
--lua-desync=luaexec:code=DLOG(tostring(resolve_pos(desync.dis.payload,desync.l7payload,"sniext")))
# nil → маркер не поддерживается этой версией или пейлоад не того типа`}</Code>
      <p className="note">Список маркеров зависит от версии движка. После обновления прогони эту проверку заново — маркер может появиться или исчезнуть.</p>
    </Page>
  );
}