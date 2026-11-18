import { useEffect, useMemo, useRef, useState } from "react";
import Code from "./Code";
import { Sec, Bug, Api, Wire } from "./Deep";
import "../styles/deep.css";

const SECTIONS = [
  ["idea", "Замысел"], ["contract", "Контракт"], ["wire", "Механизм"], ["api", "API"],
  ["lines", "Построчно"], ["syntax", "Синтаксис"], ["bugs", "Ошибки"], ["fix", "Код"],
  ["test", "Проверка"], ["how", "Как писать"]
];

function LineExplorer({ blocks }) {
  const flat = useMemo(() => blocks.flatMap(b =>
    b.items.map(([code, text], i) => ({ code, text, block: b.title || "", no: (b.start || 1) + i }))
  ), [blocks]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  useEffect(() => { setSel(0); }, [q, blocks]);
  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? flat.filter(l => (l.code + " " + l.text).toLowerCase().includes(s)) : flat;
  }, [q, flat]);
  const idx = Math.min(sel, Math.max(0, view.length - 1));
  const cur = view[idx];
  const move = d => setSel(Math.max(0, Math.min(view.length - 1, idx + d)));

  return (
    <div className="lex" tabIndex={0} onKeyDown={e => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    }}>
      <div className="lex-bar">
        <input className="lex-find" placeholder="Фильтр по строкам…" value={q} onChange={e => setQ(e.target.value)} />
        <span className="lex-count">{view.length ? idx + 1 : 0} / {view.length}</span>
        <button className="lex-nav" onClick={() => move(-1)} disabled={idx <= 0}>↑</button>
        <button className="lex-nav" onClick={() => move(1)} disabled={idx >= view.length - 1}>↓</button>
      </div>
      {view.length === 0 ? <p className="lex-empty">Ни одна строка не совпала с фильтром.</p> : (
        <div className="lex-grid">
          <div className="lex-list">
            {view.map((l, i) => (
              <button key={i} className={"lex-row" + (i === idx ? " on" : "")} onClick={() => setSel(i)}>
                <i>{l.no}</i><code>{l.code}</code>
              </button>
            ))}
          </div>
          <div className="lex-panel">
            {cur.block && <div className="lex-block">{cur.block}</div>}
            <div className="lex-no">строка {cur.no}</div>
            <pre className="lex-code">{cur.code}</pre>
            <p className="lex-text">{cur.text}</p>
            <div className="lex-hint">↑ ↓ — переход по строкам</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeepDoc({ e, prev, next, onNav }) {
  const [active, setActive] = useState("idea");
  const root = useRef(null);

  useEffect(() => {
    setActive("idea");
    const els = SECTIONS.map(([id]) => document.getElementById("sec-" + id)).filter(Boolean);
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(x => x.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id.replace("sec-", ""));
    }, { rootMargin: "-110px 0px -65% 0px", threshold: 0 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [e.id]);

  const has = k => Array.isArray(e[k]) ? e[k].length > 0 : !!e[k];
  const shown = SECTIONS.filter(([id]) =>
    id === "idea" || id === "lines" || id === "fix" || id === "how" ? true : has(id === "contract" ? "args" : id));

  return (
    <section className="deep" ref={root}>
      <header className="deep-h">
        <div className="deep-kicker">полный разбор</div>
        <h1>{e.title}</h1>
        {e.lead && <p className="lead">{e.lead}</p>}
        {e.tags && <div className="chips">{e.tags.map(t => <span key={t} className="tag c">{t}</span>)}</div>}
      </header>

      <nav className="deep-toc">
        {shown.map(([id, label], i) => (
          <a key={id} className={"chip" + (active === id ? " spy-on" : "")} href={"#sec-" + id}
            onClick={ev => { ev.preventDefault(); document.getElementById("sec-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <i>{i + 1}</i>{label}
          </a>
        ))}
      </nav>

      <Sec id="sec-idea" n="1" title="Замысел">
        {(e.idea || []).map((p, i) => <p key={i}>{p}</p>)}
        {has("ideaTable") && <table className="kv"><tbody>
          {e.ideaTable.map(([k, v], i) => <tr key={i}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>}
        {e.ideaNote && <p className="note">{e.ideaNote}</p>}
      </Sec>

      {has("args") && (
        <Sec id="sec-contract" n="2" title="Контракт: сигнатура, аргументы, возврат">
          {e.sig && <Code copy={false}>{e.sig}</Code>}
          <table className="args4"><thead>
            <tr><th>аргумент</th><th>тип</th><th>по умолчанию</th><th>смысл</th></tr>
          </thead><tbody>
            {e.args.map(([n, t, d, s], i) => (
              <tr key={i}><td><code>{n}</code></td><td>{t}</td><td>{d}</td><td>{s}</td></tr>
            ))}
          </tbody></table>
          {e.std && <p className="std">стандартные наборы: <span>{e.std}</span></p>}
          {e.ret && <p className="api-ret"><b>Возвращает:</b> {e.ret}</p>}
        </Sec>
      )}

      {has("wire") && (
        <Sec id="sec-wire" n="3" title="Механизм: что уходит в провод">
          {e.wire.map((w, i) => <div key={i}>{w.caption && <p>{w.caption}</p>}<Wire>{w.diagram}</Wire></div>)}
          {e.wireNote && <p>{e.wireNote}</p>}
        </Sec>
      )}

      {has("api") && (
        <Sec id="sec-api" n="4" title="Каждый использованный вызов">
          {e.api.map((a, i) => <Api key={i} {...a}>{a.text}</Api>)}
        </Sec>
      )}

      <Sec id="sec-lines" n="5" title="Построчный разбор">
        <p className="lex-lead">Кликни строку слева — справа полное объяснение. Фильтр ищет и по коду, и по тексту.</p>
        <LineExplorer blocks={e.lines || []} />
      </Sec>

      {has("syntax") && (
        <Sec id="sec-syntax" n="6" title="Синтаксис: каждая конструкция">
          <table className="kv"><tbody>
            {e.syntax.map(([k, v], i) => <tr key={i}><td>{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </Sec>
      )}

      {has("bugs") && (
        <Sec id="sec-bugs" n="7" title="Ошибки и последствия">
          {e.bugs.map((b, i) => <Bug key={i} {...b}>{b.text}</Bug>)}
        </Sec>
      )}

      <Sec id="sec-fix" n="8" title={e.fixTitle || "Рабочий код"}>
        <Code lines>{e.fix || "-- код не задан"}</Code>
        {e.fixNote && <p className="note">{e.fixNote}</p>}
      </Sec>

      {has("test") && (
        <Sec id="sec-test" n="9" title="Проверка">
          <Code>{e.test}</Code>
          {e.testNote && <p>{e.testNote}</p>}
        </Sec>
      )}

      <Sec id="sec-how" n="10" title="Как писать функции этого класса">
        <ol className="check">{(e.how || []).map((h, i) => <li key={i}>{h}</li>)}</ol>
        {has("seeAlso") && <p className="see">Соседние: {e.seeAlso.map((s, i) =>
          <span key={i}>{i > 0 && ", "}<a href={"#/" + s.page}>{s.label}</a></span>)}</p>}
      </Sec>

      {(prev || next) && (
        <div className="deep-pager">
          {prev ? <button onClick={() => onNav("deep/" + prev.id)}>← {prev.id}</button> : <span />}
          <button className="dp-all" onClick={() => onNav("deep")}>все разборы</button>
          {next ? <button onClick={() => onNav("deep/" + next.id)}>{next.id} →</button> : <span />}
        </div>
      )}
    </section>
  );
}