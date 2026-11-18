import { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { loadVault, subscribe, rollback, labelVersion, dropVersion, replaceAll } from "../lib/vault";
import { docLua } from "../lib/luadoc";
import { diffLines, hunks } from "../lib/diff";
import { hueFor } from "../lib/intake";
import { getConfig } from "../lib/store";
import { bundle, save } from "../lib/pack";
import { fns as capi } from "./CApi";
import { fns as lib } from "./Lib";
import { fns as antidpi } from "./Antidpi";
import { fns as auto } from "./Auto";
import "../styles/extra.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const when = t => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Diff({ a, b }) {
  const hs = useMemo(() => hunks(diffLines(a, b)), [a, b]);
  if (!hs.length) return <p className="hs-empty">Тексты идентичны.</p>;
  return hs.map((h, k) => (
    <div className="hs-diff" key={k}>
      {h.map((o, i) => (
        <div key={i} className={"hs-dl " + (o.t === "-" ? "del" : o.t === "+" ? "add" : "ctx")}>
          <i>{o.t === "+" ? o.b : o.a}</i><s>{o.t === "=" ? " " : o.t}</s><span>{o.text || " "}</span>
        </div>
      ))}
    </div>
  ));
}

export default function History({ onNav }) {
  const [items, setItems] = useState(loadVault);
  const [open, setOpen] = useState({});
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => subscribe(setItems), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  const docs = useMemo(() => items.map(i => docLua(i.text, i.file, KNOWN)), [items]);
  const s = q.trim().toLowerCase();
  const rows = items.map((it, i) => ({ it, i, hue: hueFor(i) })).filter(r => !s || r.it.file.toLowerCase().includes(s));
  const total = items.reduce((n, i) => n + i.versions.length, 0);

  const doRollback = (it, vi) => {
    const snap = items.map(x => ({ ...x, versions: x.versions.slice() }));
    rollback(it.id, vi);
    setToast({ msg: `${it.file}: откат к версии от ${when(it.versions[vi].at)}`, undo: () => { replaceAll(snap); setToast(null); } });
  };
  const exportPack = () => save(bundle({ items, docs, config: getConfig(), notes: ["Экспорт из истории версий"] }), "zapret2-pack.md", "text/markdown");

  return (
    <Page title="История версий" desc="Каждая правка текста сохраняет предыдущую версию. Можно сравнить, откатиться и выгрузить весь проект одним пакетом.">
      <div className="stats">
        <span><b>{items.length}</b> файлов</span>
        <span><b>{total}</b> сохранённых версий</span>
        <span><b>{items.filter(i => i.versions.length).length}</b> файлов с историей</span>
      </div>
      <div className="hs-bar">
        <input className="search" style={{ maxWidth: 300, marginBottom: 0 }} placeholder="Поиск по имени файла…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="hs-btn hs-primary" onClick={exportPack}>экспорт пакетом .md</button>
        <button className="hs-btn" onClick={() => save(JSON.stringify(items, null, 2), "lua-vault.json", "application/json")}>бэкап JSON</button>
        <button className="hs-btn" onClick={() => onNav?.("vault")}>к хранилищу</button>
        <span className="hs-mono">пакет можно вставить обратно на вкладке приёма файлов</span>
      </div>

      {!total && <div className="hs-none">История пуста: версии появятся после первой правки текста, применения исправлений или обновления файла.</div>}

      <div className="hs-list">
        {rows.map(({ it, hue }) => (
          <article key={it.id} className="hs-card" style={{ "--ch": hue }}>
            <div className="hs-head">
              <span className="hs-dot" />
              <code>{it.file}</code>
              <span className="hs-mono">{it.text.split("\n").length} строк · изменён {when(it.updated)}</span>
              <span className="hs-count">{it.versions.length} версий</span>
            </div>
            {!it.versions.length && <p className="hs-clean">Версий пока нет — текущий текст единственный.</p>}
            {it.versions.map((v, vi) => (
              <div key={vi} className="hs-ver">
                <div className="hs-ver-h">
                  <b>{when(v.at)}</b>
                  <input className="hs-label" value={v.label || ""} placeholder="метка версии"
                    onChange={e => labelVersion(it.id, vi, e.target.value)} />
                  <span className="hs-mono">{v.text.split("\n").length} строк</span>
                  <button className="hs-btn" onClick={() => setOpen(o => ({ ...o, [it.id + vi]: !o[it.id + vi] }))}>{open[it.id + vi] ? "скрыть" : "diff"}</button>
                  <button className="hs-btn hs-primary" onClick={() => doRollback(it, vi)}>откатиться</button>
                  <button className="hs-btn" onClick={() => save(v.text, it.file.replace(/\.\w+$/, "") + "-" + vi + ".lua", "text/x-lua")}>.lua</button>
                  <button className="hs-btn hs-del" onClick={() => { const snap = items.map(x => ({ ...x, versions: x.versions.slice() })); dropVersion(it.id, vi); setToast({ msg: "Версия удалена", undo: () => { replaceAll(snap); setToast(null); } }); }}>×</button>
                </div>
                {open[it.id + vi] && <Diff a={v.text} b={it.text} />}
              </div>
            ))}
            {it.versions.length > 0 && (
              <details className="hs-cur"><summary>Текущий текст</summary><Code lines>{it.text}</Code></details>
            )}
          </article>
        ))}
      </div>

      {toast && (
        <div className="vt-toast"><span>{toast.msg}</span>
          {toast.undo && <button className="vt-btn vt-primary" onClick={toast.undo}>вернуть</button>}
          <button className="vt-x" onClick={() => setToast(null)}>×</button></div>
      )}
    </Page>
  );
}