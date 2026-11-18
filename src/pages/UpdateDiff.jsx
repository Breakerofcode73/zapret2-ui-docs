import { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { LUA_SLOTS, buildManifest, manifestText, diffLua } from "../lib/versionDiff";
import { collectMy } from "../lib/myDoc";
import { subscribe } from "../lib/vault";
import "../styles/tools.css";

const KEY = "z2baseline:v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };

function Pair({ label, hint, oldV, newV, setOld, setNew }) {
  const d = useMemo(() => label.endsWith(".lua") ? diffLua(oldV, newV) : null, [label, oldV, newV]);
  const rd = async (e, set) => { const f = e.target.files[0]; if (f) set(await f.text()); };
  return (
    <details className="tl-pair" open={!!(oldV || newV)}>
      <summary>{label} <i>{hint}</i>{d && <span className="tl-dstat">+{d.added.length} ~{d.changed.length} −{d.removed.length}</span>}</summary>
      <div className="tl-pair-g">
        <div><div className="tl-h">текущая версия (old)</div>
          <textarea className="bd-ta" spellCheck={false} value={oldV} onChange={e => setOld(e.target.value)} />
          <label className="tl-up">открыть файл<input type="file" hidden onChange={e => rd(e, setOld)} /></label></div>
        <div><div className="tl-h">новая версия (new)</div>
          <textarea className="bd-ta" spellCheck={false} value={newV} onChange={e => setNew(e.target.value)} />
          <label className="tl-up">открыть файл<input type="file" hidden onChange={e => rd(e, setNew)} /></label></div>
      </div>
      {d && (d.added.length || d.changed.length || d.removed.length) ? (
        <div className="tl-dlist">
          {d.added.length > 0 && <p><b className="ok">новые:</b> {d.added.join(", ")}</p>}
          {d.changed.length > 0 && <p><b className="warn">изменённые:</b> {d.changed.join(", ")}</p>}
          {d.removed.length > 0 && <p><b className="bad">удалённые:</b> {d.removed.join(", ")}</p>}
          {d.compat.old !== d.compat.new && <p><b className="bad">COMPAT_VER:</b> {d.compat.old} → {d.compat.new}</p>}
        </div>
      ) : null}
    </details>
  );
}

export default function UpdateDiff({ onNav }) {
  const base = load();
  const [lua, setLua] = useState(() => Object.fromEntries(LUA_SLOTS.map(s => [s.key, { old: base[s.key] || "", new: "" }])));
  const [api, setApi] = useState({ old: base.api || "", new: "" });
  const [flags, setFlags] = useState({ old: base.flags || "", new: "" });
  const [vv, setVv] = useState(0);
  useEffect(() => subscribe(() => setVv(v => v + 1)), []);

  const setL = k => (side, v) => setLua(p => ({ ...p, [k]: { ...p[k], [side]: v } }));
  const manifest = useMemo(() => buildManifest({ lua, api, flags }), [lua, api, flags]);
  const text = useMemo(() => manifestText(manifest), [manifest]);
  const mine = useMemo(() => collectMy().records, [vv]);

  const impact = useMemo(() => {
    const touched = new Set();
    manifest.luaChanges.forEach(c => { c.changed.forEach(n => touched.add(n)); c.removed.forEach(n => touched.add(n)); });
    (manifest.api?.diff?.added || []).forEach(n => touched.add(n));
    (manifest.api?.diff?.removed || []).forEach(n => touched.add(n));
    if (!touched.size) return [];
    return mine.filter(r => r.deps.some(d => touched.has(d)))
      .map(r => ({ name: r.name, file: r.file, hits: r.deps.filter(d => touched.has(d)) }));
  }, [manifest, mine]);

  const saveBase = () => {
    const o = { api: api.old, flags: flags.old };
    LUA_SLOTS.forEach(s => o[s.key] = lua[s.key].old);
    localStorage.setItem(KEY, JSON.stringify(o));
  };
  const promote = () => {
    setLua(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { old: v.new || v.old, new: "" }])));
    setApi(a => ({ old: a.new || a.old, new: "" }));
    setFlags(f => ({ old: f.new || f.old, new: "" }));
  };
  const save = (t, n, ty) => { const b = new Blob([t], { type: ty }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

  return (
    <Page title="Обновление движка" desc="Сравнивает версии библиотек, C-функций и флагов, говорит нужен ли новый winws2.exe, какие файлы копировать и кого из твоих функций это касается.">
      <div className="bd-warn">
        <b>winws2.exe меняется вместе с релизом.</b> Новые C-функции регистрируются в lfunc[] внутри бинарника, новые флаги разбираются в C, а zapret-lib.lua сверяет COMPAT_VER. Только Lua обновляется лишь когда правки не касаются C-стороны.
      </div>
      <div className="fx-bar">
        <button onClick={saveBase}>сохранить текущее как базу</button>
        <button onClick={promote}>новая версия → в базу</button>
        <button className="bd-primary" onClick={() => save(text, "update-plan.md", "text/markdown")}>план .md</button>
        <button onClick={() => navigator.clipboard?.writeText(text)}>копировать план</button>
        <span className="bd-meta">база хранится локально</span>
      </div>

      <h2>Исходники: было / стало</h2>
      {LUA_SLOTS.map(s => (
        <Pair key={s.key} label={s.file} hint={s.why} oldV={lua[s.key].old} newV={lua[s.key].new}
          setOld={v => setL(s.key)("old", v)} setNew={v => setL(s.key)("new", v)} />
      ))}
      <Pair label="nfq2/lua.c" hint="таблица lfunc[] — какие C-функции доступны Lua"
        oldV={api.old} newV={api.new} setOld={v => setApi(a => ({ ...a, old: v }))} setNew={v => setApi(a => ({ ...a, new: v }))} />
      <Pair label="winws2 --help" hint="полный список флагов версии"
        oldV={flags.old} newV={flags.new} setOld={v => setFlags(f => ({ ...f, old: v }))} setNew={v => setFlags(f => ({ ...f, new: v }))} />

      <h2>Вердикт</h2>
      <div className={"tl-verdict-big " + (manifest.needExe ? "bad" : "ok")}>
        {manifest.needExe ? "winws2.exe ТРЕБУЕТСЯ заменить" : "Достаточно заменить Lua-файлы"}
      </div>
      {manifest.reasons.length > 0 && <ul className="tl-reasons">{manifest.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}

      <h2>Кого из твоих функций касается <span className="count">{impact.length}</span></h2>
      {!impact.length ? <p className="note">Пересечений с твоим кодом не найдено (или пары old/new не заполнены).</p> : (
        <div className="tl-copy">
          {impact.map((r, i) => (
            <div key={i} className="tl-copy-row">
              <code className="from">{r.name}</code><span className="arrow">←</span>
              <code className="to">{r.hits.join(", ")}</code>
              <span className="why">{r.file} — функция изменилась или удалена, проверь вызов и сигнатуру</span>
            </div>
          ))}
        </div>
      )}
      {impact.length > 0 && (
        <div className="fx-bar">
          <button className="bd-primary" onClick={() => onNav?.("vault")}>проверить свои функции</button>
          <button onClick={() => onNav?.("myapi")}>открыть справочник своих</button>
        </div>
      )}

      <h2>Скопировать <span className="count">{manifest.copy.length} позиций</span></h2>
      {manifest.copy.length === 0 ? <p className="note">Заполните хотя бы одну пару old/new.</p> : (
        <div className="tl-copy">
          {manifest.copy.map((c, i) => (
            <div key={i} className="tl-copy-row">
              <code className="from">{c.from}</code><span className="arrow">→</span>
              <code className="to">{c.to}</code><span className="why">{c.why}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="tl-notes">{manifest.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <h2>Готовый план</h2>
      <Code label="update-plan.md">{text}</Code>
    </Page>
  );
}