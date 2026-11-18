import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { C_FUNCS, C_GROUPS } from "../data/capi";
import "../styles/capi.css";

export const fns = C_FUNCS.map(f => ({ name: f.name, ru: f.mech, kind: "c", group: f.group }));

function Card({ f, open, onToggle }) {
  return (
    <article className={"ca" + (open ? " open" : "")} id={"fn-" + f.name}>
      <button className="ca-head" onClick={onToggle}>
        <code className="ca-name">{f.name}</code>
        <span className="ca-sig">{f.sig}</span>
        {!f.v && <span className="ca-unv" title="Сигнатуру сверь в исходнике">сверить</span>}
        <span className="ca-chev">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="ca-body">
          <p className="ca-mech">{f.mech}</p>
          <Code copy={false}>{f.sig}</Code>
          {f.args.length > 0 && (
            <table className="ca-args"><thead><tr><th>аргумент</th><th>тип</th><th>смысл</th></tr></thead>
              <tbody>{f.args.map(([n, t, d], i) => <tr key={i}><td><code>{n}</code></td><td>{t}</td><td>{d}</td></tr>)}</tbody></table>
          )}
          <p className="ca-ret"><b>Возвращает:</b> {f.ret}</p>
          <Code label="пример">{f.ex}</Code>
          {f.pit.length > 0 && (
            <div className="ca-pit">
              <div className="ca-pit-h">Подводные камни</div>
              <ul>{f.pit.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {f.rel.length > 0 && (
            <div className="ca-rel">Связанные: {f.rel.map((r, i) => (
              <span key={r}>{i > 0 && ", "}<a href={"#fn-" + r} onClick={e => { e.preventDefault(); document.getElementById("fn-" + r)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{r}</a></span>
            ))}</div>
          )}
        </div>
      )}
    </article>
  );
}

export default function CApi() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("все");
  const [openAll, setOpenAll] = useState(false);
  const [open, setOpen] = useState({});

  const s = q.trim().toLowerCase();
  const view = useMemo(() => C_FUNCS.filter(f =>
    (group === "все" || f.group === group) &&
    (!s || (f.name + " " + f.sig + " " + f.mech + " " + f.pit.join(" ")).toLowerCase().includes(s))), [s, group]);

  const isOpen = f => openAll || !!open[f.name] || (s.length >= 2 && view.length <= 12);

  return (
    <Page title="C API nfqws2 → Lua" desc="Каждая функция с сигнатурой, аргументами, механизмом, примером и подводными камнями. Раскрой карточку или включи «развернуть всё».">
      <div className="stats">
        <span><b>{C_FUNCS.length}</b> функций</span>
        <span><b>{C_GROUPS.length}</b> групп</span>
        <span><b>{C_FUNCS.filter(f => f.v).length}</b> с подтверждённой сигнатурой</span>
      </div>
      <div className="ca-bar">
        <input className="search" style={{ maxWidth: 340, marginBottom: 0 }} placeholder="Поиск по имени, сигнатуре, описанию…"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className={"ca-toggle" + (openAll ? " on" : "")} onClick={() => { setOpenAll(v => !v); setOpen({}); }}>
          {openAll ? "свернуть всё" : "развернуть всё"}
        </button>
        <span className="ca-count">{view.length} показано</span>
      </div>
      <div className="chips ca-groups">
        <button className={"chip" + (group === "все" ? " on" : "")} onClick={() => setGroup("все")}>все</button>
        {C_GROUPS.map(g => (
          <button key={g} className={"chip" + (group === g ? " on" : "")} onClick={() => setGroup(g)}>
            {g} <i>{C_FUNCS.filter(f => f.group === g).length}</i>
          </button>
        ))}
      </div>
      {C_GROUPS.map(g => {
        const rows = view.filter(f => f.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="ca-group">
            <h2>{g} <span className="count">{rows.length}</span></h2>
            {rows.map(f => <Card key={f.name} f={f} open={isOpen(f)} onToggle={() => setOpen(o => ({ ...o, [f.name]: !o[f.name] }))} />)}
          </section>
        );
      })}
      {view.length === 0 && <p className="note">Ничего не найдено. Сбрось фильтр группы или запрос.</p>}
    </Page>
  );
}