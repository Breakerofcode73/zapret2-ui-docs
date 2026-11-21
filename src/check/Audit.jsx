import { useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { loadRegistry } from "../data/flags";
import { save } from "../lib/pack";
import { splitFiles } from "../lib/intake";
import { parseResults } from "../lib/strategyTest";
import { auditFiles, reportMd, LADDER } from "../lib/auditBat";
import "../styles/builder.css";
import "../styles/checkers.css";

const LV = { crit: "критично", warn: "warning", info: "замечание" };

export default function Audit({ onNav }) {
  const [files, setFiles] = useState([]);
  const [sel, setSel] = useState(0);
  const [resText, setResText] = useState("");
  const [paste, setPaste] = useState("");
  const ref = useRef(null);
  const reg = useMemo(loadRegistry, []);
  const rows = useMemo(() => parseResults(resText).rows, [resText]);
  const audit = useMemo(() => files.length ? auditFiles(files, { registry: reg, rows }) : null, [files, reg, rows]);
  const cur = audit?.reports[Math.min(sel, audit.reports.length - 1)] || null;

  const add = list => setFiles(prev => {
    const m = new Map(prev.map(f => [f.file, f]));
    list.forEach(f => { if (f.text && f.text.trim()) m.set(f.file, { file: f.file, text: f.text }); });
    return [...m.values()];
  });
  const readAll = async list => { const a = []; for (const f of list) a.push({ file: f.name, text: await f.text() }); add(a); };
  const t = audit?.totals;

  return (
    <Page title="Разбор всех BAT" desc="Выгрузи все .bat разом: каждый раскладывается на профили, получает дефекты, автоисправления и советы «что подправить» по структуре цепочки. Вставь zapret-test.json — советы станут точными по результатам прогона. Всё офлайн.">
      <div className="chk-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) readAll(f); }}>
        <textarea className="chk-ta small" spellCheck={false} value={paste}
          placeholder={"Перетащи сюда все .bat разом (или выбери файлы). Можно вставить текст нескольких файлов — распознаются автоматически."}
          onChange={e => setPaste(e.target.value)}
          onPaste={e => { const x = e.clipboardData?.getData("text") || ""; if (/winws2|@echo|--lua-/i.test(x)) { const p = splitFiles(x); if (p.length) { e.preventDefault(); add(p); setPaste(""); } } }} />
        <div className="chk-tools">
          <button onClick={() => ref.current?.click()}>выбрать все .bat</button>
          <input ref={ref} type="file" hidden multiple accept=".bat,.cmd,.txt" onChange={e => { const f = [...e.target.files]; if (f.length) readAll(f); e.target.value = ""; }} />
          <button onClick={() => { const p = splitFiles(paste); if (p.length) { add(p); setPaste(""); } }}>распознать текст</button>
          <button onClick={() => { setFiles([]); setSel(0); }}>очистить всё</button>
          <span>файлов: {files.length}</span>
          {audit && <button onClick={() => save(reportMd(audit), "zapret2-audit.md", "text/markdown")}>отчёт .md</button>}
          {audit && <button onClick={() => save(JSON.stringify(audit.reports.map(r => ({ file: r.file, defects: r.chk.issues, applied: r.fix.applied, strategies: r.strategies.map(s => ({ name: s.name, stage: s.stage, advice: s.advice, perf: s.perf })) })), null, 2), "zapret2-audit.json", "application/json")}>отчёт .json</button>}
        </div>
      </div>

      <details className="chk-profile"><summary>Результаты прогона (zapret-test.json / .csv) — уточняют советы</summary>
        <textarea className="chk-ta small" spellCheck={false} value={resText} placeholder="Вставь содержимое zapret-test.json из test-zapret.ps1…" onChange={e => setResText(e.target.value)} />
        <p className="chk-meta">строк прогона: {rows.length}{rows.length ? " — советы T001/T002/T003 активны" : ""}</p>
      </details>

      {!audit && <p className="note">Добавь .bat — разбор запустится сам.</p>}

      {audit && (
        <>
          <div className="chk-sum">
            <span className="chk-pill crit">{t.crit} критично</span>
            <span className="chk-pill warn">{t.warn} warning</span>
            <span className="chk-pill info">{t.info} замечаний</span>
            <span className="chk-meta">{t.files} файлов · {t.profiles} профилей · {t.autofix} автофиксов · {t.advice} советов · {t.dupes} дубликатов</span>
          </div>
          {t.missing.length > 0 && <p className="note">Не покрыты протоколы: {t.missing.join(", ")} — добавь профиль под них.</p>}

          <h2>Файлы</h2>
          <div className="chk-list">
            {audit.reports.map((r, i) => (
              <article key={r.file} className={"chk-item " + (r.n.crit ? "crit" : r.n.warn ? "warn" : "info")}>
                <header>
                  <b>{r.file}</b>
                  <span className="chk-line">{r.strategies.length} профилей · {r.n.crit}/{r.n.warn}/{r.n.info} · автофикс {r.fix.applied.length} · советов {r.adviceCount}</span>
                  <button className="chk-id" onClick={() => setSel(i)}>{i === sel ? "открыт" : "разбор"}</button>
                  <button className="chk-id" onClick={() => save(r.fix.text, r.file.replace(/\.(bat|cmd)$/i, "") + "-fixed.bat")}>скачать исправленный</button>
                </header>
              </article>
            ))}
          </div>

          {cur && (
            <>
              <h2>{cur.file} · что подправить</h2>
              {cur.fix.applied.length > 0 && (
                <div className="chk-list">
                  {cur.fix.applied.map((a, i) => (
                    <article key={i} className="chk-item info"><header><span className="chk-id">{a.id}</span><span className="chk-line">×{a.count}</span></header><p className="chk-msg">{a.title}</p></article>
                  ))}
                </div>
              )}
              {cur.strategies.length === 0 && <p className="note">В файле не найден запуск winws2 с профилями.</p>}
              {cur.strategies.map(s => (
                <article key={s.name} className="chk-item info" style={{ marginTop: 10 }}>
                  <header>
                    <b>{s.name}</b>
                    <span className="chk-pill info">ступень {s.stage < 0 ? "—" : s.stage}</span>
                    {s.perf.tested && <span className={"chk-pill " + (s.perf.ok.length ? "info" : "crit")}>{s.perf.ok.length} ок / {s.perf.bad.length} нет</span>}
                    <span className="chk-line">{s.advice.length} советов</span>
                  </header>
                  <p className="chk-fix"><b>Цепочка:</b> {s.args.filter(a => /^--lua-desync=/i.test(a)).map(a => a.slice(13)).join(" → ") || "нет инстансов"}</p>
                  <div className="chk-list" style={{ marginTop: 8 }}>
                    {s.advice.map((a, i) => (
                      <article key={i} className={"chk-item " + a.level}>
                        <header><span className="chk-id">{a.code}</span><span className="chk-lv">{LV[a.level]}</span></header>
                        <p className="chk-msg">{a.msg}</p>
                        {a.fix && <p className="chk-fix"><b>Подправить:</b> {a.fix}</p>}
                        {a.fix && <button className="chk-id" onClick={() => navigator.clipboard?.writeText(a.fix)}>копировать правку</button>}
                      </article>
                    ))}
                  </div>
                  {s.stage >= 0 && s.stage < 5 && (
                    <p className="chk-fix"><b>Следующая ступень ({LADDER[s.stage + 1].label}):</b> {LADDER[s.stage + 1].cmd}
                      <button className="chk-id" onClick={() => navigator.clipboard?.writeText(LADDER[s.stage + 1].cmd)}>копировать</button></p>
                  )}
                </article>
              ))}
              <h2>Исправленный {cur.file}</h2>
              <Code label="результат автоисправления" lines>{cur.fix.text}</Code>
              <div className="chk-bar">
                <button onClick={() => onNav?.("strategytest")}>прогнать через test-zapret.ps1</button>
                <button onClick={() => onNav?.("hostlists")}>собрать hostlist</button>
              </div>
            </>
          )}

          {audit.dupes.length > 0 && (
            <>
              <h2>Дубликаты стратегий · {audit.dupes.length}</h2>
              <div className="chk-list">
                {audit.dupes.map((d, i) => (
                  <article key={i} className="chk-item warn"><p className="chk-msg">{d.map(x => `${x.file} : ${x.name}`).join("  =  ")}</p>
                    <p className="chk-fix">Одинаковые цепочки и фильтры — оставь один профиль, остальные убери.</p></article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}