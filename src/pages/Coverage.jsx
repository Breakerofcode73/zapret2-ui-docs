import { useMemo, useState } from "react";
import Page from "../components/Page";
import { fns as capi } from "./CApi";
import { fns as antidpi } from "./Antidpi";
import { fns as lib } from "./Lib";
import { fns as auto } from "./Auto";
import { DEEP, coveredNames, byId } from "../data/deep";

const SOURCES = [
  ["zapret-antidpi.lua", "antidpi", antidpi],
  ["zapret-lib.lua", "lib", lib],
  ["C API nfqws2", "capi", capi],
  ["zapret-auto.lua", "auto", auto]
];

export default function Coverage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("all");
  const all = useMemo(() => SOURCES.flatMap(([src, page, list]) =>
    list.map(f => ({ ...f, src, page, done: coveredNames.has(f.name) }))), []);
  const done = all.filter(f => f.done).length;
  const pct = Math.round(done / all.length * 100);
  const s = q.trim().toLowerCase();
  const view = all.filter(f =>
    (mode === "all" || (mode === "done" ? f.done : !f.done)) &&
    (!s || (f.name + " " + (f.ru || "")).toLowerCase().includes(s)));

  return (
    <Page title="Карта покрытия" desc="Полный разбор есть у каждой отмеченной функции. Остальные ждут своей очереди — список живой и ищется.">
      <div className="stats">
        <span><b>{DEEP.length}</b> полных разборов</span>
        <span><b>{done}</b> функций покрыто</span>
        <span><b>{all.length}</b> функций всего</span>
        <span><b>{pct}%</b> готово</span>
      </div>
      <div className="cov-bar">
        <div className="cov-meter"><i style={{ width: pct + "%" }} /></div>
        <span className="cov-num"><b>{done}</b> / {all.length}</span>
      </div>
      <div className="cov-bar">
        <input className="search" style={{ maxWidth: 320, marginBottom: 0 }} placeholder="Фильтр по имени или описанию…"
          value={q} onChange={e => setQ(e.target.value)} />
        <div className="filters" style={{ margin: 0 }}>
          {[["all", "все"], ["done", "с разбором"], ["todo", "без разбора"]].map(([k, l]) => (
            <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
              {l} ({k === "all" ? all.length : k === "done" ? done : all.length - done})
            </button>
          ))}
        </div>
      </div>
      {SOURCES.map(([src, page]) => {
        const rows = view.filter(f => f.page === page);
        if (!rows.length) return null;
        return (
          <div key={src}>
            <h2>{src} <span className="count">{rows.filter(r => r.done).length} / {all.filter(f => f.page === page).length}</span></h2>
            <div className="cov-list">
              {rows.map(f => (
                <a key={f.name} className={"cov-item " + (f.done ? "done" : "todo")}
                  href={f.done && byId[f.name] ? "#/deep/" + f.name : "#/" + f.page}>
                  <span className="cov-dot" />{f.name}
                </a>
              ))}
            </div>
          </div>
        );
      })}
      {view.length === 0 && <p className="note">Ничего не совпало с фильтром.</p>}
    </Page>
  );
}