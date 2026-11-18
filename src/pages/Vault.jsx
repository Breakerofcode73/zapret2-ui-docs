import { useEffect, useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import Intake from "../components/Intake";
import BatchFix from "../components/BatchFix";
import { loadVault, subscribe, addItem, updateItem, removeItem, replaceAll } from "../lib/vault";
import { docLua, mdDoc, KIND_RU } from "../lib/luadoc";
import { fixLua, FIX_RULES } from "../lib/fixLua";
import { mdReport } from "../lib/diff";
import { reconcile, describeFn, STATUS_RU, ACTION_RU } from "../lib/sync";
import { hueFor } from "../lib/intake";
import { fns as capi } from "./CApi";
import { fns as lib } from "./Lib";
import { fns as antidpi } from "./Antidpi";
import { fns as auto } from "./Auto";
import "../styles/vault.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const TABS = [
  ["intake", "Приём файлов"], ["doc", "Разбор"], ["lines", "Построчно"], ["code", "Код"],
  ["fix", "Проверка и исправление"], ["batch", "Исправления по файлам"], ["sync", "Сверка памяти"]
];
const EK = { entry: "вход", guard: "гейт", data: "данные", action: "действие", verdict: "вердикт", log: "лог", warn: "риск", struct: "структура", comment: "комментарий" };
const LV = { crit: "критично", warn: "warning", info: "замечание" };

function save(text, name, type) {
  const b = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Diff({ hunks }) {
  if (!hunks?.length) return <p className="vt-empty">Построчных различий нет.</p>;
  return hunks.map((h, k) => (
    <div className="vt-diff" key={k}>
      <div className="vt-diff-h">фрагмент {k + 1}</div>
      {h.map((o, i) => (
        <div key={i} className={"vt-dl " + (o.t === "-" ? "del" : o.t === "+" ? "add" : "ctx")}>
          <i>{o.t === "+" ? o.b : o.a}</i><s>{o.t === "=" ? " " : o.t}</s><span>{o.text || " "}</span>
        </div>
      ))}
    </div>
  ));
}

function Issues({ list }) {
  if (!list.length) return <p className="vt-ok">Замечаний нет — каркас соблюдён.</p>;
  return (
    <div className="vt-issues">
      {list.map((x, i) => (
        <article key={i} className={"vt-issue " + x.level}>
          <header><span className="vt-iid">{x.id}</span><span className="vt-ilv">{LV[x.level]}</span><span className="vt-iloc">строка {x.line}</span></header>
          <p className="vt-imsg">{x.msg}</p>
          {x.fix && <p className="vt-ifix"><b>Как исправить:</b> {x.fix}</p>}
        </article>
      ))}
    </div>
  );
}

export default function Vault({ onNav }) {
  const [items, setItems] = useState(loadVault);
  const [sel, setSel] = useState(() => loadVault()[0]?.id || null);
  const [tab, setTab] = useState("intake");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("manual");
  const [picked, setPicked] = useState(() => new Set());
  const [draft, setDraft] = useState("");
  const [lineQ, setLineQ] = useState("");
  const [off, setOff] = useState(() => new Set());
  const [loaded, setLoaded] = useState([]);
  const [openRow, setOpenRow] = useState({});
  const [toast, setToast] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const jsonRef = useRef(null);

  useEffect(() => subscribe(setItems), []);
  const cur = items.find(x => x.id === sel) || items[0] || null;
  useEffect(() => { setDraft(cur?.text || ""); }, [cur?.id, cur?.updated]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 9000 : 4200); return () => clearTimeout(t); }, [toast]);

  const docs = useMemo(() => items.map(i => ({ id: i.id, d: docLua(i.text, i.file, KNOWN) })), [items]);
  const docOf = id => docs.find(x => x.id === id)?.d;
  const doc = cur ? docOf(cur.id) : null;
  const enabled = useMemo(() => new Set(FIX_RULES.filter(r => !off.has(r.id)).map(r => r.id)), [off]);
  const fix = useMemo(() => cur ? fixLua(cur.text, enabled, KNOWN) : null, [cur, enabled]);
  const sync = useMemo(() => reconcile(items, loaded, KNOWN), [items, loaded]);
  const hueOf = id => hueFor(Math.max(0, items.findIndex(x => x.id === id)));

  const stats = useMemo(() => ({
    files: items.length,
    fns: docs.reduce((s, x) => s + x.d.funcs.length, 0),
    entry: docs.reduce((s, x) => s + x.d.entry.length, 0),
    issues: docs.reduce((s, x) => s + x.d.issues.length, 0),
    need: sync.need.length
  }), [items, docs, sync]);

  const snapshot = () => items.map(x => ({ ...x }));
  const act = (fn, msg) => { const snap = snapshot(); fn(); setToast({ msg, undo: () => { replaceAll(snap); setToast(null); } }); };

  const view = useMemo(() => {
    let arr = items.map((i, idx) => ({ i, idx, d: docOf(i.id) }));
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter(x => (x.i.file + " " + x.i.text + " " + (x.i.tags || []).join(" ")).toLowerCase().includes(s));
    if (filter === "issues") arr = arr.filter(x => x.d.issues.length);
    if (filter === "crit") arr = arr.filter(x => x.d.issues.some(y => y.level === "crit"));
    if (filter === "clean") arr = arr.filter(x => !x.d.issues.length);
    if (sort === "name") arr = arr.slice().sort((a, b) => a.i.file.localeCompare(b.i.file));
    if (sort === "issues") arr = arr.slice().sort((a, b) => b.d.issues.length - a.d.issues.length);
    if (sort === "recent") arr = arr.slice().sort((a, b) => (b.i.updated || 0) - (a.i.updated || 0));
    return arr;
  }, [items, docs, q, filter, sort]);

  const importJson = async f => {
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (Array.isArray(arr)) act(() => replaceAll(arr.map(x => ({ ...x, id: x.id || "f" + Math.random().toString(36).slice(2, 8) }))), "Хранилище восстановлено");
    } catch { setToast({ msg: "Не удалось разобрать JSON" }); }
  };
  const addBlank = () => {
    const n = items.length + 1;
    const it = addItem({
      file: `my_function_${n}.lua`, tags: ["новая"],
      text: `-- my_function_${n}.lua\nfunction my_function_${n}(ctx, desync)\n    if not desync.dis.tcp then\n        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end\n        return\n    end\n    direction_cutoff_opposite(ctx, desync)\n    if not direction_check(desync) then return end\n    if not payload_check(desync) then return end\n    if not replay_first(desync) then\n        if replay_drop(desync) then return VERDICT_DROP end\n        return\n    end\n    -- действие здесь\n    instance_cutoff_shim(ctx, desync)\n    return VERDICT_PASS\nend\n`
    });
    setSel(it.id); setTab("code");
  };
  const del = () => {
    if (!cur) return;
    const snap = snapshot();
    const r = removeItem(cur.id);
    setSel(items.find(x => x.id !== cur.id)?.id || null);
    setToast({ msg: `Удалён ${r.item.file}`, undo: () => { replaceAll(snap); setSel(r.item.id); setToast(null); } });
  };
  const applyCurrentFix = () => {
    if (!cur || !fix?.applied.length) return;
    act(() => updateItem(cur.id, { text: fix.code, tags: [...new Set([...(cur.tags || []), "исправлено"])] }),
      `${cur.file}: применено правок ${fix.changes.length}`);
    setTab("doc");
  };
  const fixMany = ids => {
    const snap = snapshot();
    const per = [];
    ids.forEach(id => {
      const it = items.find(x => x.id === id);
      if (!it) return;
      const r = fixLua(it.text, enabled, KNOWN);
      if (r.applied.length) { updateItem(id, { text: r.code, tags: [...new Set([...(it.tags || []), "исправлено"])] }); per.push(`${it.file} — ${r.changes.length}`); }
    });
    setToast(per.length ? { msg: `Исправлено по файлам: ${per.join(" · ")}`, undo: () => { replaceAll(snap); setToast(null); } }
      : { msg: "Исправлений не требуется — файлы чисты" });
  };
  const applyRow = r => {
    const snap = snapshot();
    if (r.action === "import") {
      const it = addItem({ file: r.file, text: r.fix.code, tags: ["импорт", ...(r.fix.applied.length ? ["исправлено"] : [])], note: r.doc.funcs.map(describeFn).join("\n") });
      setSel(it.id);
    } else if (r.id) {
      updateItem(r.id, { text: r.fix.code, tags: [...new Set([...(items.find(x => x.id === r.id)?.tags || []), "исправлено"])], note: r.doc.funcs.map(describeFn).join("\n") });
      setSel(r.id);
    }
    setLoaded(p => p.filter(x => x.file !== r.file));
    setToast({ msg: `${r.file}: ${ACTION_RU[r.action]} — выполнено`, undo: () => { replaceAll(snap); setToast(null); } });
  };
  const applyAllRows = () => {
    const snap = snapshot();
    sync.need.forEach(r => {
      if (r.action === "import") addItem({ file: r.file, text: r.fix.code, tags: ["импорт", ...(r.fix.applied.length ? ["исправлено"] : [])], note: r.doc.funcs.map(describeFn).join("\n") });
      else if (r.id) updateItem(r.id, { text: r.fix.code, tags: [...new Set([...(items.find(x => x.id === r.id)?.tags || []), "исправлено"])], note: r.doc.funcs.map(describeFn).join("\n") });
    });
    setLoaded([]);
    setToast({ msg: `Принято изменений: ${sync.need.length}`, undo: () => { replaceAll(snap); setToast(null); } });
  };
  const reorder = (from, to) => {
    if (from === to || sort !== "manual") return;
    act(() => { const arr = items.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m); replaceAll(arr); }, "Порядок изменён");
    setDragIdx(null);
  };

  const linesView = doc ? doc.funcs.flatMap(f => f.expl.map(e => ({ ...e, fn: f.name }))) : [];
  const lq = lineQ.trim().toLowerCase();
  const shownLines = lq ? linesView.filter(l => (l.code + " " + l.text).toLowerCase().includes(lq)) : linesView;
  const dirty = cur && draft !== cur.text;
  const pick = id => { setSel(id); setTab("doc"); };

  return (
    <Page title="Хранилище своих функций" desc="Вставь один или несколько файлов — они сразу станут текстом в памяти, разберутся автоматически и получат собственные, независимые наборы исправлений.">
      <div className="stats">
        <span><b>{stats.files}</b> файлов</span>
        <span><b>{stats.fns}</b> функций</span>
        <span><b>{stats.entry}</b> desync-точек</span>
        <span><b>{stats.issues}</b> замечаний</span>
        <span className={stats.need ? "vt-stat-hot" : ""}><b>{stats.need}</b> к сверке</span>
      </div>

      <div className="vt-bar">
        <button className="vt-btn vt-primary" onClick={() => setTab("intake")}>вставить файлы</button>
        <button className="vt-btn" onClick={addBlank}>новая функция</button>
        <button className="vt-btn" onClick={() => setTab("batch")}>исправления по файлам</button>
        <button className="vt-btn" onClick={() => fixMany(items.map(i => i.id))}>исправить всё в памяти</button>
        <button className="vt-btn" onClick={() => save(JSON.stringify(items, null, 2), "lua-vault.json", "application/json")}>экспорт JSON</button>
        <button className="vt-btn" onClick={() => jsonRef.current?.click()}>импорт JSON</button>
        <input ref={jsonRef} type="file" accept=".json" hidden onChange={e => importJson(e.target.files[0])} />
        <button className="vt-btn" onClick={() => save(items.map(i => mdDoc(docLua(i.text, i.file, KNOWN))).join("\n\n---\n\n"), "lua-vault-docs.md", "text/markdown")}>документация .md</button>
        <button className="vt-btn" onClick={() => onNav?.("run")}>прогон конфига →</button>
      </div>

      <div className="vt">
        <aside className="vt-list">
          <input className="search" placeholder="Поиск по файлам и коду…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="vt-list-ctl">
            <select className="vt-sel" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">все файлы</option>
              <option value="issues">с замечаниями</option>
              <option value="crit">с критичными</option>
              <option value="clean">чистые</option>
            </select>
            <select className="vt-sel" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="manual">порядок вручную</option>
              <option value="name">по имени</option>
              <option value="issues">по замечаниям</option>
              <option value="recent">по дате</option>
            </select>
          </div>
          {picked.size > 0 && (
            <div className="vt-bulk">
              <span>выбрано {picked.size}</span>
              <button className="vt-btn vt-primary" onClick={() => { fixMany([...picked]); setPicked(new Set()); }}>исправить</button>
              <button className="vt-btn" onClick={() => setPicked(new Set())}>снять</button>
            </div>
          )}
          {view.map(({ i, idx, d }) => {
            const crit = d.issues.filter(x => x.level === "crit").length;
            return (
              <div key={i.id} className={"vt-item" + (i.id === cur?.id ? " on" : "") + (dragIdx === idx ? " drag" : "")}
                style={{ borderLeftColor: hueFor(idx) }}
                draggable={sort === "manual"} onDragStart={() => setDragIdx(idx)} onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); reorder(dragIdx, idx); }}>
                <input type="checkbox" className="vt-check" checked={picked.has(i.id)}
                  onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(i.id) : n.delete(i.id); return n; })} />
                <button className="vt-item-b" onClick={() => pick(i.id)}>
                  <b>{i.file}</b>
                  <span className="vt-meta">{d.funcs.length} функций · {d.lines} строк
                    {crit > 0 && <i className="vt-crit">{crit}</i>}
                    {d.issues.length > 0 && crit === 0 && <i className="vt-warnb">{d.issues.length}</i>}
                    {!d.issues.length && <i className="vt-clean">чисто</i>}
                  </span>
                  <span className="vt-tags">{(i.tags || []).map(t => <i key={t}>{t}</i>)}</span>
                </button>
              </div>
            );
          })}
          {!view.length && <p className="note">Ничего не найдено.</p>}
          {sort === "manual" && view.length > 1 && <p className="vt-hint">Перетаскивай карточки, чтобы менять порядок.</p>}
        </aside>

        <section className="vt-main">
          <div className="vt-tabs">
            {TABS.map(([k, l]) => (
              <button key={k} className={"vt-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
                {l}
                {k === "fix" && fix?.applied.length > 0 && <i className="vt-dot">{fix.applied.length}</i>}
                {k === "batch" && items.length > 0 && <i className="vt-dot">{items.length}</i>}
                {k === "sync" && stats.need > 0 && <i className="vt-dot hot">{stats.need}</i>}
              </button>
            ))}
          </div>

          {tab === "intake" && <Intake known={KNOWN} onPick={pick} onToast={setToast} />}

          {tab === "batch" && <BatchFix items={items} known={KNOWN} onPick={pick} onToast={setToast} />}

          {tab !== "intake" && tab !== "batch" && !cur && <p className="note">Загрузи файл на вкладке «Приём файлов» или создай новую функцию.</p>}

          {tab !== "intake" && tab !== "batch" && cur && (
            <>
              <header className="vt-head">
                <span className="vt-hue" style={{ background: hueOf(cur.id), boxShadow: `0 0 12px ${hueOf(cur.id)}` }} />
                <input className="vt-name" value={cur.file} onChange={e => updateItem(cur.id, { file: e.target.value })} />
                <input className="vt-tags-in" placeholder="теги через запятую" value={(cur.tags || []).join(", ")}
                  onChange={e => updateItem(cur.id, { tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
                <button className="vt-btn" onClick={() => save(cur.text, cur.file, "text/x-lua")}>.lua</button>
                <button className="vt-btn" onClick={() => save(mdDoc(doc), cur.file.replace(/\.\w+$/, "") + ".md", "text/markdown")}>.md</button>
                <button className="vt-btn" onClick={() => { const it = addItem({ ...cur, file: cur.file.replace(/\.\w+$/, "_copy$&") }); setSel(it.id); }}>дублировать</button>
                <button className="vt-btn vt-del" onClick={del}>удалить</button>
              </header>
              <textarea className="vt-note-in" placeholder="Заметка: зачем функция, что проверено, что осталось…"
                value={cur.note || ""} onChange={e => updateItem(cur.id, { note: e.target.value })} />

              {tab === "doc" && (
                <>
                  {dirty && <div className="vt-banner warn">В редакторе есть несохранённые правки — разбор показан по версии из памяти. <button className="vt-btn vt-primary" onClick={() => act(() => updateItem(cur.id, { text: draft }), "Сохранено")}>сохранить</button></div>}
                  {doc.funcs.map(f => (
                    <article key={f.name} className={"vt-fn " + f.kind}>
                      <div className="vt-fn-h">
                        <code>{f.name}</code>
                        <span className="vt-kind">{KIND_RU[f.kind]}</span>
                        {f.local && <span className="vt-pill">local</span>}
                        {f.sends && <span className="vt-pill">отправляет</span>}
                        {f.needsReasm && <span className="vt-pill">нужен reasm</span>}
                        {f.luaCutoff && <span className="vt-pill bad">lua_cutoff</span>}
                        <span className="vt-loc">строка {f.line} · {f.size} строк тела</span>
                      </div>
                      <p className="vt-desc">{describeFn(f)}</p>
                      {f.lead.length > 0 && <p className="vt-lead">{f.lead.join(" ")}</p>}
                      <Code copy={false}>{`${f.local ? "local " : ""}function ${f.name}(${f.params})`}</Code>
                      <div className="vt-grid">
                        <div><b>Гейты</b><span>{[f.tcpOnly && "только TCP", f.udpOnly && "только UDP", f.outgoingOnly && "исходящие", ...f.gatePayload].filter(Boolean).join(", ") || "нет"}</span></div>
                        <div><b>Вердикты</b><span>{f.verdicts.join(", ") || "nil = PASS"}</span></div>
                        <div><b>Replay</b><span className={f.hasReplay ? "ok" : "warn"}>{f.hasReplay ? "защищено" : "нет защиты"}</span></div>
                        <div><b>Cutoff</b><span className={f.hasCutoff ? "ok" : "warn"}>{f.hasCutoff ? "есть" : "нет"}</span></div>
                      </div>
                      {f.args.length > 0 && (
                        <table className="vt-args"><thead><tr><th>аргумент</th><th>тип</th><th>по умолчанию</th><th>смысл</th></tr></thead>
                          <tbody>{f.args.map(a => <tr key={a.name}><td><code>{a.name}</code></td><td>{a.type}</td><td>{a.def}</td><td>{a.desc}</td></tr>)}</tbody></table>
                      )}
                      {f.deps.length > 0 && <div className="vt-deps">Опирается на: {f.deps.map(d => <span key={d} className="chip">{d}</span>)}</div>}
                      {f.foreign.length > 0 && <div className="vt-deps warn">Неизвестные вызовы: {f.foreign.map(d => <span key={d} className="chip">{d}</span>)}</div>}
                      {f.cli && <Code label="строка запуска">{f.cli}</Code>}
                    </article>
                  ))}
                </>
              )}

              {tab === "lines" && (
                <>
                  <input className="search" placeholder="Фильтр по строкам и объяснениям…" value={lineQ} onChange={e => setLineQ(e.target.value)} />
                  <div className="vt-lines">
                    {shownLines.map((l, i) => (
                      <div key={i} className={"vt-line " + l.kind}>
                        <i>{l.no}</i><code>{l.code || " "}</code>
                        <span><em>{EK[l.kind]}</em>{l.text}</span>
                      </div>
                    ))}
                    {!shownLines.length && <p className="note">Нет совпадений.</p>}
                  </div>
                </>
              )}

              {tab === "code" && (
                <>
                  <textarea className="vt-ta vt-code" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} />
                  <div className="vt-row">
                    <button className="vt-btn vt-primary" disabled={!dirty} onClick={() => act(() => updateItem(cur.id, { text: draft }), "Сохранено, разбор обновлён")}>сохранить в память</button>
                    <button className="vt-btn" disabled={!dirty} onClick={() => setDraft(cur.text)}>отменить правки</button>
                    <button className="vt-btn" onClick={() => setTab("fix")}>проверить и исправить</button>
                    <span className="vt-mono">{draft.split("\n").length} строк · {dirty ? "есть несохранённые правки" : "совпадает с памятью"}</span>
                  </div>
                </>
              )}

              {tab === "fix" && fix && (
                <>
                  <div className="vt-fixbar">
                    <span className={"vt-badge " + (fix.after.length ? "bad" : "ok")}>
                      {fix.after.length ? `было ${fix.before.length} → стало ${fix.after.length}` : "0 замечаний — файл чист"}
                    </span>
                    <span className="vt-mono">только {cur.file} · правок {fix.changes.length} · проходов {fix.passes.length}</span>
                    <button className="vt-btn vt-primary" disabled={!fix.applied.length} onClick={applyCurrentFix}>применить к этому файлу</button>
                    <button className="vt-btn" disabled={!fix.applied.length} onClick={() => save(fix.code, cur.file, "text/x-lua")}>скачать .lua</button>
                    <button className="vt-btn" disabled={!fix.changes.length} onClick={() => save(mdReport(fix, cur.file), cur.file.replace(/\.\w+$/, "") + "-fix.md", "text/markdown")}>отчёт .md</button>
                    <button className="vt-btn" onClick={() => setTab("batch")}>все файлы разом</button>
                  </div>

                  {!fix.applied.length && !fix.after.length && (
                    <div className="vt-banner ok"><b>Исправлений не требуется.</b> Функция уже соответствует каркасу zapret2: гейты, replay-защита, cutoff и вердикты на месте.</div>
                  )}

                  <div className="vt-rules">
                    {FIX_RULES.map(r => {
                      const a = fix.applied.find(x => x.id === r.id);
                      return (
                        <button key={r.id} className={"vt-rule" + (off.has(r.id) ? " off" : "") + (a ? " done" : "")}
                          onClick={() => setOff(o => { const n = new Set(o); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                          <span className="vt-rid">{r.id}</span>
                          <span className="vt-rt">{r.title}</span>
                          <span className={"vt-rst" + (a ? " ok" : "")}>{off.has(r.id) ? "выкл" : a ? `×${a.count}` : "—"}</span>
                        </button>
                      );
                    })}
                  </div>

                  {fix.changes.length > 0 && (
                    <>
                      <h2>Что исправили и почему <span className="count">{fix.changes.length}</span></h2>
                      <div className="vt-report">
                        {fix.changes.map((c, i) => (
                          <article key={i} className={"vt-rcard " + c.level}>
                            <div className="vt-rhead">
                              <span className="vt-rrule">{c.rule}</span>
                              <span className="vt-rtitle">{c.title}</span>
                              <span className="vt-mono">проход {c.pass} · {LV[c.level]}</span>
                            </div>
                            <div className="vt-rbody">
                              {c.problem && <div className="vt-rsec problem"><b>Что было не так</b>{c.problem}</div>}
                              {c.action && <div className="vt-rsec action"><b>Что сделано</b>{c.action}</div>}
                              {c.why && <div className="vt-rsec why"><b>Почему именно так</b>{c.why}</div>}
                              <Diff hunks={c.hunks} />
                              {c.refs?.length > 0 && <div className="vt-rrefs">Опора: {c.refs.join(" · ")}</div>}
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="vt-passes">
                    {fix.passes.map(p => (
                      <div key={p.n} className={"vt-pass" + (p.applied.length ? " hit" : "")}>
                        <span>проход {p.n}</span>{p.applied.length ? `${p.applied.join(", ")} → осталось ${p.issues}` : `изменений нет → ${p.issues}, стоп`}
                      </div>
                    ))}
                  </div>

                  {fix.after.length > 0 && <><h2>Осталось {fix.after.length}</h2><Issues list={fix.after} /></>}

                  <div className="vt-split">
                    <div><div className="vt-sh bad">В памяти · {fix.before.length}</div><Code lines>{cur.text}</Code></div>
                    <div><div className={"vt-sh " + (fix.after.length ? "warn" : "ok")}>После исправления · {fix.after.length}</div><Code lines>{fix.code}</Code></div>
                  </div>
                </>
              )}

              {tab === "sync" && (
                <>
                  <div className="vt-drop">
                    <button className="vt-btn vt-primary" onClick={() => setTab("intake")}>приём файлов</button>
                    <button className="vt-btn" onClick={() => setLoaded(items.map(i => ({ file: i.file, text: i.text })))}>сверить память саму с собой</button>
                    <button className="vt-btn" onClick={() => setLoaded([])}>очистить загруженное</button>
                    <span>загружено для сверки: {loaded.length}</span>
                  </div>

                  {sync.clean ? (
                    <div className="vt-banner ok"><b>Исправлений не требуется.</b> Загруженные файлы совпадают с памятью, все функции чисты — новых данных нет.</div>
                  ) : (
                    <div className="vt-banner hot">
                      <b>Есть новая информация: {sync.need.length}.</b> Прими изменения — память обновится, а логика функций будет описана автоматически.
                      <button className="vt-btn vt-primary" onClick={applyAllRows}>принять всё</button>
                    </div>
                  )}

                  <div className="vt-sync">
                    {sync.rows.map((r, ri) => (
                      <article key={r.key} className={"vt-srow " + r.action} style={{ borderLeftColor: hueFor(ri) }}>
                        <div className="vt-shead">
                          <code>{r.file}</code>
                          <span className={"vt-sstatus " + r.status}>{STATUS_RU[r.status]}</span>
                          <span className="vt-mono">{r.doc.funcs.length} функций · {r.fix.before.length} → {r.fix.after.length} замечаний</span>
                          <span className={"vt-sact " + r.action}>{ACTION_RU[r.action]}</span>
                        </div>
                        <div className="vt-sdesc">{r.doc.funcs.map(f => <p key={f.name}>{describeFn(f)}</p>)}</div>
                        {r.fix.applied.length > 0 && <div className="vt-sfix">Правки этого файла: {r.fix.applied.map(a => `${a.id}×${a.count}`).join(", ")}</div>}
                        <div className="vt-row">
                          {r.action !== "none" && <button className="vt-btn vt-primary" onClick={() => applyRow(r)}>{ACTION_RU[r.action]}</button>}
                          <button className="vt-btn" onClick={() => setOpenRow(o => ({ ...o, [r.key]: !o[r.key] }))}>{openRow[r.key] ? "скрыть" : "показать"} детали</button>
                          {r.action !== "none" && <button className="vt-btn" onClick={() => setLoaded(p => p.filter(x => x.file !== r.file))}>пропустить</button>}
                        </div>
                        {openRow[r.key] && (
                          <div className="vt-sdetails">
                            {r.hunks.length > 0 && <><div className="vt-sh warn">Память → загруженный файл</div><Diff hunks={r.hunks} /></>}
                            {r.fix.changes.map((c, i) => (
                              <div key={i} className="vt-schange"><b>{c.rule} — {c.title}</b><p>{c.why}</p><Diff hunks={c.hunks} /></div>
                            ))}
                            {r.fix.after.length > 0 && <Issues list={r.fix.after} />}
                            <Code label="итоговый код">{r.fix.code}</Code>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {toast && (
        <div className="vt-toast">
          <span>{toast.msg}</span>
          {toast.undo && <button className="vt-btn vt-primary" onClick={toast.undo}>вернуть</button>}
          <button className="vt-x" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </Page>
  );
}