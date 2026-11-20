import { useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { fixBat } from "../lib/fixBat";
import { loadRegistry } from "../data/flags";
import { save } from "../lib/pack";
import { setConfig } from "../lib/store";
import "../styles/builder.css";
import "../styles/checkers.css";

const LV = { crit: "критично", warn: "warning", info: "замечание" };
const SAMPLE = `@echo off
start /min %~dp0winws2.exe --wf-tcp-out=80,443 ^
 --lua-init=@%~dp0lua\\zapret-antidpi.lua ^
 --lua-init=@%~dp0lua\\zapret-lib.lua ^
 --filter-tcp=80,443,8080 ^
 --lua-desync=my_fake:ttl=6:mode= ^
 --qnum=200`;

export default function FixBat({ onNav }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState("");
  const ref = useRef(null);
  const reg = useMemo(loadRegistry, []);
  const res = useMemo(() => text.trim() ? fixBat(text, { registry: reg }) : null, [text, reg]);
  const read = async f => { if (!f) return; setText(await f.text()); setFile(f.name); };
  const cnt = arr => { const c = { crit: 0, warn: 0, info: 0 }; arr.forEach(i => c[i.level]++); return c; };
  const nb = res ? cnt(res.before) : null, na = res ? cnt(res.after) : null;

  return (
    <Page title="Исправление BAT" desc="Автоисправление .bat запуска winws2 по тем же правилам, что и проверка ошибок (B-коды). Код не исполняется и никуда не отправляется. Что нельзя исправить безопасно — остаётся в списке замечаний.">
      <div className="bd-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(e.dataTransfer.files[0]); }}>
        <textarea className="bd-ta big" spellCheck={false} value={text} placeholder="Вставь .bat запуска winws2…"
          onChange={e => { setText(e.target.value); setFile(""); }} />
        <div className="bd-drop-bar">
          <button onClick={() => ref.current?.click()}>открыть файл</button>
          <input ref={ref} type="file" hidden accept=".bat,.cmd,.txt" onChange={e => read(e.target.files[0])} />
          <button onClick={() => { setText(SAMPLE); setFile("пример"); }}>пример с дефектами</button>
          <button onClick={() => { setText(""); setFile(""); }}>очистить</button>
          {file && <span className="bd-meta">{file}</span>}
        </div>
      </div>

      {!res && <p className="note">Вставь код или открой файл — исправления применятся автоматически.</p>}

      {res && (
        <>
          <div className="chk-sum">
            <span className="bd-meta">было:</span>
            {["crit", "warn", "info"].map(k => <span key={k} className={"chk-pill " + k}>{nb[k]} {LV[k]}</span>)}
            <span className="bd-meta">стало:</span>
            {["crit", "warn", "info"].map(k => <span key={k} className={"chk-pill " + k}>{na[k]} {LV[k]}</span>)}
          </div>

          <h2>Применённые исправления · {res.applied.length}</h2>
          {res.applied.length === 0 ? <p className="chk-ok">Автоисправления не потребовались.</p> : (
            <div className="chk-list">
              {res.applied.map((a, i) => (
                <article key={i} className="chk-item info">
                  <header><span className="chk-id">{a.id}</span><span className="chk-line">×{a.count}</span></header>
                  <p className="chk-msg">{a.title}</p>
                </article>
              ))}
            </div>
          )}

          <h2>Осталось вручную · {res.after.length}</h2>
          {res.after.length === 0 ? <p className="chk-ok">Дефектов не осталось — каркас соблюдён.</p> : (
            <div className="chk-list">
              {res.after.map((x, i) => (
                <article key={i} className={"chk-item " + x.level}>
                  <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                  <p className="chk-msg">{x.msg}</p>
                  {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                </article>
              ))}
            </div>
          )}

          <h2>Исправленный .bat</h2>
          <Code label="результат" lines>{res.text}</Code>
          <div className="chk-bar">
            <button onClick={() => setText(res.text)}>заменить исходник исправленным</button>
            <button onClick={() => save(res.text, file || "fixed.bat")}>скачать .bat</button>
            <button onClick={() => navigator.clipboard?.writeText(res.text)}>копировать</button>
            <button onClick={() => { setConfig(res.text); onNav?.("run"); }}>в «Прогон конфига»</button>
          </div>
        </>
      )}
    </Page>
  );
}