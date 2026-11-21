import { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { loadVault, subscribe } from "../lib/vault";
import { docLua, KIND_RU } from "../lib/luadoc";
import { parseConfig, runConfig, buildPatched } from "../lib/configRun";
import { getConfig, setConfig } from "../lib/store";
import { bundle, save } from "../lib/pack";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";
import "../styles/vault.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const VC = { "рекомендуется": "ok", "с оговорками": "warn", "бессмысленно": "muted", "сломает": "bad" };

export default function RunConfig({ onNav }) {
  const [items, setItems] = useState(loadVault);
  const [text, setText] = useState(() => getConfig());
  const [pi, setPi] = useState(0);
  const [picks, setPicks] = useState([]);
  const [openSlots, setOpenSlots] = useState({});
  const [showOut, setShowOut] = useState(false);

  useEffect(() => subscribe(setItems), []);
  useEffect(() => { const t = setTimeout(() => setConfig(text), 400); return () => clearTimeout(t); }, [text]);

  const docs = useMemo(() => items.map(i => docLua(i.text, i.file, KNOWN)), [items]);
  const cfg = useMemo(() => parseConfig(text), [text]);
  const run = useMemo(() => cfg.found ? runConfig(cfg, docs) : null, [cfg, docs]);
  const active = run?.profiles[Math.min(pi, run.profiles.length - 1)] || null;
  const patched = useMemo(() => picks.length ? buildPatched(cfg, picks) : "", [cfg, picks]);

  const key = r => `${r.pi}:${r.fn.name}:${r.best.pos}`;
  const mkPick = r => ({
    k: key(r), pi: r.pi, pos: r.best.pos, name: r.fn.name, needPayload: r.needPayload,
    args: r.fn.args.filter(a => a.type !== "flag").map(a => `${a.name}=${a.def !== "—" ? a.def.replace(/^["']|["']$/g, "") : "1"}`).join(":")
  });
  const toggle = r => setPicks(p => p.some(x => x.k === key(r)) ? p.filter(x => x.k !== key(r)) : [...p, mkPick(r)]);
  const takeAll = () => {
    if (!run) return;
    const all = [];
    run.profiles.forEach(pr => pr.reports.forEach(r => { if (r.best.score >= 2 && !r.used) all.push(mkPick(r)); }));
    setPicks(all); setShowOut(true);
  };
  const exportPack = () => save(bundle({
    items, docs, config: text, patched,
    notes: [...(run?.globalIssues || []), ...(active?.issues || []), ...(active?.argIssues || []).map(a => `${a.fn}: ${a.text}`)]
  }), "zapret2-pack.md", "text/markdown");

  return (
    <Page title="Прогон конфига" desc="Разбирает многопрофильный .bat (--name / --new), проверяет аргументы каждого инстанса по коду функции и оценивает места вставки своих функций.">
      <div className="stats">
        <span><b>{cfg.profiles.length}</b> профилей</span>
        <span><b>{cfg.profiles.reduce((s, p) => s + p.instances.length, 0)}</b> инстансов</span>
        <span><b>{run?.fns.length || 0}</b> своих функций</span>
        <span><b>{run?.profiles.reduce((s, p) => s + p.bad, 0) || 0}</b> замечаний</span>
        <span><b>{picks.length}</b> правок выбрано</span>
      </div>

      <details className="tl-pair" open={!cfg.found}>
        <summary>Конфигурация .bat {cfg.found && <i>строки {cfg.start + 1}–{cfg.end + 1} · сохраняется автоматически</i>}</summary>
        <textarea className="bd-ta big" spellCheck={false} value={text} placeholder="Вставь .bat целиком, вместе с продолжениями через ^"
          onChange={e => { setText(e.target.value); setPicks([]); }} />
        <div className="bd-drop-bar">
          <label className="tl-up">открыть .bat<input type="file" hidden accept=".bat,.cmd,.txt" onChange={async e => { const f = e.target.files[0]; if (f) { setText(await f.text()); setPicks([]); } }} /></label>
          <button onClick={() => { setText(""); setPicks([]); }}>очистить</button>
          <button onClick={exportPack}>экспорт пакетом .md</button>
          {!items.length && <button onClick={() => onNav?.("vault")}>загрузить свои .lua</button>}
        </div>
      </details>

      {!cfg.found && <p className="note">В тексте не найден запуск winws2 — вставь команду целиком.</p>}

      {run && (
        <>
          {run.globalIssues.length > 0 && (
            <div className="bd-warn"><b>Замечания по команде в целом:</b><ul>{run.globalIssues.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          )}

          <div className="rc-profiles">
            {run.profiles.map((pr, i) => (
              <button key={i} className={"rc-chip" + (i === pi ? " on" : "") + (pr.bad ? " warn" : "")} onClick={() => setPi(i)}>
                <b>{pr.p.name}</b>
                <span>{pr.p.instances.length} инстансов{pr.bad > 0 && <i className="rc-bad">{pr.bad}</i>}</span>
              </button>
            ))}
          </div>

          {active && (
            <>
              <div className="rc-filters">
                {active.p.tcp && <span>TCP {active.p.tcp}</span>}
                {active.p.udp && <span>UDP {active.p.udp}</span>}
                {active.p.l7 && <span>L7 {active.p.l7}</span>}
                {active.p.payload && <span>payload {active.p.payload}</span>}
                {active.p.outRange && <span>out {active.p.outRange}</span>}
                {active.p.hostlists.length > 0 && <span>хостлистов {active.p.hostlists.length}</span>}
              </div>

              <h2>Цепочка профиля</h2>
              <div className="rc-chain">
                {active.p.instances.map((ins, k) => (
                  <div key={k} className={"rc-inst " + (ins.kind === "custom" ? "custom" : "")}>
                    <span className="rc-no">{k + 1}</span>
                    <code>{ins.fn}</code>
                    <span className="vt-kind">{KIND_RU[ins.kind] || ins.kind}</span>
                    {ins.filters.payload && <span className="rc-flt">payload={ins.filters.payload}</span>}
                    <span className="rc-args">{Object.entries(ins.args).map(([a, v]) => v === true ? a : `${a}=${v}`).join(" · ")}</span>
                  </div>
                ))}
                {!active.p.instances.length && <p className="note">В профиле нет инстансов.</p>}
              </div>

              {active.issues.length > 0 && <div className="bd-warn"><b>Логика профиля:</b><ul>{active.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}

              {active.argIssues.length > 0 && (
                <>
                  <h2>Аргументы инстансов <span className="count">{active.argIssues.length}</span></h2>
                  <div className="vt-issues">
                    {active.argIssues.map((a, i) => (
                      <article key={i} className={"vt-issue " + a.level}>
                        <header><span className="vt-iid">#{a.inst}</span><span className="vt-ilv">{a.fn}</span></header>
                        <p className="vt-imsg">{a.text}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}

              <h2>Куда встроить свои функции <span className="count">{active.reports.length}</span></h2>
              {active.reports.map(r => (
                <div key={r.fn.name} className={"rc-rep " + VC[r.best.verdict]}>
                  <div className="rc-rep-h">
                    <code>{r.fn.name}</code>
                    <span className="vt-kind">{KIND_RU[r.fn.kind]}</span>
                    <span className="rc-file">{r.fn.file}</span>
                    {r.used && <span className="vt-pill">уже в профиле</span>}
                    <span className={"tl-verdict " + VC[r.best.verdict]}>{r.best.pos === 0 ? "в начало" : `после #${r.best.pos}`} — {r.best.verdict}</span>
                  </div>
                  <ul className="rc-reasons">{r.best.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <div className="rc-rep-a">
                    <button className={picks.some(x => x.k === key(r)) ? "bd-primary" : ""} disabled={r.best.score < 1} onClick={() => toggle(r)}>
                      {picks.some(x => x.k === key(r)) ? "выбрано" : "вставить сюда"}
                    </button>
                    <button onClick={() => setOpenSlots(o => ({ ...o, [r.fn.name]: !o[r.fn.name] }))}>{openSlots[r.fn.name] ? "скрыть" : "все"} {r.slots.length} мест</button>
                    {r.needPayload && <span className="bd-meta">будет добавлен --payload={r.needPayload}</span>}
                  </div>
                  {openSlots[r.fn.name] && (
                    <div className="tl-slots">
                      {r.slots.map(s => (
                        <div key={s.pos} className={"tl-slot " + VC[s.verdict]}>
                          <div className="tl-slot-h"><b>{s.pos === 0 ? "в начало цепочки" : `после #${s.pos} (${active.p.instances[s.pos - 1].fn})`}</b>
                            <span className={"tl-verdict " + VC[s.verdict]}>{s.verdict}</span></div>
                          <ul>{s.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          <div className="fx-bar">
            <button className="bd-primary" onClick={takeAll}>применить все рекомендованные</button>
            <button onClick={() => { setPicks([]); setShowOut(false); }}>сбросить выбор</button>
            <button onClick={() => setShowOut(v => !v)}>{showOut ? "скрыть" : "показать"} результат</button>
            {patched && <button onClick={() => save(patched, "config-patched.bat")}>скачать .bat</button>}
            {patched && <button onClick={() => navigator.clipboard?.writeText(patched)}>копировать</button>}
            <button onClick={exportPack}>экспорт пакетом</button>
          </div>
          {showOut && patched && <Code label="готовый .bat с вставками">{patched}</Code>}
          {showOut && !patched && <p className="note">Ничего не выбрано: отметь места вставки выше.</p>}
        </>
      )}
    </Page>
  );
}