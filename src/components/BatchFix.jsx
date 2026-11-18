import { useMemo, useState } from "react";
import Code from "./Code";
import { fixLua, FIX_RULES } from "../lib/fixLua";
import { mdReport } from "../lib/diff";
import { hueFor } from "../lib/intake";
import { loadVault, updateItem, replaceAll } from "../lib/vault";
import "../styles/intake.css";

const LV = { crit: "критично", warn: "warning", info: "замечание" };

function save(text, name, type) {
  const b = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Diff({ hunks }) {
  if (!hunks?.length) return null;
  return hunks.map((h, k) => (
    <div className="bf-diff" key={k}>
      {h.map((o, i) => (
        <div key={i} className={"bf-dl " + (o.t === "-" ? "del" : o.t === "+" ? "add" : "ctx")}>
          <i>{o.t === "+" ? o.b : o.a}</i><s>{o.t === "=" ? " " : o.t}</s><span>{o.text || " "}</span>
        </div>
      ))}
    </div>
  ));
}

export default function BatchFix({ items, known, onPick, onToast }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("need");
  const [off, setOff] = useState(() => new Set());
  const [open, setOpen] = useState({});
  const [picked, setPicked] = useState(() => new Set());

  const enabled = useMemo(() => new Set(FIX_RULES.filter(r => !off.has(r.id)).map(r => r.id)), [off]);
  const rows = useMemo(() => items.map((it, i) => ({
    it, i, hue: hueFor(i), fix: fixLua(it.text, enabled, known)
  })), [items, enabled, known]);

  const need = rows.filter(r => r.fix.applied.length);
  const view = rows.filter(r => {
    const s = q.trim().toLowerCase();
    if (s && !(r.it.file + " " + r.it.text).toLowerCase().includes(s)) return false;
    if (mode === "need") return r.fix.applied.length > 0;
    if (mode === "clean") return !r.fix.after.length;
    if (mode === "left") return r.fix.after.length > 0;
    return true;
  });

  const snapshot = () => loadVault().map(x => ({ ...x }));
  const applyOne = r => {
    const snap = snapshot();
    updateItem(r.it.id, { text: r.fix.code, tags: [...new Set([...(r.it.tags || []), "исправлено"])] });
    onToast?.({
      msg: `${r.it.file}: применено ${r.fix.changes.length} правок (${r.fix.before.length} → ${r.fix.after.length})`,
      undo: () => { replaceAll(snap); onToast?.(null); }
    });
  };
  const applyMany = list => {
    if (!list.length) { onToast?.({ msg: "Исправлений не требуется — выбранные файлы чисты" }); return; }
    const snap = snapshot();
    const per = [];
    list.forEach(r => {
      if (!r.fix.applied.length) return;
      updateItem(r.it.id, { text: r.fix.code, tags: [...new Set([...(r.it.tags || []), "исправлено"])] });
      per.push(`${r.it.file} — ${r.fix.changes.length}`);
    });
    onToast?.({ msg: `Исправлено по файлам: ${per.join(" · ")}`, undo: () => { replaceAll(snap); onToast?.(null); } });
    setPicked(new Set());
  };

  const totalChanges = rows.reduce((s, r) => s + r.fix.changes.length, 0);

  return (
    <div className="bf">
      <div className="bf-head">
        <div className="bf-title">
          <b>Каждый файл исправляется независимо</b>
          <span>Правила применяются к собственному тексту файла: правки одного никогда не попадают в другой. Ниже — отдельный отчёт и отдельная кнопка на каждый файл.</span>
        </div>
        <div className="bf-sum">
          <span className="bf-pill">{rows.length} файлов</span>
          <span className="bf-pill hot">{need.length} требуют правок</span>
          <span className="bf-pill ok">{rows.filter(r => !r.fix.after.length).length} чистых</span>
          <span className="bf-pill">{totalChanges} правок всего</span>
        </div>
      </div>

      <div className="bf-bar">
        <input className="search bf-search" placeholder="Поиск по файлам и коду…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="bf-sel" value={mode} onChange={e => setMode(e.target.value)}>
          <option value="need">требуют правок</option>
          <option value="all">все файлы</option>
          <option value="left">с остатком</option>
          <option value="clean">чистые</option>
        </select>
        <button className="ik-btn ik-primary" disabled={!need.length} onClick={() => applyMany(need)}>применить ко всем ({need.length})</button>
        <button className="ik-btn" disabled={!picked.size} onClick={() => applyMany(rows.filter(r => picked.has(r.it.id)))}>применить к выбранным ({picked.size})</button>
        <button className="ik-btn" onClick={() => setPicked(new Set(view.map(r => r.it.id)))}>выбрать показанные</button>
        <button className="ik-btn" onClick={() => setPicked(new Set())}>снять выбор</button>
      </div>

      <details className="bf-rules">
        <summary>Правила исправления <i>{enabled.size} из {FIX_RULES.length} включено</i></summary>
        <div className="bf-rulegrid">
          {FIX_RULES.map(r => (
            <button key={r.id} className={"bf-rule" + (off.has(r.id) ? " off" : "")}
              onClick={() => setOff(o => { const n = new Set(o); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
              <span>{r.id}</span>{r.title}
            </button>
          ))}
        </div>
      </details>

      {!view.length && (
        <div className="bf-empty">
          {mode === "need" ? "Исправлений не требуется: ни один файл не изменился бы правилами." : "Нет файлов под фильтр."}
        </div>
      )}

      <div className="bf-list">
        {view.map(r => (
          <article key={r.it.id} className={"bf-card" + (r.fix.applied.length ? " need" : " clean")} style={{ "--fh": r.hue }}>
            <div className="bf-card-h">
              <input type="checkbox" className="bf-check" checked={picked.has(r.it.id)}
                onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(r.it.id) : n.delete(r.it.id); return n; })} />
              <span className="ik-dot" />
              <code>{r.it.file}</code>
              <span className={"bf-badge " + (r.fix.after.length ? "bad" : "ok")}>{r.fix.before.length} → {r.fix.after.length}</span>
              <span className="bf-mono">правок {r.fix.changes.length} · проходов {r.fix.passes.length}</span>
              <div className="bf-card-a">
                <button className="ik-btn ik-primary" disabled={!r.fix.applied.length} onClick={() => applyOne(r)}>применить к этому файлу</button>
                <button className="ik-btn" onClick={() => setOpen(o => ({ ...o, [r.it.id]: !o[r.it.id] }))}>{open[r.it.id] ? "скрыть" : "отчёт"}</button>
                <button className="ik-btn" onClick={() => onPick?.(r.it.id)}>разбор</button>
                <button className="ik-btn" disabled={!r.fix.changes.length} onClick={() => save(mdReport(r.fix, r.it.file), r.it.file.replace(/\.\w+$/, "") + "-fix.md", "text/markdown")}>.md</button>
                <button className="ik-btn" disabled={!r.fix.applied.length} onClick={() => save(r.fix.code, r.it.file, "text/x-lua")}>.lua</button>
              </div>
            </div>

            {r.fix.applied.length > 0 && (
              <div className="bf-chips">{r.fix.applied.map(a => <span key={a.id} className="bf-chip">{a.id} ×{a.count}</span>)}</div>
            )}
            {!r.fix.applied.length && !r.fix.after.length && <p className="bf-clean">Исправлений не требуется — каркас соблюдён.</p>}
            {!r.fix.applied.length && r.fix.after.length > 0 && <p className="bf-clean warn">Автоправила не меняют файл, но остались замечания — правь вручную.</p>}

            {open[r.it.id] && (
              <div className="bf-body">
                {r.fix.changes.map((c, i) => (
                  <div key={i} className={"bf-change " + c.level}>
                    <div className="bf-change-h"><span className="bf-rid">{c.rule}</span><b>{c.title}</b><i>проход {c.pass} · {LV[c.level]}</i></div>
                    {c.problem && <p><em className="p">Что было не так</em>{c.problem}</p>}
                    {c.action && <p><em className="a">Что сделано</em>{c.action}</p>}
                    {c.why && <p><em className="w">Почему именно так</em>{c.why}</p>}
                    <Diff hunks={c.hunks} />
                  </div>
                ))}
                {r.fix.after.length > 0 && (
                  <div className="bf-left">
                    <b>Осталось в этом файле: {r.fix.after.length}</b>
                    {r.fix.after.map((x, i) => (
                      <div key={i} className={"bf-issue " + x.level}>
                        <span>{x.id} · строка {x.line}</span>{x.msg}
                        {x.fix && <i>{x.fix}</i>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="bf-split">
                  <div><div className="bf-sh bad">Было</div><Code lines>{r.it.text}</Code></div>
                  <div><div className={"bf-sh " + (r.fix.after.length ? "warn" : "ok")}>Стало</div><Code lines>{r.fix.code}</Code></div>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}