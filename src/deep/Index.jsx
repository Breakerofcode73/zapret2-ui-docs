import { useState } from "react";
import Page from "../components/Page";
import { DEEP, DEEP_GROUPS, byId } from "../data/deep";

export default function DeepIndex() {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const match = e => !s || (e.id + " " + e.title + " " + e.lead).toLowerCase().includes(s);
  const total = DEEP.filter(match).length;
  return (
    <Page title="Полные разборы" desc="Каждая функция: замысел, контракт, механизм на проводе, каждый вызов, построчный исследователь, синтаксис, ошибки, рабочий код, проверка, правила.">
      <div className="stats">
        <span><b>{DEEP.length}</b> разборов готово</span>
        <span><b>10</b> секций в каждом</span>
        <span><b>25/25</b> desync-стратегий</span>
      </div>
      <input className="search" style={{ maxWidth: 360 }} placeholder="Поиск по разборам…"
        value={q} onChange={e => setQ(e.target.value)} />
      {Object.entries(DEEP_GROUPS).map(([group, ids]) => {
        const rows = ids.map(id => byId[id]).filter(e => e && match(e));
        if (!rows.length) return null;
        return (
          <div key={group}>
            <h2>{group} <span className="count">{rows.length}</span></h2>
            <div className="deep-cards">
              {rows.map(e => (
                <a key={e.id} className="deep-card" href={"#/deep/" + e.id}>
                  <span className={"tag " + (e.kind === "custom" ? "iff" : e.kind)}>{e.kind}</span>
                  <b>{e.id}</b>
                  <span>{e.lead}</span>
                </a>
              ))}
            </div>
          </div>
        );
      })}
      {total === 0 && <p className="note">Ни один разбор не совпал с запросом.</p>}
    </Page>
  );
}