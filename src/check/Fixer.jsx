import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { fixLua, FIX_RULES } from "../lib/fixLua";
import { mdReport } from "../lib/diff";
import { getLua, setLua } from "../lib/store";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";
import "../styles/builder.css";
import "../styles/fixreport.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const LV = { crit: "критично", warn: "warning", info: "замечание" };

function Ref({ r }) {
  if (r.startsWith("deep/")) return <a href={"#/" + r}>{r.slice(5)}</a>;
  if (r.startsWith("capi:")) return <a href="#/capi">{r.slice(5).trim()}</a>;
  return <span>{r}</span>;
}

function Diff({ hunks }) {
  if (!hunks.length) return <p className="fr-empty">Правка не изменила видимые строки.</p>;
  return hunks.map((h, k) => (
    <div className="fr-diff" key={k}>
      <div className="fr-diff-h">фрагмент {k + 1} · было / стало</div>
      {h.map((o, i) => (
        <div key={i} className={"fr-l " + (o.t === "-" ? "del" : o.t === "+" ? "add" : "ctx")}>
          <i>{o.t === "+" ? o.b : o.a}</i>
          <s>{o.t === "=" ? " " : o.t}</s>
          <span>{o.text || " "}</span>
        </div>
      ))}
    </div>
  ));
}

export default function Fixer({ onNav }) {
  const [src, setSrc] = useState(getLua());
  const [off, setOff] = useState(() => new Set());
  const [showReport, setShowReport] = useState(true);

  const enabled = useMemo(() => new Set(FIX_RULES.filter(r => !off.has(r.id)).map(r => r.id)), [off]);
  const res = useMemo(() => src.trim() ? fixLua(src, enabled, KNOWN) : null, [src, enabled]);

  const toggle = id => setOff(o => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = (text, name, type) => {
    const b = new Blob([text], { type });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const delta = res ? res.before.length - res.after.length : 0;
  const clean = res && res.after.length === 0;

  return (
    <Page title="Исправление ошибок" desc="Каждая правка документируется: что было не так, что сделано, почему именно так, и точный фрагмент «было / стало».">
      {!src.trim() ? (
        <div className="bd-empty">
          <p>Код не передан. Собери функцию в конструкторе или вставь её на странице проверки.</p>
          <div className="bd-drop-bar">
            <button className="bd-primary" onClick={() => onNav?.("builder")}>в конструктор</button>
            <button onClick={() => onNav?.("diagnose")}>вставить код</button>
          </div>
          <textarea className="bd-ta big" spellCheck={false} placeholder="…или вставь Lua прямо здесь"
            value={src} onChange={e => { setSrc(e.target.value); setLua(e.target.value); }} />
        </div>
      ) : (
        <>
          <div className="fx-bar">
            <span className={"bd-badge " + (clean ? "ok" : "bad")}>
              {clean ? "0 замечаний — файл чист" : `было ${res.before.length} → стало ${res.after.length}`}
            </span>
            <span className="bd-meta">
              {delta > 0 ? `устранено ${delta}` : "изменений нет"} · правок {res.changes.length} · проходов {res.passes.length}
              {res.cycle ? " · осцилляция" : " · дочиста"}
            </span>
            {off.size > 0 && <button className="bd-primary" onClick={() => setOff(new Set())}>довести до нуля</button>}
            <button onClick={() => setShowReport(v => !v)}>{showReport ? "скрыть отчёт" : "показать отчёт"}</button>
            <button onClick={() => save(mdReport(res), "fix-report.md", "text/markdown")}>отчёт .md</button>
            <button onClick={() => save(res.code, "fixed.lua", "text/x-lua")}>скачать .lua</button>
            <button onClick={() => { setLua(res.code); onNav?.("diagnose"); }}>проверить результат</button>
            <button onClick={() => { setSrc(res.code); setLua(res.code); }}>принять как исходник</button>
            <button onClick={() => { setSrc(""); setLua(""); }}>очистить</button>
          </div>

          {res.cycle && (
            <div className="bd-warn"><b>Осцилляция:</b> код вернулся к уже виденному состоянию.
              Отключи правило последнего прохода ({res.passes[res.passes.length - 1].applied.join(", ")}).</div>
          )}

          <div className="fx-rules">
            {FIX_RULES.map(r => {
              const a = res.applied.find(x => x.id === r.id);
              return (
                <button key={r.id} className={"fx-rule " + (off.has(r.id) ? "off" : "") + (a ? " done" : "")} onClick={() => toggle(r.id)}>
                  <span className="fx-id">{r.id}</span>
                  <span className="fx-t">{r.title}</span>
                  <span className={"fx-st " + (a ? "ok" : "")}>
                    {off.has(r.id) ? "выкл" : a ? `применено ×${a.count}` : "не требовалось"}
                  </span>
                </button>
              );
            })}
          </div>

          {showReport && (
            <>
              <h2>Что исправили и почему <span className="count">{res.changes.length} правок</span></h2>
              {res.changes.length === 0 ? <p className="note">Правила ничего не меняли — исходник уже соответствует каркасу.</p> : (
                <div className="fr-list">
                  {res.changes.map((c, i) => (
                    <article key={i} className={"fr-card " + c.level}>
                      <div className="fr-head">
                        <span className="fr-rule">{c.rule}</span>
                        <span className="fr-title">{c.title}</span>
                        <span className="fr-meta">проход {c.pass} · {LV[c.level]}</span>
                      </div>
                      <div className="fr-body">
                        {c.problem && <div className="fr-sec problem"><b>Что было не так</b>{c.problem}</div>}
                        {c.action && <div className="fr-sec action"><b>Что сделано</b>{c.action}</div>}
                        {c.why && <div className="fr-sec why"><b>Почему именно так</b>{c.why}</div>}
                        <Diff hunks={c.hunks} />
                        {c.refs.length > 0 && (
                          <div className="fr-refs">Опора: {c.refs.map((r, k) => <span key={k}>{k > 0 && " · "}<Ref r={r} /></span>)}</div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="bd-issues">
            {res.passes.map(p => (
              <div key={p.n} className={"bd-issue " + (p.applied.length ? "info" : "")}>
                <span>проход {p.n}</span>
                {p.applied.length ? `${p.applied.join(", ")} → осталось ${p.issues}` : `изменений нет → ${p.issues} замечаний, стоп`}
              </div>
            ))}
          </div>

          {res.disabled.length > 0 && (
            <div className="bd-warn"><b>Отключённые правила могли бы исправить:</b>
              <ul>{res.disabled.map((x, i) => <li key={i}>{x.id} (строка {x.line}) — включи {x.rule}</li>)}</ul>
            </div>
          )}
          {res.manual.length > 0 && (
            <div className="bd-warn"><b>Правило не смогло примениться безопасно:</b>
              <ul>{res.manual.map((m, i) => <li key={i}>{m.title}: {m.note}</li>)}</ul>
            </div>
          )}
          {res.blocked.length > 0 && (
            <div className="bd-warn"><b>Правило включено, но дефект остался:</b>
              <ul>{res.blocked.map((x, i) => <li key={i}>{x.id} (строка {x.line}, правило {x.rule}): {x.msg}</li>)}</ul>
            </div>
          )}

          <div className="fx-grid">
            <div><div className="fx-h bad">Исходник · {res.before.length} замечаний</div><Code lines>{src}</Code></div>
            <div><div className={"fx-h " + (clean ? "ok" : "bad")}>Исправлено · {res.after.length} замечаний</div><Code lines>{res.code}</Code></div>
          </div>

          {res.after.length > 0 && (
            <div className="chk-list">
              <h2>Осталось {res.after.length}</h2>
              {res.after.map((x, i) => (
                <article key={i} className={"chk-item " + x.level}>
                  <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                  <p className="chk-msg">{x.msg}</p>
                  {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                </article>
              ))}
              {res.uncovered.length > 0 && (
                <p className="note">{res.uncovered.length} без автоправила: числовой вердикт, неизвестный вызов, файл без desync-функции — это правится только решением человека.</p>
              )}
            </div>
          )}
        </>
      )}
    </Page>
  );
}