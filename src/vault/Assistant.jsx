import { useEffect, useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { interpret, feedback, teach, answer, exam, engine, rebuild, studyStats, studyMap } from "../lib/ai/engine";
import { variantBat, applyVariant, CRITERIA } from "../lib/ai/variants";
import { SEED_CONFIG } from "../lib/ai/study";
import { parseConfig } from "../lib/configRun";
import * as L from "../lib/ai/learn";
import * as mem from "../lib/ai/memory";
import { OPS } from "../lib/intent";
import { addItem, subscribe as vaultSub } from "../lib/vault";
import { getConfig, setConfig, onConfig } from "../lib/store";
import { save } from "../lib/pack";
import "../styles/assistant.css";

const LV = { ok: "можно", warn: "с оговоркой", no: "нельзя", probe: "нужен эксперимент" };
const SRC = { verified: "исходники", config: "твой конфиг", manual: "мануал", authored: "корпус", custom: "твоя функция" };
const ORIGIN = { config: "из твоего конфига", antidpi: "штатная", vault: "твоя функция", synth: "синтез", hybrid: "гибрид" };
const ROUTE = { c: "capi", strategy: "antidpi", helper: "lib", orch: "auto", marker: "markers", profile: "run",
  template: "run", lesson: "fixer", state: "myapi", pitfall: "capi", duplicate: "dedup", flag: "update", op: "idea" };
const SEED = "чтобы провайдер думал что это мусор, а настоящий запрос ушёл нетронутым";
const argStr = a => Object.entries(a || {}).map(([k, v]) => v === true ? k : `${k}=${v}`).join(":");

function routeFor(d) {
  if (d.kind === "deep") return "deep/" + d.id.slice(2);
  if (d.kind === "lore") return (d.meta.refs || ["contract"])[0];
  return (d.meta.refs || [ROUTE[d.kind] || "overview"])[0];
}

function Bars({ parts }) {
  return <div className="as-bars">{Object.entries(parts).map(([k, v]) => (
    <div key={k} className="as-bar"><span>{CRITERIA[k]}</span><i style={{ width: Math.min(100, v * 320) + "%" }} /><em>{v.toFixed(2)}</em></div>))}</div>;
}

function VariantCard({ v, best, onPick, onAccept, onApply, onNav }) {
  const [open, setOpen] = useState(best);
  return (
    <article className={"as-var " + v.origin + (v.score < 0 ? " blocked" : "") + (best ? " best" : "")}>
      <button className="as-var-h" onClick={() => setOpen(o => !o)}>
        <span className={"as-origin " + v.origin}>{ORIGIN[v.origin]}</span>
        <b>{v.title}</b>
        {v.tag && <em>{v.tag}</em>}
        <span className="as-score">{v.score < 0 ? "нельзя" : (v.score * 100).toFixed(0) + "%"}</span>
        <span className="as-chev">{open ? "−" : "+"}</span>
      </button>
      {v.chain.length > 0 && (
        <div className="as-chain">
          {v.chain.map((c, i) => (
            <span key={i} className="as-link">
              {i > 0 && <i>→</i>}
              <code>{c.fn}</code>
              {argStr(c.args) && <em>{argStr(c.args)}</em>}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="as-var-b">
          {v.source && <p className="as-src-line">{v.source}</p>}
          {v.parts && <Bars parts={v.parts} />}
          {v.missing?.length > 0 && <p className="as-warn-line">Не покрывает: {v.missing.join(", ")}</p>}
          {v.blocks.length > 0 && <div className="as-block">{v.blocks.map((b, i) => <p key={i}>{b}</p>)}</div>}
          {v.risks.length > 0 && <div className="as-risk">{v.risks.map((r, i) => <p key={i}>{r}</p>)}</div>}
          {v.evidence.length > 0 && (
            <div className="as-evd">Основание: {v.evidence.map((e, i) => (
              <button key={i} className="as-chip" onClick={() => onNav((e.refs || ["overview"])[0])}>{e.title}</button>))}</div>
          )}
          {v.build && <Code label={v.build.name + ".lua"} lines>{v.build.code}</Code>}
          {v.chain.length > 0 && <Code label="фрагмент профиля">{variantBat(v)}</Code>}
          <div className="as-act">
            {v.score >= 0 && <>
              <button className="as-btn primary" onClick={() => onApply(v, "append")}>добавить в профиль</button>
              <button className="as-btn" onClick={() => onApply(v, "replace")}>заменить цепочку</button>
              <button className="as-btn" onClick={() => onApply(v, "new")}>новый профиль</button>
            </>}
            {v.build && <button className="as-btn" onClick={() => onAccept(v)}>принять .lua</button>}
            <button className="as-btn" onClick={() => onPick(v)}>взять как замысел</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Turn({ r, onForce, onFeedback, onAnswer, onPick, onTeach, onAccept, onApply, onNav }) {
  const [trace, setTrace] = useState(false);
  const [ev, setEv] = useState(false);
  const [why, setWhy] = useState(false);
  const [cmp, setCmp] = useState(false);
  const viable = r.variants.rows.filter(v => v.score >= 0);
  return (
    <article className="as-turn">
      <div className="as-q"><span>ты</span>{r.phrase}</div>
      <div className="as-a">
        <div className="as-meter">
          <span className="as-conf">уверенность {Math.round(r.confidence * 100)}%</span>
          <i style={{ width: Math.round(r.confidence * 100) + "%" }} />
          <em>отрыв лучшего совпадения + твои подтверждения</em>
        </div>
        {r.frames.length > 0 && <div className="as-frames">{r.frames.map(f => (
          <span key={f.id} className="as-frame" title={f.why}><b>{f.label}</b><i>{f.ops.join(",")}</i></span>))}</div>}
        <div className="as-ops">
          {r.ops.map(o => <button key={o} className="as-op on" onClick={() => onForce(r.ops.filter(x => x !== o))}><b>{o}</b><i>{OPS[o]?.label}</i></button>)}
          {r.ambiguous.map(a => <button key={a.op} className="as-op amb" onClick={() => onForce([...r.ops, a.op])}><b>{a.op}</b><i>{OPS[a.op]?.label}</i><em>спорно</em></button>)}
          {!r.ops.length && <span className="as-none">Ничего не распознано — уточни или подтверди трактовку.</span>}
        </div>
        <div className="as-mini">
          <button className="as-btn" onClick={() => setWhy(v => !v)}>{why ? "скрыть" : "почему так понято"}</button>
          <button className="as-btn" onClick={() => onTeach(r)}>выучить трактовку</button>
          {r.unknown.length > 0 && <span className="as-unk">не распознано: {r.unknown.join(", ")}</span>}
        </div>
        {why && (
          <table className="as-ev"><thead><tr><th>операция</th><th>BM25</th><th>рамки</th><th>память</th><th>модель</th><th>итог</th></tr></thead>
            <tbody>{r.cand.map(c => <tr key={c.op}><td><code>{c.op}</code></td><td>{c.bm.toFixed(2)}</td><td>{c.frame.toFixed(2)}</td>
              <td>{c.mem.toFixed(2)}</td><td>{c.learn.toFixed(2)}</td><td><b>{c.score.toFixed(2)}</b></td></tr>)}</tbody></table>
        )}
        {r.question && (
          <div className="as-ask"><b>{r.question.text}</b><p>{r.question.why}</p>
            <div className="as-ask-b">{r.question.options.map(o => <button key={o.op} className="as-btn primary" onClick={() => onAnswer(r, o.op)}>{o.label}</button>)}</div></div>
        )}
        <div className={"as-verdict " + r.verdict.verdict}>
          {r.verdict.verdict === "no" ? "В заданном виде нельзя" : r.verdict.verdict === "probe" ? "Можно, но нужен дамп" : r.verdict.verdict === "ok" ? "Реализуемо" : "Нечего проверять"}
        </div>
        <div className="as-items">{r.verdict.items.map((it, i) => (
          <div key={i} className={"as-item " + it.level}><header><span>{LV[it.level]}</span><code>{it.op}</code></header><p>{it.why}</p></div>))}</div>

        <div className="as-lab">Варианты из изученного <span className="as-mono">{viable.length} допустимых · {r.variants.rows.length} всего</span>
          {viable.length > 1 && <button className="as-btn" onClick={() => setCmp(v => !v)}>{cmp ? "карточки" : "сравнить"}</button>}</div>
        {r.variants.why && <p className="as-why ok">Лучший выигрывает за счёт: {r.variants.why}.</p>}
        {cmp ? (
          <table className="as-ev cmp"><thead><tr><th>вариант</th><th>происхождение</th>{Object.values(CRITERIA).map(c => <th key={c}>{c}</th>)}<th>итог</th></tr></thead>
            <tbody>{r.variants.rows.map(v => (
              <tr key={v.id} className={v.score < 0 ? "bad" : v === r.variants.best ? "ok" : ""}>
                <td><code>{v.title}</code></td><td>{ORIGIN[v.origin]}</td>
                {Object.keys(CRITERIA).map(k => <td key={k}>{v.parts ? v.parts[k].toFixed(2) : "—"}</td>)}
                <td><b>{v.score < 0 ? "нельзя" : (v.score * 100).toFixed(0) + "%"}</b></td></tr>))}</tbody></table>
        ) : (
          <div className="as-vars">{r.variants.rows.map(v => (
            <VariantCard key={v.id} v={v} best={v === r.variants.best} onPick={onPick} onAccept={onAccept} onApply={onApply} onNav={onNav} />))}</div>
        )}

        <div className="as-foot">
          <button className="as-btn" onClick={() => setTrace(v => !v)}>{trace ? "скрыть" : "ход рассуждения"} ({r.trace.length})</button>
          <button className="as-btn" onClick={() => setEv(v => !v)}>{ev ? "скрыть" : "основания"} ({r.evidence.length})</button>
          <span className="as-fb">Понял верно?</span>
          <button className="as-btn up" onClick={() => onFeedback(r, 1)}>👍</button>
          <button className="as-btn down" onClick={() => onFeedback(r, -1)}>👎</button>
        </div>
        {trace && <ol className="as-trace">{r.trace.map(t => (
          <li key={t.id}><b>{t.title}</b><span>{t.detail}</span>
            {t.data && (Array.isArray(t.data) ? <ul>{t.data.map((d, i) => <li key={i}>{d}</li>)}</ul> : <code>{t.data}</code>)}</li>))}</ol>}
        {ev && <table className="as-ev"><thead><tr><th>документ</th><th>тип</th><th>BM25</th><th>источник</th><th>доверие</th><th></th></tr></thead>
          <tbody>{r.evidence.map(e => <tr key={e.doc.id}><td><code>{e.doc.title}</code></td><td>{e.doc.kind}</td><td>{e.score.toFixed(2)}</td>
            <td>{SRC[e.doc.meta.src] || e.doc.meta.src}</td><td>{Math.round(e.doc.trust * 100)}%</td>
            <td><button className="as-btn" onClick={() => onNav(routeFor(e.doc))}>открыть</button></td></tr>)}</tbody></table>}
      </div>
    </article>
  );
}

export default function Assistant({ onNav }) {
  const [q, setQ] = useState("");
  const [ctx, setCtx] = useState({ target: "original", transport: "tcp", name: "my_ai", payload: "tls_client_hello" });
  const [cfgText, setCfgText] = useState(() => { const c = getConfig(); if (!c.trim()) { setConfig(SEED_CONFIG); return SEED_CONFIG; } return c; });
  const [turns, setTurns] = useState(() => [{ key: 0, res: interpret(SEED) }]);
  const [ls, setLs] = useState(L.stats);
  const [ex, setEx] = useState(null);
  const [panel, setPanel] = useState("study");
  const [pi, setPi] = useState(0);
  const [applied, setApplied] = useState(null);
  const [toast, setToast] = useState(null);
  const endRef = useRef(null), fileRef = useRef(null);

  useEffect(() => L.subscribe(() => setLs(L.stats())), []);
  useEffect(() => vaultSub(() => { rebuild(); setLs(L.stats()); }), []);
  useEffect(() => onConfig(() => { setCfgText(getConfig()); rebuild(); }), []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  const eng = useMemo(() => engine(), [cfgText, ls.events]);
  const ss = studyStats();
  const sm = studyMap();
  const cfg = useMemo(() => parseConfig(cfgText), [cfgText]);

  const ask = text => { const p = (text ?? q).trim(); if (!p) return; setTurns(t => [...t, { key: Date.now(), res: interpret(p, ctx) }]); setQ(""); };
  const refresh = (turn, ops, c = turn.res.ctx) => setTurns(ts => ts.map(t => t.key === turn.key ? { ...t, res: { ...interpret(t.res.phrase, c, ops), ops } } : t));
  const fb = (turn, sign) => { feedback(turn.res, sign); setLs(L.stats()); setToast({ msg: sign > 0 ? "Выучил: веса повышены" : "Выучил: веса понижены" }); };
  const ans = (turn, op) => { const ops = answer(turn.res, op); refresh(turn, ops); setLs(L.stats()); };
  const pick = (turn, v) => { setCtx(v.ctx); refresh(turn, v.ops, v.ctx); setToast({ msg: `Замысел уточнён под «${v.title}»` }); };
  const accept = v => { if (!v.build) return; const it = addItem({ file: v.build.name + ".lua", text: v.build.code, tags: ["из ассистента"], note: v.source || "" }); rebuild(); setToast({ msg: `${it.file} создан`, go: "myapi" }); };
  const apply = (v, mode) => {
    if (!cfg.found) { setToast({ msg: "Конфиг не разобран — открой «Прогон конфига»" }); return; }
    const prev = cfgText;
    const next = applyVariant(cfg, Math.min(pi, cfg.profiles.length - 1), v, mode);
    setConfig(next); setCfgText(next); setApplied({ text: next, label: `${v.title} · ${mode === "new" ? "новый профиль" : mode === "replace" ? "замена цепочки" : "добавление в " + (cfg.profiles[pi]?.name || "")}` });
    setToast({ msg: "Конфиг обновлён", undo: () => { setConfig(prev); setCfgText(prev); setApplied(null); setToast(null); } });
  };

  return (
    <Page title="Локальный ассистент" desc="Изучает весь проект — руководства, C API, разборы, уроки исправлений, твои функции и рабочие профили конфига — и выдаёт несколько проверяемых вариантов с происхождением и оценкой.">
      <div className="as-stats">
        <span><b>{eng.docs.length}</b> документов изучено</span>
        <span><b>{ss.templates}</b> проверенных цепочек</span>
        <span><b>{ss.profiles}</b> профилей конфига</span>
        <span><b>{ls.events}</b> твоих подтверждений</span>
        <span><b>{eng.graph.nodes.size}</b> узлов графа</span>
      </div>

      <div className="as-tools">
        <label>К чему
          <select value={ctx.target} onChange={e => setCtx(c => ({ ...c, target: e.target.value }))}>
            <option value="original">оригиналу</option><option value="fake">приманке</option></select></label>
        <label>Транспорт
          <select value={ctx.transport} onChange={e => setCtx(c => ({ ...c, transport: e.target.value, payload: e.target.value === "udp" ? "quic_initial" : "tls_client_hello" }))}>
            <option value="tcp">TCP</option><option value="udp">UDP</option></select></label>
        <label>Профиль
          <select value={pi} onChange={e => setPi(+e.target.value)}>
            {cfg.profiles.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
            {!cfg.profiles.length && <option value={0}>нет профилей</option>}</select></label>
        <label>Имя<input value={ctx.name} onChange={e => setCtx(c => ({ ...c, name: e.target.value }))} /></label>
        <button className="as-btn" onClick={() => { rebuild(); setToast({ msg: `Перечитано: ${eng.docs.length} документов` }); }}>изучить заново</button>
        <button className="as-btn" onClick={() => setEx(exam())}>экзамен</button>
        <button className={"as-btn" + (panel === "study" ? " primary" : "")} onClick={() => setPanel(panel === "study" ? null : "study")}>карта изучения</button>
        <button className={"as-btn" + (panel === "learn" ? " primary" : "")} onClick={() => setPanel(panel === "learn" ? null : "learn")}>модель</button>
      </div>

      {panel === "study" && (
        <div className="as-panel">
          <div className="as-panel-h"><b>Что ассистент изучил</b><span>{ss.harvested} документов из проекта</span>
            <button className="as-btn" onClick={() => onNav?.("run")}>открыть конфиг</button></div>
          <div className="as-map">
            {Object.entries(sm.bySource).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <div key={k} className="as-map-i"><b>{n}</b><span>{k}</span></div>))}
          </div>
          <div className="as-lab">Проверенные цепочки из твоего конфига</div>
          <div className="as-tpls">
            {sm.templates.map((t, i) => (
              <div key={i} className="as-tpl">
                <div className="as-tpl-h"><code>{t.chain.map(c => c.fn).join(" → ")}</code><span>×{t.count}</span></div>
                <em>{t.profiles.join(" · ")}</em>
                <div className="as-tpl-o">{t.ops.map(o => <span key={o} className="as-chip sm">{o}</span>)}</div>
              </div>))}
            {!sm.templates.length && <p className="as-note">Конфиг не разобран.</p>}
          </div>
        </div>
      )}

      {panel === "learn" && (
        <div className="as-panel">
          <div className="as-panel-h"><b>Обученная модель</b><span>{ls.pos} за · {ls.neg} против · {ls.features} признаков</span>
            <button className="as-btn" onClick={() => { const r = L.consolidate(); setLs(L.stats()); rebuild(); setToast({ msg: `Консолидация: ${r.before} → ${r.after}` }); }}>консолидировать</button>
            <button className="as-btn" onClick={() => save(L.exportModel(), "ai-model.json", "application/json")}>экспорт</button>
            <button className="as-btn" onClick={() => fileRef.current?.click()}>импорт</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={async e => { const f = e.target.files[0]; if (!f) return; try { L.importModel(await f.text()); rebuild(); setLs(L.stats()); } catch { setToast({ msg: "Bad JSON" }); } }} />
            <button className="as-btn" onClick={() => { L.resetModel(); mem.reset(); rebuild(); setLs(L.stats()); }}>сброс</button></div>
          <p className="as-note">👍 повышает веса слов, биграмм и рамок для выбранных операций, 👎 понижает. Веса переносятся на новые фразы с теми же признаками.</p>
          {ls.features > 0 && <table className="as-ev"><thead><tr><th>признак</th><th>операция</th><th>вес</th></tr></thead>
            <tbody>{L.topWeights(14).map((w, i) => <tr key={i} className={w.w > 0 ? "ok" : "bad"}><td><code>{w.f}</code></td><td>{w.op}</td><td>{w.w.toFixed(2)}</td></tr>)}</tbody></table>}
          {L.contradictions().map((c, i) => (
            <div key={i} className="as-contra"><span><code>{c.f}</code> → <b>{c.op}</b>: за {c.p}, против {c.n}</span>
              <button className="as-btn" onClick={() => { L.resolve(c.f, c.op, true); rebuild(); setLs(L.stats()); }}>за</button>
              <button className="as-btn" onClick={() => { L.resolve(c.f, c.op, false); rebuild(); setLs(L.stats()); }}>против</button></div>))}
        </div>
      )}

      {ex && (
        <details className="as-exam" open>
          <summary>Экзамен · корпус {ex.authored.exact}/{ex.authored.n} · твои фразы {ex.own.exact}/{ex.own.n}</summary>
          <table className="as-ev"><thead><tr><th>группа</th><th>фраза</th><th>ожидалось</th><th>получено</th><th>пропуск</th></tr></thead>
            <tbody>{ex.rows.map((r, i) => <tr key={i} className={r.ok ? "ok" : "bad"}><td>{r.group}</td><td>{r.p}</td>
              <td>{r.want.join(",")}</td><td>{r.got.join(",") || "—"}</td><td>{r.miss.join(",") || "—"}</td></tr>)}</tbody></table>
          {ex.gaps.map((g, i) => <div key={i} className="as-contra"><span>{g.p} — не хватает {g.miss.join(",") || "—"}</span>
            <button className="as-btn" onClick={() => { teach(g.p, g.want); setLs(L.stats()); setEx(exam()); }}>выучить</button></div>)}
        </details>
      )}

      <div className="as-thread">
        {turns.map(t => <Turn key={t.key} r={t.res} onNav={onNav} onForce={ops => refresh(t, ops)} onFeedback={fb}
          onAnswer={ans} onPick={v => pick(t, v)} onAccept={accept} onApply={apply}
          onTeach={turn => { teach(turn.res.phrase, turn.res.ops); setLs(L.stats()); setToast({ msg: "Трактовка выучена" }); }} />)}
        <div ref={endRef} />
      </div>

      {applied && (
        <details className="as-applied" open>
          <summary>Конфиг после применения · {applied.label}</summary>
          <div className="as-act">
            <button className="as-btn primary" onClick={() => navigator.clipboard?.writeText(applied.text)}>копировать .bat</button>
            <button className="as-btn" onClick={() => save(applied.text, "config-patched.bat")}>скачать</button>
            <button className="as-btn" onClick={() => onNav?.("run")}>проверить прогоном</button>
            <button className="as-btn" onClick={() => setApplied(null)}>скрыть</button>
          </div>
          <Code label="config.bat">{applied.text}</Code>
        </details>
      )}

      <div className="as-input">
        <textarea value={q} onChange={e => setQ(e.target.value)} placeholder="Опиши замысел своими словами, можно абстрактно…"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <button className="as-btn primary" onClick={() => ask()}>разобрать</button>
      </div>
      <div className="as-ex">
        {["сдвиг инверсию запроса+сдвиг", "чтобы провайдер думал что это мусор", "сломать сигнатуру непредсказуемо", "копия должна умереть по пути", "переставить части наоборот с нахлёстом"].map(s => (
          <button key={s} className="as-chip" onClick={() => ask(s)}>{s}</button>))}
      </div>

      <details className="as-limits">
        <summary>Что изучено, как считается оптимальность и где предел</summary>
        <table className="kv"><tbody>
          <tr><td>Изучено</td><td>{ss.lore} записей руководств, {ss.cfuncs} C-функций с подводными камнями, {ss.deep} полных разборов, {ss.lessons} уроков исправлений, {ss.markers} маркеров, флаги, {ss.profiles} профилей и {ss.templates} проверенных цепочек, {ss.vault} твоих файлов, кластеры дубликатов.</td></tr>
          <tr><td>Варианты</td><td>Пять источников: проверенные цепочки твоего конфига, штатные стратегии, твои функции, синтез новых, гибрид приманка+разрез. Каждый несёт происхождение, основание и оценку.</td></tr>
          <tr><td>Оптимальность</td><td>Шесть критериев с весами: полнота замысла, реализуемость, проверенность, совпадение контекста, простота, твои подтверждения. Проверенное в бою обгоняет свежий синтез — это и есть оптимально.</td></tr>
          <tr><td>Обучение</td><td>Линейная модель на словах, биграммах и абстрактных рамках. Обобщает по признакам, а не понимает смысл. Экзамен меряет и корпус, и твои собственные фразы.</td></tr>
          <tr><td>Предел</td><td>Совсем новый словарь без общих слов и рамок не поймётся: движок покажет нераспознанное и спросит. Ответ станет обучающим примером.</td></tr>
          <tr><td>Чего нет</td><td>Языковой модели, генерации текста, внешних API. Всё локально, модель и память выгружаются в JSON.</td></tr>
        </tbody></table>
      </details>

      {toast && <div className="vt-toast"><span>{toast.msg}</span>
        {toast.undo && <button className="vt-btn vt-primary" onClick={toast.undo}>вернуть</button>}
        {toast.go && <button className="vt-btn vt-primary" onClick={() => onNav?.(toast.go)}>открыть</button>}
        <button className="vt-x" onClick={() => setToast(null)}>×</button></div>}
    </Page>
  );
}