import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { save } from "../lib/pack";
import { getConfig, setConfig } from "../lib/store";
import { SERVICES, CATEGORIES } from "../data/domains";
import { matchServices, buildList, patchConfig } from "../lib/hostlist";
import "../styles/builder.css";
import "../styles/checkers.css";

const QUERIES = ["Хочу ютуб, дискорд и телеграм", "Нейросети: chatgpt и claude", "Соцсети и видео", "Разработка: github, docker", "Всё сразу"];

export default function Hostlists({ onNav }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const match = useMemo(() => query.trim().length >= 2 ? matchServices(query) : [], [query]);
  const selected = useMemo(() => SERVICES.filter(s => picked.includes(s.id)), [picked]);
  const list = useMemo(() => buildList(selected, custom), [selected, custom]);
  const listText = list.join("\n");
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const addMatched = () => setPicked(p => [...new Set([...p, ...match.map(h => h.s.id)])]);
  const applyToConfig = () => { const r = patchConfig(getConfig(), "list.txt"); setConfig(r.text); onNav?.("run"); };

  return (
    <Page title="Списки доменов" desc="Опиши, что нужно получить — проект подберёт сервисы и соберёт hostlist под --hostlist. Домены загружены в проект как офлайн-каталог; zapret сам включает поддомены. Список сохраняется в list.txt рядом с .bat.">
      <div className="chk-drop">
        <textarea className="chk-ta small" spellCheck={false} value={query}
          placeholder="Что нужно открыть? Например: «ютуб, дискорд, chatgpt и соцсети»"
          onChange={e => setQuery(e.target.value)} />
        <div className="chk-bar">{QUERIES.map(q => <button key={q} onClick={() => setQuery(q)}>{q}</button>)}</div>
      </div>

      {match.length > 0 && (
        <>
          <h2>Найдено по запросу · {match.length}</h2>
          <div className="chk-bar">
            <button onClick={addMatched}>добавить всё найденное</button>
            {match.map(h => (
              <button key={h.s.id} className={picked.includes(h.s.id) ? "bd-primary" : ""} onClick={() => toggle(h.s.id)}>
                {h.s.title}{picked.includes(h.s.id) ? " ✓" : ""}
              </button>
            ))}
          </div>
        </>
      )}

      <h2>Каталог сервисов · {SERVICES.length}</h2>
      {Object.entries(CATEGORIES).map(([cid, cname]) => {
        const items = SERVICES.filter(s => s.cat === cid);
        if (!items.length) return null;
        return (
          <details key={cid} className="chk-profile">
            <summary>{cname} · {items.length}</summary>
            <div className="chk-list">
              {items.map(s => (
                <article key={s.id} className={"chk-item " + (picked.includes(s.id) ? "info" : "")}>
                  <header>
                    <b>{s.title}</b>
                    <span className="chk-line">{s.domains.length} доменов</span>
                    <button className="chk-id" onClick={() => toggle(s.id)}>{picked.includes(s.id) ? "✓ выбран" : "добавить"}</button>
                  </header>
                  <p className="chk-fix">{s.domains.join(" · ")}</p>
                </article>
              ))}
            </div>
          </details>
        );
      })}

      <details className="chk-profile"><summary>Свои домены (добавятся к списку)</summary>
        <textarea className="chk-ta small" spellCheck={false} value={custom}
          placeholder="example.com, site.org — по одному или через запятую/пробел"
          onChange={e => setCustom(e.target.value)} />
      </details>

      <h2>Итоговый список · {list.length} доменов{selected.length ? ` · сервисов: ${selected.length}` : ""}</h2>
      {list.length === 0 ? <p className="note">Выбери сервисы из каталога или по запросу — список соберётся сам.</p> : (
        <>
          <Code label="list.txt" lines>{listText}</Code>
          <div className="chk-bar">
            <button onClick={() => save(listText, "list.txt")}>скачать list.txt</button>
            <button onClick={() => save(listText, "zapret-hosts-user.txt")}>скачать zapret-hosts-user.txt</button>
            <button onClick={() => navigator.clipboard?.writeText(listText)}>копировать список</button>
            <button onClick={() => navigator.clipboard?.writeText('--hostlist="%~dp0list.txt"')}>копировать флаг</button>
            <button onClick={applyToConfig}>вставить --hostlist в конфиг</button>
            <button onClick={() => { setPicked([]); setCustom(""); }}>сбросить</button>
          </div>
          <p className="note">Положи list.txt рядом с .bat и добавь <code>--hostlist="%~dp0list.txt"</code> в профиль (кнопка «вставить в конфиг» делает это автоматически и открывает «Прогон конфига»).</p>
        </>
      )}
    </Page>
  );
}