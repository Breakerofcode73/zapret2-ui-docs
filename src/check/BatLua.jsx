import { useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import { checkBundle, kindOf, sniff } from "../lib/checkBundle";
import { parseProfile, DEFAULT_PROFILE } from "../lib/checkBat";
import { loadRegistry } from "../data/flags";
import { splitFiles, looksLikeCode } from "../lib/intake";
import { save } from "../lib/pack";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";
import "../styles/builder.css";
import "../styles/checkers.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const LIBFNS = new Set([...lib, ...antidpi, ...auto].map(f => f.name));
const LV = { crit: "критично", warn: "warning", info: "замечание" };

const SAMPLE = [
  { file: "start.bat", text: `@echo off
chcp 65001 >nul
start /min "" "%~dp0winws2.exe" --wf-tcp-out=80,443 ^
 --lua-init=@"%~dp0luazapret-antidpi.lua" ^
 --lua-init=@"%~dp0luazapret-lib.lua" ^
 --lua-init=@"%~dp0my_probe.lua" ^
 --lua-init=@"%~dp0ghost.lua" ^
 --lua-desync=my_fake:ttl=6:mode=fast ^
 --lua-desync=my_shift ^
 --lua-desync=lost_fn ^
 --lua-desync=tls_client_hello_clone:blob=fake_custom` },
  { file: "my_probe.lua", text: `function my_fake(ctx, desync)
    local opts = desync_opts(desync)
    local ttl = tonumber(desync.arg.ttl) or 8
    local dis = deepcopy(desync.dis)
    if dis.ip then dis.ip.ip_ttl = ttl end
    rawsend_dissect(dis, opts.rawsend, opts.reconstruct)
    return VERDICT_PASS
end

function my_shift(ctx, desync)
    local dis = deepcopy(desync.dis)
    dis.tcp.th_seq = dis.tcp.th_seq - tonumber(desync.arg.shift)
    rawsend_dissect(dis, desync_opts(desync).rawsend, {})
    return VERDICT_PASS
end` },
  { file: "unused.lua", text: `function orphan_fn(ctx, desync)
    return VERDICT_PASS
end` }
];

export default function BatLua() {
  const [files, setFiles] = useState([]);
  const [paste, setPaste] = useState("");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [level, setLevel] = useState("all");
  const [over, setOver] = useState(false);
  const ref = useRef(null);
  const reg = useMemo(loadRegistry, []);

  const addFiles = list => setFiles(prev => {
    const map = new Map(prev.map(f => [f.file, f]));
    list.forEach(f => { if (f.text && f.text.trim()) map.set(f.file, { file: f.file, text: f.text, kind: f.kind }); });
    return [...map.values()];
  });
  const readFiles = async list => {
    const arr = [];
    for (const f of list) arr.push({ file: f.name, text: await f.text(), kind: kindOf(f.name, "") });
    addFiles(arr);
  };
  const takePaste = text => {
    if (!text.trim() || !looksLikeCode(text)) return false;
    const parts = splitFiles(text).map(p => {
      const ext = /\.(bat|cmd)$/i.test(p.file) ? "bat" : /\.lua$/i.test(p.file) ? "lua" : null;
      const k = sniff(p.text) || ext || "lua";
      const file = k === "bat" && !/\.(bat|cmd)$/i.test(p.file) ? p.file.replace(/\.\w+$/, "") + ".bat"
        : k === "lua" && /\.(bat|cmd)$/i.test(p.file) ? p.file.replace(/\.\w+$/, "") + ".lua" : p.file;
      return { file, text: p.text, kind: k };
    });
    if (!parts.length) return false;
    addFiles(parts);
    return true;
  };

  const bundle = useMemo(() => files.length
    ? checkBundle(files, { registry: reg, known: KNOWN, libFns: LIBFNS, profile: parseProfile(profile) })
    : null, [files, reg, profile]);

  const match = i => level === "all" || i.level === level;
  const cross = (bundle?.cross || []).filter(match);

  const reportText = () => {
    if (!bundle) return "дефектов нет";
    const L = ["# Проверка BAT + Lua", `Файлов: ${files.length}. Итог: ${bundle.totals.crit} критично, ${bundle.totals.warn} warning, ${bundle.totals.info} замечаний.`, ""];
    const line = i => `[${i.id}/${LV[i.level]}] ${i.file ? i.file + ":" : ""}строка ${i.line}: ${i.msg}${i.fix ? "\n  → " + i.fix : ""}`;
    L.push("## Связки BAT ↔ Lua");
    L.push(...(bundle.cross.length ? bundle.cross.map(line) : ["— нет"]), "");
    bundle.reports.forEach(r => {
      L.push(`## ${r.file} (${r.kind})`);
      L.push(...(r.res.issues.length ? r.res.issues.map(line) : ["— дефектов нет"]), "");
    });
    return L.join("\n");
  };

  return (
    <Page title="Проверка BAT + Lua" desc="Совместная проверка сборки: .bat и все его .lua одним набором. Каждый файл проверяется отдельно, затем сверяются связки: lua-init ↔ файлы, lua-desync ↔ функции, аргументы и блобы. Код не исполняется и никуда не отправляется.">
      <div className={"chk-drop" + (over ? " over" : "")}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) readFiles(f); }}>
        <textarea className="chk-ta" spellCheck={false} value={paste}
          placeholder={"Перетащи сюда .bat и .lua разом, или вставь текст нескольких файлов — они распознаются автоматически.\n\nПоддерживаются: файлы, блоки ```, заголовки -- имя.lua и формат «## The content from File:»."}
          onChange={e => setPaste(e.target.value)}
          onPaste={e => { const t = e.clipboardData?.getData("text") || ""; if (takePaste(t)) { e.preventDefault(); setPaste(""); } }} />
        <div className="chk-tools">
          <button onClick={() => ref.current?.click()}>открыть файлы</button>
          <input ref={ref} type="file" hidden multiple accept=".bat,.cmd,.lua,.txt,.md" onChange={e => { const f = [...e.target.files]; if (f.length) readFiles(f); e.target.value = ""; }} />
          <button onClick={() => { if (takePaste(paste)) setPaste(""); }}>распознать текст</button>
          <button onClick={() => { addFiles(SAMPLE); setPaste(""); }}>пример с дефектами</button>
          <button onClick={() => { setFiles([]); setPaste(""); }}>очистить всё</button>
          <span>в наборе: {files.length}</span>
          {files.length > 0 && <>
            <button onClick={() => navigator.clipboard?.writeText(reportText())}>копировать отчёт</button>
            <button onClick={() => save(reportText(), "zapret2-check.md", "text/markdown")}>скачать отчёт .md</button>
          </>}
        </div>
      </div>

      {files.length > 0 && (
        <div className="chk-bar">
          {files.map(f => (
            <button key={f.file} title="убрать из набора" onClick={() => setFiles(p => p.filter(x => x.file !== f.file))}>
              {(f.kind || kindOf(f.file, f.text)) === "bat" ? "▣" : "◈"} {f.file} ×
            </button>
          ))}
        </div>
      )}

      <details className="chk-profile"><summary>Профиль сборки (require / forbid) — применяется к каждому .bat</summary>
        <textarea className="chk-ta small" spellCheck={false} value={profile} onChange={e => setProfile(e.target.value)} />
      </details>

      {!bundle && <p className="note">Добавь .bat и его .lua — анализ запустится сам.</p>}

      {bundle && (
        <>
          <div className="chk-sum">
            {["crit", "warn", "info"].map(k => (
              <button key={k} className={"chk-pill " + k + (level === k ? " on" : "")} onClick={() => setLevel(level === k ? "all" : k)}>
                {bundle.totals[k]} {LV[k]}
              </button>
            ))}
            <span className="chk-meta">{files.length} файлов · {bundle.reports.reduce((s, r) => s + r.res.lines, 0)} строк</span>
          </div>

          <h2>Связки BAT ↔ Lua</h2>
          {cross.length === 0 ? <p className="chk-ok">Связки в порядке: все файлы на месте, функции и аргументы сходятся.</p> : (
            <div className="chk-list">
              {cross.map((x, i) => (
                <article key={i} className={"chk-item " + x.level}>
                  <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span>{x.file && <code>{x.file}</code>}<span className="chk-line">строка {x.line}</span></header>
                  <p className="chk-msg">{x.msg}</p>
                  {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                </article>
              ))}
            </div>
          )}

          <h2>Файлы набора</h2>
          {bundle.reports.map(r => {
            const list = r.res.issues.filter(match);
            const n = { crit: 0, warn: 0, info: 0 };
            r.res.issues.forEach(i => n[i.level]++);
            return (
              <details key={r.file} className="chk-profile" open={n.crit > 0}>
                <summary>{r.file} · {r.kind} · {r.res.lines} строк · {n.crit} крит / {n.warn} warn / {n.info} зам</summary>
                {list.length === 0 ? <p className="chk-ok">{r.res.issues.length ? "По выбранному фильтру пусто." : "Дефектов не найдено."}</p> : (
                  <div className="chk-list">
                    {list.map((x, i) => (
                      <article key={i} className={"chk-item " + x.level}>
                        <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                        <p className="chk-msg">{x.msg}</p>
                        {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </>
      )}
    </Page>
  );
}