import Code from "./Code";
import "../styles/deep.css";

export function Deep({ title, lead, tags, toc, children }) {
  return (
    <section className="deep">
      <header className="deep-h">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {tags && <div className="chips">{tags.map(t => <span key={t} className="tag c">{t}</span>)}</div>}
      </header>
      {toc && (
        <nav className="deep-toc">
          {toc.map(([id, label]) => <a key={id} className="chip" href={"#" + id}>{label}</a>)}
        </nav>
      )}
      {children}
    </section>
  );
}

export function Sec({ id, n, title, children }) {
  return (
    <section className="sec" id={id}>
      <h2><i>{n}</i>{title}</h2>
      {children}
    </section>
  );
}

export function Lines({ items, start = 1 }) {
  return (
    <div className="lines">
      {items.map(([code, text], i) => (
        <div className="line-row" key={i}>
          <span className="l-no">{start + i}</span>
          <code className="l-code">{code}</code>
          <span className="l-text">{text}</span>
        </div>
      ))}
    </div>
  );
}

export function Bug({ level = "crit", title, breaks, fix, children }) {
  const L = { crit: "критично", warn: "warning", info: "замечание" };
  return (
    <article className={"bug " + level}>
      <header><span className="bug-l">{L[level]}</span><b>{title}</b></header>
      {children && <p>{children}</p>}
      {breaks && <p className="bug-b"><b>Что ломается:</b> {breaks}</p>}
      {fix && <p className="bug-f"><b>Как правильно:</b> {fix}</p>}
    </article>
  );
}

export function Api({ name, sig, from, ret, children }) {
  return (
    <div className="api">
      <div className="api-h"><code>{name}</code><span className="api-from">{from}</span></div>
      {sig && <Code copy={false}>{sig}</Code>}
      {ret && <p className="api-ret"><b>Возвращает:</b> {ret}</p>}
      {children && <p>{children}</p>}
    </div>
  );
}

export function Wire({ children }) {
  return <pre className="wire">{children}</pre>;
}