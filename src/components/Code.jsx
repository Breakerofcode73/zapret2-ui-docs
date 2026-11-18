import { useState } from "react";

export default function Code({ children, label, copy = true, lines = false }) {
  const code = String(children);
  const [ok, setOk] = useState(false);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 1200); } catch {}
  };
  return (
    <figure className="code">
      {label && <figcaption>{label}</figcaption>}
      {copy && <button className="copy" onClick={onCopy}>{ok ? "✓ скопировано" : "копировать"}</button>}
      <pre>{lines
        ? code.split("\n").map((l, i) => <span className="ln" key={i}><i>{i + 1}</i>{l + "\n"}</span>)
        : code}</pre>
    </figure>
  );
}