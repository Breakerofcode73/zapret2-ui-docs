import Code from "./Code";

export const KIND = {
  desync: "desync", c: "C API", helper: "хелпер",
  iff: "iff-условие", timer: "таймер", guide: "гайд"
};

export default function Fn({ name, kind = "helper", ru, sig, args, std, ex, old, code }) {
  const signature = sig ?? (kind === "desync" ? `function ${name}(ctx, desync)` : null);
  return (
    <article className="fn" id={"fn-" + name}>
      <header>
        <h3>{name}</h3>
        <span className={"tag " + kind}>{KIND[kind]}</span>
        {old && <span className="tag old">{old}</span>}
      </header>
      {ru && <p>{ru}</p>}
      {signature && <Code copy={false}>{signature}</Code>}
      {args?.length > 0 && (
        <table className="args"><tbody>
          {args.map(([n, d]) => <tr key={n}><td><code>{n}</code></td><td>{d}</td></tr>)}
        </tbody></table>
      )}
      {std && <p className="std">стандартные аргументы: <span>{std}</span></p>}
      {ex && <Code label="пример вызова">{ex}</Code>}
      {code && <details><summary>исходник</summary><Code lines>{code}</Code></details>}
    </article>
  );
}

export function Jump({ fns }) {
  return (
    <div className="chips jump">
      {fns.map(f => (
        <button key={f.name} className="chip" onClick={() =>
          document.getElementById("fn-" + f.name)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          {f.name}
        </button>
      ))}
    </div>
  );
}