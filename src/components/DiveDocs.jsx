import Code from "./Code";
import { Sec, Lines, Bug, Wire } from "./Deep";
import "../styles/dive.css";

export default function DiveDoc({ d, n }) {
  const k = d.kind || "desync";
  const id = s => d.id + "-" + s;
  return (
    <article className="dive" id={"dive-" + d.id}>
      <header className="dive-h">
        <span className="dive-n">{n}</span>
        <h2>{d.id}</h2>
        <span className={"tag " + k}>{k}</span>
        {d.old && <span className="tag old">{d.old}</span>}
        {d.std && <span className="dive-std">стандартные: {d.std}</span>}
      </header>

      {d.idea && <Sec id={id("idea")} n="1" title="Замысел"><p>{d.idea}</p></Sec>}

      {d.wire && <Sec id={id("wire")} n="2" title="Механизм на проводе"><Wire>{d.wire}</Wire></Sec>}

      {(d.args || d.api) && (
        <Sec id={id("api")} n="3" title="Аргументы и каждый вызов внутри">
          {d.args?.length > 0 && (
            <table className="kv"><tbody>
              {d.args.map(([a, t]) => <tr key={a}><td>{a}</td><td>{t}</td></tr>)}
            </tbody></table>
          )}
          {d.api?.length > 0 && (
            <table className="kv"><tbody>
              {d.api.map(([s, t]) => <tr key={s}><td>{s}</td><td>{t}</td></tr>)}
            </tbody></table>
          )}
        </Sec>
      )}

      {d.lines?.length > 0 && (
        <Sec id={id("lines")} n="4" title="Построчно: ключевые строки">
          <Lines items={d.lines} />
        </Sec>
      )}

      {d.traps?.length > 0 && (
        <Sec id={id("traps")} n="5" title="Подводные камни">
          {d.traps.map(([lvl, title, text], i) =>
            <Bug key={i} level={lvl} title={title}>{text}</Bug>)}
        </Sec>
      )}

      {d.use && <Sec id={id("use")} n="6" title="Правильное применение"><Code>{d.use}</Code></Sec>}
      {d.verify && <Sec id={id("verify")} n="7" title="Проверка"><Code>{d.verify}</Code></Sec>}

      {d.pattern?.length > 0 && (
        <Sec id={id("pattern")} n="8" title="Что взять в свой код">
          <ol className="check">{d.pattern.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </Sec>
      )}
    </article>
  );
}