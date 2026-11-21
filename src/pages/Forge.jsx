import { useState } from "react";
import Build from "../forge/Build";
import Smith from "../forge/Smith";
import Guide from "../forge/Guide";
import Assistant from "../forge/Assistant";

const TABS = [
  { id: "assist", label: "🧠 Ассистент" },
  { id: "build", label: "Сборка из блоков" },
  { id: "smith", label: "⚒ Ковка" },
  { id: "guide", label: "Как это работает" }
];

export default function Forge({ onNav }) {
  const [tab, setTab] = useState("assist");
  return (
    <div>
      <div className="forge-tabs">
        {TABS.map(t => (
          <button key={t.id} className={"forge-tab" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "assist" && <Assistant onNav={onNav} />}
      {tab === "build" && <Build onNav={onNav} />}
      {tab === "smith" && <Smith onNav={onNav} />}
      {tab === "guide" && <Guide onNav={onNav} />}
    </div>
  );
}
