import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { checkBat } from "../lib/checkBat";
import { loadRegistry } from "../data/flags";
import { save } from "../lib/pack";
import { setConfig } from "../lib/store";
import { STRATEGIES, FAMILIES } from "../data/strategies";
import { matchRequest, assembleBat } from "../lib/strategy";
import "../styles/builder.css";
import "../styles/checkers.css";

const RISK = { 1: "низкий", 2: "средний", 3: "высокий" };
const RISKCLS = { 1: "info", 2: "warn", 3: "crit" };
const LV = { crit: "критично", warn: "warning", info: "замечание" };
const QUERIES = ["Ютуб тормозит и буферизит", "Дискорд: не работает голос", "Сайт по HTTP не открывается, редирект провайдера", "YouTube QUIC блокируется", "Универсальная стратегия для всего"];
const KNOWNFNS = new Set(STRATEGIES.flatMap(s => s.chain.map(c => c.fn)));

export default function Strategy({ onNav }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const reg = useMemo(loadRegistry, []);
  const match = useMemo(() => query.trim().length >= 2 ? matchRequest(query) : null, [query]);
  const list = useMemo(() => picked.map(id => STRATEGIES.find(s => s.id === id)).filter(Boolean), [picked]);
  const bat = useMemo(() => list.length ? assembleBat(list) : "", [list]);
  const check = useMemo(() => bat ? checkBat(bat, { registry: reg, knownFns: KNOWNFNS, profile: [] }) : null, [bat, reg]);
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const n = { crit: 0, warn: 0, info: 0 };
  (check?.issues || []).forEach(i => n[i.level]++);

  const Card = ({ s, extra }) => (
    <article className={"chk-item " + RISKCLS[s.risk]}>
      <header>
        <b>{s.title}</b>
        <span className={"chk-pill " + RISKCLS[s.risk]}>риск {RISK[s.risk]}</span>
        {extra}
        <button className="chk-id" onClick={() => toggle(s.id)}>{picked.includes(s.id) ? "✓ в сборке" : "добавить"}</button>
      </header>
      <p className="chk-msg">{s.desc}</p>
      <p className="chk-fix"><b>Цепочка:</b> {s.chain.map(c => c.fn).join(" → ")}</p>
    </article>
  );

  return (
    <Page title="Стратегия по запросу" desc="Опиши задачу своими словами — граф категорий подберёт стратегии из офлайн-каталога и соберёт готовый .bat с профилями. Все стратегии загружены в проект и видны ниже. Код не исполняется и никуда не отправляется.">
      <div className="chk-drop">
        <textarea className="chk-ta small" spellCheck={false} value={query}
          placeholder="Что не работает, где, какие симптомы… Например: «ютуб тормозит у ростелекома, видео буферизится»"
          onChange={e => setQuery(e.target.value)} />
        <div className="chk-bar">{QUERIES.map(q => <button key={q} onClick={() => setQuery(q)}>{q}</button>)}</div>
      </div>

      {match && match.intents.length > 0 && <p className="chk-meta">Распознано: {match.intents.map(i => i.label).join(" · ")}</p>}
      {match && match.hits.length > 0 && (
        <>
          <h2>Подобрано по запросу</h2>
          <div className="chk-list">
            {match.hits.map(h => <Card key={h.s.id} s={h.s} extra={<span className="chk-line">{h.pct}% · {h.path.join(" → ")}</span>} />)}
          </div>
        </>
      )}
      {match && !match.hits.length && <p className="note">Не распознал запрос — выбери из каталога ниже или уточни симптомы.</p>}

      {list.length > 0 && (
        <>
          <h2>Сборка · {list.length} профилей</h2>
          {check && (
            <details className="chk-profile" open={n.crit > 0}>
              <summary>Проверка сборки (checkBat): {n.crit} крит / {n.warn} warn / {n.info} зам</summary>
              {check.issues.length === 0 ? <p className="chk-ok">Дефектов не найдено.</p> : (
                <div className="chk-list">
                  {check.issues.map((x, i) => (
                    <article key={i} className={"chk-item " + x.level}>
                      <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                      <p className="chk-msg">{x.msg}</p>
                      {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                    </article>
                  ))}
                </div>
              )}
            </details>
          )}
          <Code label="zapret2-strategy.bat" lines>{bat}</Code>
          <div className="chk-bar">
            <button onClick={() => save(bat, "zapret2-strategy.bat")}>скачать .bat</button>
            <button onClick={() => navigator.clipboard?.writeText(bat)}>копировать</button>
            <button onClick={() => { setConfig(bat); onNav?.("run"); }}>в «Прогон конфига»</button>
            <button onClick={() => setPicked([])}>сбросить</button>
            <button onClick={() => save(JSON.stringify(STRATEGIES, null, 2), "zapret2-strategies.json", "application/json")}>каталог .json</button>
          </div>
          <h2>Что делает сборка</h2>
          <div className="chk-list">
            {list.map(s => (
              <article key={s.id} className="chk-item info">
                <header><b>{s.title}</b><span className="chk-line">профиль {s.id}</span></header>
                {s.chain.map((c, i) => <p key={i} className="chk-fix"><b>{c.fn}</b> — {c.note}</p>)}
              </article>
            ))}
          </div>
        </>
      )}
      {!list.length && <p className="note">Добавь одну или несколько стратегий — они соберутся в один .bat с профилями --new.</p>}

      <h2>Каталог стратегий · {STRATEGIES.length}</h2>
      {Object.entries(FAMILIES).map(([fid, fname]) => {
        const items = STRATEGIES.filter(s => s.family === fid);
        if (!items.length) return null;
        return (
          <details key={fid} className="chk-profile" open={fid === "fake"}>
            <summary>{fname} · {items.length}</summary>
            <div className="chk-list">{items.map(s => <Card key={s.id} s={s} />)}</div>
          </details>
        );
      })}
    </Page>
  );
}