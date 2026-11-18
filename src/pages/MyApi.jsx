import { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { collectMy, mdMy, KIND_GROUP } from "../lib/myDoc";
import { subscribe } from "../lib/vault";
import { KIND_RU } from "../lib/luadoc";
import { parseConfig, runConfig } from "../lib/configRun";
import { getConfig, onConfig } from "../lib/store";
import "../styles/myapi.css";

export const fns = collectMy().records.map(r => ({ name: r.name, ru: r.mech, kind: "custom", group: r.file }));
const MODES = [["file", "по файлу"], ["kind", "по типу"], ["state", "по состоянию"]];
const SEV = { crit: "критично", warn: "внимание", info: "заметка" };

function save(text, name, type) {
  const b = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Card({ r, open, onToggle, onNav, usage }) {
  const bad = r.pit.filter(p => p.level === "crit").length;
  const used = usage?.get(r.name) || [];
  return (
    <article className={"ma" + (open ? " open" : "")} id={"fn-" + r.name} style={{ "--ch": r.hue }}>
      <button className="ma-head" onClick={onToggle}>
        <span className="ma-dot" />
        <code className="ma-name">{r.name}</code>
        <span className="ma-sig">{r.sig}</span>
        <span className={"ma-kind k-" + r.kind}>{KIND_RU[r.kind]}</span>
        {r.local && <span className="ma-flag">local</span>}
        <span className="ma-flag own">своя</span>
        {used.length > 0 && <span className="ma-flag use">в {used.length} профилях</span>}
        {bad > 0 && <span className="ma-flag bad">{bad}</span>}
        <span className="ma-chev">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="ma-body">
          <div className="ma-src"><span>{r.file}</span>строка {r.line} · {r.size} строк тела</div>
          {r.lead && <p className="ma-lead">{r.lead}</p>}
          <div className="ma-lab">Механизм</div>
          <p className="ma-mech">{r.mech}</p>
          <Code copy={false}>{r.sig}</Code>

          {r.args.length > 0 && (
            <>
              <div className="ma-lab">Аргументы</div>
              <table className="ma-args"><thead><tr><th>аргумент</th><th>тип</th><th>по умолчанию</th><th>смысл</th></tr></thead>
                <tbody>{r.args.map(a => <tr key={a[0]}><td><code>{a[0]}</code></td><td>{a[1]}</td><td>{a[2]}</td><td>{a[3]}</td></tr>)}</tbody></table>
            </>
          )}

          <div className="ma-lab">Возврат</div>
          <div className="ma-ret">
            {(r.verdicts.length ? r.verdicts : ["nil"]).map(v => <span key={v} className={"ma-v v-" + v}>{v === "nil" ? "nil = PASS" : "VERDICT_" + v}</span>)}
            <span className="ma-ret-t">{r.ret}</span>
          </div>

          <div className="ma-lab">Гейты и защита</div>
          <div className="ma-grid">
            <div><b>транспорт</b><span>{r.gates.transport}</span></div>
            <div><b>направление</b><span>{r.gates.dir}</span></div>
            <div><b>пейлоад</b><span>{r.gates.payload}</span></div>
            <div><b>replay</b><span className={r.gates.replay ? "ok" : "warn"}>{r.gates.replay ? "защищено" : "нет"}</span></div>
            <div><b>cutoff</b><span className={r.gates.cutoff ? "ok" : "warn"}>{r.gates.cutoff ? "есть" : "нет"}</span></div>
            <div><b>reasm</b><span>{r.gates.reasm ? "использует" : "не нужен"}</span></div>
          </div>

          {r.steps.length > 0 && (
            <>
              <div className="ma-lab">Порядок работы</div>
              <ol className="ma-steps">{r.steps.map((s, i) => (
                <li key={i}><span className="ma-sn">{i + 1}</span><div><b>{s.t}</b><em>строка {s.n}</em><p>{s.d}</p></div></li>
              ))}</ol>
            </>
          )}

          {r.ex && <Code label={r.isDesync ? "пример вызова" : "пример использования"}>{r.ex}</Code>}
          {r.bat && <Code label="фрагмент .bat">{r.bat}</Code>}

          {used.length > 0 && (
            <>
              <div className="ma-lab">Где используется</div>
              <div className="ma-use">
                {used.map((u, i) => (
                  <a key={i} className="ma-chip own" href="#/run">
                    {u.profile}<i>#{u.index + 1}</i>
                    <em>{Object.entries(u.args).map(([k, v]) => v === true ? k : `${k}=${v}`).join(" ") || "без аргументов"}</em>
                  </a>
                ))}
              </div>
            </>
          )}
          {used.length === 0 && r.isDesync && !r.local && (
            <p className="ma-nouse">В сохранённом конфиге не используется. Открой «Прогон конфига», чтобы найти место вставки.</p>
          )}

          {r.pit.length > 0 && (
            <>
              <div className="ma-lab">Подводные камни</div>
              <ul className="ma-pit">{r.pit.map((p, i) => <li key={i} className={p.level}><span className="ma-sev">{SEV[p.level]}</span>{p.text}</li>)}</ul>
            </>
          )}
          {r.deps.length > 0 && (
            <div className="ma-rel"><span className="ma-lab inline">Опирается на штатный API</span>
              {r.deps.map(d => <a key={d} className="ma-chip" href="#/capi">{d}</a>)}</div>
          )}
          {r.rel.length > 0 && (
            <div className="ma-rel"><span className="ma-lab inline">Рядом</span>
              {r.rel.map(x => <a key={x.name + x.file} className="ma-chip own" href={"#fn-" + x.name}
                onClick={e => { e.preventDefault(); document.getElementById("fn-" + x.name)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{x.name}<i>{x.file}</i></a>)}</div>
          )}
          <div className="ma-act">
            <button onClick={() => onNav?.("vault")}>открыть в хранилище</button>
            <button onClick={() => onNav?.("history")}>история версий</button>
            <button onClick={() => onNav?.("run")}>где применить</button>
            <button onClick={() => save(mdMy([r], r.name), r.name + ".md", "text/markdown")}>карточка .md</button>
            <button onClick={() => navigator.clipboard?.writeText(location.origin + location.pathname + "#/myapi")}>ссылка</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function MyApi({ onNav, target }) {
  const [ver, setVer] = useState(0);
  const [cfgVer, setCfgVer] = useState(0);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("file");
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState({});
  useEffect(() => subscribe(() => setVer(v => v + 1)), []);
  useEffect(() => onConfig(() => setCfgVer(v => v + 1)), []);
  useEffect(() => { if (target) setOpen(o => ({ ...o, [target]: true })); }, [target]);

  const { records, files, docs } = useMemo(() => collectMy(), [ver]);
  const usage = useMemo(() => {
    const text = getConfig();
    if (!text.trim()) return new Map();
    const cfg = parseConfig(text);
    return cfg.found ? runConfig(cfg, docs).usage : new Map();
  }, [docs, cfgVer]);

  const s = q.trim().toLowerCase();
  const view = useMemo(() => records.filter(r =>
    !s || (r.name + " " + r.sig + " " + r.mech + " " + r.file + " " + r.args.map(a => a[0]).join(" ") + " " + r.pit.map(p => p.text).join(" ")).toLowerCase().includes(s)
  ), [records, s]);

  const groups = useMemo(() => {
    if (mode === "file") return files.map(f => ({ key: f.file, title: f.file, hue: f.hue, note: f.note, rows: view.filter(r => r.file === f.file) })).filter(g => g.rows.length);
    if (mode === "kind") return Object.entries(KIND_GROUP).map(([k, t]) => ({ key: k, title: t, hue: records.find(r => r.kind === k)?.hue || "#a78bfa", rows: view.filter(r => r.kind === k) })).filter(g => g.rows.length);
    return [
      { key: "bad", title: "Требуют внимания", hue: "#f87171", rows: view.filter(r => r.pit.some(p => p.level !== "info")) },
      { key: "soft", title: "Только заметки", hue: "#fbbf24", rows: view.filter(r => r.pit.length && r.pit.every(p => p.level === "info")) },
      { key: "ok", title: "Чистые", hue: "#4ade80", rows: view.filter(r => !r.pit.length) }
    ].filter(g => g.rows.length);
  }, [mode, view, files, records]);

  const isOpen = r => all || !!open[r.name] || (s.length >= 2 && view.length <= 8);
  const entry = records.filter(r => r.isDesync && !r.local).length;
  const warned = records.filter(r => r.pit.some(p => p.level !== "info")).length;
  const usedCount = records.filter(r => (usage.get(r.name) || []).length).length;

  return (
    <Page title="Мои функции → Lua" desc="Справочник собственного кода в том же формате, что и штатный C API: механизм, аргументы, возврат, гейты, порядок работы, пример, подводные камни и где функция реально используется.">
      <div className="stats">
        <span><b>{records.length}</b> функций</span>
        <span><b>{files.length}</b> файлов</span>
        <span><b>{entry}</b> desync-точек</span>
        <span><b>{usedCount}</b> в конфиге</span>
        <span className={warned ? "ma-hot" : ""}><b>{warned}</b> требуют внимания</span>
      </div>

      {records.length === 0 ? (
        <div className="ma-empty">
          <b>Своих функций пока нет.</b>
          <p>Вставь один или несколько .lua на вкладке приёма — они сразу станут текстом, разберутся и появятся здесь как полноценный справочник.</p>
          <button className="ma-primary" onClick={() => onNav?.("vault")}>перейти к приёму файлов</button>
        </div>
      ) : (
        <>
          <div className="ma-bar">
            <input className="search ma-search" placeholder="Поиск по имени, механизму, аргументам…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="ma-modes">{MODES.map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}</div>
            <button className={"ma-toggle" + (all ? " on" : "")} onClick={() => { setAll(v => !v); setOpen({}); }}>{all ? "свернуть всё" : "развернуть всё"}</button>
            <button className="ma-toggle" onClick={() => save(mdMy(records), "my-lua-api.md", "text/markdown")}>справочник .md</button>
            <span className="ma-count">{view.length} показано</span>
          </div>
          {!getConfig() && <p className="note">Конфиг не сохранён — обратный индекс «где используется» пуст. Открой «Прогон конфига» и вставь свой .bat: он сохранится автоматически.</p>}
          <div className="ma-cats">
            {groups.map(g => (
              <button key={g.key} className="ma-cat" style={{ "--ch": g.hue }}
                onClick={() => document.getElementById("grp-" + g.key)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <span className="ma-dot" />{g.title}<i>{g.rows.length}</i>
              </button>
            ))}
          </div>
          {groups.map(g => (
            <section key={g.key} className="ma-group" id={"grp-" + g.key} style={{ "--ch": g.hue }}>
              <h2><span className="ma-dot big" />{g.title}<span className="count">{g.rows.length}</span></h2>
              {mode === "file" && g.note && <p className="ma-gnote">{g.note}</p>}
              {g.rows.map(r => <Card key={r.file + r.name} r={r} open={isOpen(r)} onNav={onNav} usage={usage}
                onToggle={() => setOpen(o => ({ ...o, [r.name]: !o[r.name] }))} />)}
            </section>
          ))}
          {!view.length && <p className="note">Ничего не найдено — сбрось запрос.</p>}
        </>
      )}
    </Page>
  );
}