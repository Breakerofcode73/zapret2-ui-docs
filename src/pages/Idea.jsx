import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { OPS, parseIdea, assess, reformulate, LIMITS } from "../lib/intent";
import { matchStrategies, synthesize } from "../lib/synth";
import { addItem } from "../lib/vault";
import { checkLua } from "../lib/checkLua";
import { fns as capi } from "./CApi";
import { fns as lib } from "./Lib";
import { fns as antidpi } from "./Antidpi";
import { fns as auto } from "./Auto";
import "../styles/idea.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const LV = { ok: "можно", warn: "с оговоркой", no: "нельзя", probe: "нужен эксперимент" };
const EXAMPLES = [
  "сдвиг инверсию запроса+сдвиг",
  "фейк с низким ttl и битой суммой, потом разрез внутри хоста в случайной точке",
  "разрез в обратном порядке с перекрытием sequence",
  "подмена адреса получателя у копии и занижение ttl",
  "увеличить длину udp пакета на 8 байт",
  "сдвиг timestamp у оригинала"
];

export default function Idea({ onNav }) {
  const [text, setText] = useState(EXAMPLES[0]);
  const [target, setTarget] = useState("original");
  const [transport, setTransport] = useState("tcp");
  const [resolve, setResolve] = useState({});
  const [name, setName] = useState("my_idea");
  const [toast, setToast] = useState(null);

  const parsed = useMemo(() => parseIdea(text), [text]);
  const ops = useMemo(() => [...new Set([...parsed.ops, ...Object.values(resolve)])], [parsed, resolve]);
  const ctx = { target, transport };
  const verdict = useMemo(() => assess(ops, ctx), [ops, target, transport]);
  const fixes = useMemo(() => reformulate(ops, ctx, verdict), [ops, target, transport, verdict]);
  const matches = useMemo(() => matchStrategies(ops, ctx), [ops, target, transport]);
  const build = useMemo(() => verdict.verdict === "no" || !ops.length ? null : synthesize(ops, ctx, name), [ops, target, transport, name, verdict]);
  const chk = useMemo(() => build ? checkLua(build.code, KNOWN) : null, [build]);

  const accept = () => {
    if (!build) return;
    const it = addItem({ file: build.name + ".lua", text: build.code, tags: ["из замысла"], note: "Замысел: " + text });
    setToast({ msg: `${it.file} создан и разобран`, id: it.id });
  };

  return (
    <Page title="Идея → функция" desc="Опиши замысел словами. Система разберёт его по словарю операций zapret2, скажет по каждой что можно и что нельзя и почему, подберёт готовую стратегию или соберёт новую из проверенных блоков.">
      <div className="id-in">
        <textarea className="id-ta" value={text} onChange={e => { setText(e.target.value); setResolve({}); }}
          placeholder="Например: фейк с низким ttl, потом разрез внутри хоста в случайной точке" />
        <div className="id-ex">{EXAMPLES.map((e, i) => <button key={i} className="id-chip" onClick={() => { setText(e); setResolve({}); }}>{e}</button>)}</div>
        <div className="id-ctx">
          <label>Изменения применяются к
            <select value={target} onChange={e => setTarget(e.target.value)}>
              <option value="original">оригиналу</option><option value="fake">приманке (копии)</option>
            </select></label>
          <label>Транспорт
            <select value={transport} onChange={e => setTransport(e.target.value)}>
              <option value="tcp">TCP</option><option value="udp">UDP</option>
            </select></label>
          <label>Имя функции<input value={name} onChange={e => setName(e.target.value)} /></label>
        </div>
      </div>

      <h2>Что понято из фразы <span className="count">{ops.length} операций</span></h2>
      <div className="id-ops">
        {ops.map(o => (
          <span key={o} className={"id-op" + (parsed.ops.includes(o) ? "" : " added")}>
            <b>{o}</b><i>{OPS[o]?.label || o}</i>
            {resolve[o] && <em>выбрано вручную</em>}
          </span>
        ))}
        {!ops.length && <p className="note">Из фразы не извлечено ни одной операции. Переформулируй через словарь ниже или выбери пример.</p>}
      </div>

      {parsed.ambiguous.map(a => (
        <div key={a.id} className="id-amb">
          <b>Двусмысленно: «{a.frag}» ×{a.hits}</b>
          <p>{a.why}</p>
          <div className="id-amb-b">
            {a.options.map(o => (
              <button key={o} className={"id-btn" + (resolve[a.id] === o ? " on" : "")} onClick={() => setResolve(r => ({ ...r, [a.id]: o }))}>
                {OPS[o].label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {parsed.unknown.length > 0 && (
        <div className="id-unk"><b>Не распознано:</b> {parsed.unknown.map(w => <code key={w}>{w}</code>)}
          <p>Эти слова не входят в словарь операций и не превращаются в код. Если имелось в виду действие — выбери его вручную ниже.</p>
          <div className="id-amb-b">{Object.keys(OPS).map(o => <button key={o} className={"id-btn" + (ops.includes(o) ? " on" : "")}
            onClick={() => setResolve(r => ({ ...r, ["m_" + o]: ops.includes(o) ? undefined : o }))}>{OPS[o].label}</button>)}</div>
        </div>
      )}

      <h2>Реализуемость</h2>
      {!verdict.items.length ? <p className="note">Нечего проверять: операции не выбраны.</p> : (
        <>
          <div className={"id-verdict " + verdict.verdict}>
            {verdict.verdict === "no" && <>Собрать нельзя: {verdict.blocking.length} операций нарушают протокол или конфликтуют.</>}
            {verdict.verdict === "probe" && <>Собрать можно, но {verdict.probes.length} операций требуют проверки дампом.</>}
            {verdict.verdict === "ok" && <>Все операции реализуемы. Можно собирать функцию.</>}
            {verdict.verdict === "empty" && <>Операции не выбраны.</>}
          </div>
          <div className="id-items">
            {verdict.items.map((it, i) => (
              <article key={i} className={"id-item " + it.level}>
                <header><span className="id-lv">{LV[it.level]}</span><code>{it.op}</code><i>{OPS[it.op]?.label}</i></header>
                <p>{it.why}</p>
                {it.refs.length > 0 && <div className="id-refs">Опора: {it.refs.map(r => <span key={r} className="id-chip sm">{r}</span>)}</div>}
              </article>
            ))}
          </div>
        </>
      )}

      {fixes.length > 0 && (
        <>
          <h2>Возможные переформулировки</h2>
          <div className="id-fixes">
            {fixes.map((f, i) => (
              <button key={i} className="id-fix" onClick={() => { setTarget(f.ctx.target); setTransport(f.ctx.transport); setResolve(Object.fromEntries(f.ops.map((o, k) => ["f" + k, o]))); }}>
                <b>{f.label}</b><span>{f.why}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>Готовое, что покрывает замысел <span className="count">{matches.length}</span></h2>
      {!matches.length ? <p className="note">Ни одна известная стратегия не покрывает выбранные операции — нужна новая функция.</p> : (
        <div className="id-match">
          {matches.map(m => (
            <div key={m.name + m.source} className="id-m">
              <div className="id-m-h">
                <code>{m.name}</code>
                <span className="id-src">{m.source === "antidpi" ? "штатная antidpi" : m.source}</span>
                <span className="id-score">{Math.round(m.score * 100)}%</span>
              </div>
              <div className="id-m-b">
                <span className="ok">покрывает: {m.covered.join(", ")}</span>
                {m.missing.length > 0 && <span className="miss">не покрывает: {m.missing.join(", ")}</span>}
                {m.extra.length > 0 && <span className="extra">лишнее: {m.extra.join(", ")}</span>}
              </div>
              <Code copy={false}>{`--lua-desync=${m.name}`}</Code>
            </div>
          ))}
        </div>
      )}
      {matches.length > 0 && matches[0].missing.length === 0 && (
        <div className="id-note ok"><b>Генерация не нужна.</b> Замысел полностью покрывается штатной стратегией — проверенный код надёжнее свежего. Возьми её и настрой аргументами.</div>
      )}

      <h2>Новая функция из замысла</h2>
      {!build ? (
        <p className="note">{verdict.verdict === "no" ? "Сборка заблокирована: сначала устрани операции с вердиктом «нельзя» или выбери переформулировку." : "Выбери хотя бы одну операцию."}</p>
      ) : (
        <>
          <div className="id-bar">
            <span className={"id-badge " + (chk.issues.some(i => i.level === "crit") ? "bad" : "ok")}>
              {chk.issues.length ? `${chk.issues.length} замечаний` : "каркас чист"}
            </span>
            <span className="id-mono">{build.code.split("\n").length} строк · {ops.length} операций</span>
            <button className="id-btn primary" onClick={accept}>принять в хранилище</button>
            <button className="id-btn" onClick={() => onNav?.("vault")}>открыть хранилище</button>
            <button className="id-btn" onClick={() => onNav?.("run")}>где применить</button>
          </div>
          <Code label={build.name + ".lua"} lines>{build.code}</Code>
          <Code label="подключение и вызов">{build.init + "\n" + build.cli}</Code>
          {chk.issues.length > 0 && (
            <div className="id-issues">{chk.issues.map((x, i) => (
              <div key={i} className={"id-issue " + x.level}><span>{x.id} · строка {x.line}</span>{x.msg}{x.fix && <i>{x.fix}</i>}</div>
            ))}</div>
          )}
        </>
      )}

      <h2>Границы метода</h2>
      <table className="kv"><tbody>{LIMITS.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>

      {toast && (
        <div className="vt-toast"><span>{toast.msg}</span>
          <button className="vt-btn vt-primary" onClick={() => { onNav?.("myapi"); setToast(null); }}>открыть справочник</button>
          <button className="vt-x" onClick={() => setToast(null)}>×</button></div>
      )}
    </Page>
  );
}