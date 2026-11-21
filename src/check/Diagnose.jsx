import { useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import { checkLua } from "../lib/checkLua";
import { checkBat, parseProfile, DEFAULT_PROFILE } from "../lib/checkBat";
import { loadRegistry } from "../data/flags";
import { getLua, setLua } from "../lib/store";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";
import "../styles/builder.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));
const LV = { crit: "критично", warn: "warning", info: "замечание" };
const SAMPLE = `function my_fake(ctx, desync)
    local opts = desync_opts(desync)
    opts.reconstruct.ip_ttl = 6
    local dis = deepcopy(desync.dis)
    dis.tcp.th_seq = dis.tcp.th_seq - 1
    rawsend_dissect(dis, opts.rawsend, opts.reconstruct)
    return VERDICT_PASS
end`;

export default function Diagnose({ onNav }) {
  const [tab, setTab] = useState("lua");
  const [code, setCode] = useState(getLua());
  const [bat, setBat] = useState("");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [file, setFile] = useState("");
  const [level, setLevel] = useState("all");
  const ref = useRef(null);
  const reg = useMemo(loadRegistry, []);

  const luaRes = useMemo(() => code.trim() ? checkLua(code, KNOWN) : null, [code]);
  const knownFns = useMemo(() => new Set([...antidpi.map(f => f.name), ...(luaRes?.functions || [])]), [luaRes]);
  const batRes = useMemo(() => bat.trim() ? checkBat(bat, { registry: reg, knownFns, profile: parseProfile(profile) }) : null, [bat, reg, knownFns, profile]);
  const res = tab === "lua" ? luaRes : batRes;
  const issues = (res?.issues || []).filter(i => level === "all" || i.level === level);
  const n = { crit: 0, warn: 0, info: 0 };
  (res?.issues || []).forEach(i => n[i.level]++);

  const read = async f => { if (!f) return; const t = await f.text(); setFile(f.name); tab === "lua" ? (setCode(t), setLua(t)) : setBat(t); };

  return (
    <Page title="Проверка ошибок" desc="Статический анализ своего Lua и .bat запуска. Код не исполняется и никуда не отправляется.">
      <div className="chk-tabs">
        <button className={tab === "lua" ? "on" : ""} onClick={() => setTab("lua")}>Lua</button>
        <button className={tab === "bat" ? "on" : ""} onClick={() => setTab("bat")}>BAT / сборка</button>
        <button className="chk-copy" onClick={() => { const t = tab === "lua" ? code : bat; navigator.clipboard?.writeText((res?.issues || []).map(i => `[${i.id}/${LV[i.level]}] строка ${i.line}: ${i.msg}\n  → ${i.fix || ""}`).join("\n") || "дефектов нет"); void t; }}>копировать отчёт</button>
      </div>

      <div className="bd-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(e.dataTransfer.files[0]); }}>
        <textarea className="bd-ta big" spellCheck={false} value={tab === "lua" ? code : bat}
          placeholder={tab === "lua" ? "Вставь свой .lua…" : "Вставь .bat запуска winws2…"}
          onChange={e => tab === "lua" ? (setCode(e.target.value), setLua(e.target.value)) : setBat(e.target.value)} />
        <div className="bd-drop-bar">
          <button onClick={() => ref.current?.click()}>открыть файл</button>
          <input ref={ref} type="file" hidden accept={tab === "lua" ? ".lua,.txt" : ".bat,.cmd,.txt"} onChange={e => read(e.target.files[0])} />
          <button onClick={() => tab === "lua" ? (setCode(SAMPLE), setLua(SAMPLE)) : setBat(`@echo off\nstart /min %~dp0winws2.exe --wf-tcp-out=80,443 ^\n --lua-init=@%~dp0lua\\zapret-antidpi.lua ^\n --lua-init=@%~dp0lua\\zapret-lib.lua ^\n --lua-desync=my_fake:ttl=6`)}>пример с дефектами</button>
          <button onClick={() => tab === "lua" ? (setCode(""), setLua("")) : setBat("")}>очистить</button>
          {file && <span className="bd-meta">{file}</span>}
          {tab === "lua" && <button className="bd-primary" onClick={() => { setLua(code); onNav?.("fixer"); }}>исправить автоматически</button>}
        </div>
      </div>

      {tab === "bat" && (
        <details className="bd-profile"><summary>Профиль сборки (require / forbid)</summary>
          <textarea className="bd-ta" spellCheck={false} value={profile} onChange={e => setProfile(e.target.value)} />
        </details>
      )}

      {res && (
        <>
          <div className="chk-sum">
            {["crit", "warn", "info"].map(k => (
              <button key={k} className={"chk-pill " + k + (level === k ? " on" : "")} onClick={() => setLevel(level === k ? "all" : k)}>{n[k]} {LV[k]}</button>
            ))}
            <span className="bd-meta">{issues.length} показано</span>
          </div>
          {issues.length === 0 ? <p className="chk-ok">Дефектов не найдено — каркас соблюдён.</p> : (
            <div className="chk-list">
              {issues.map((x, i) => (
                <article key={i} className={"chk-item " + x.level}>
                  <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                  <p className="chk-msg">{x.msg}</p>
                  {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {!res && <p className="note">Вставь код или открой файл — анализ запустится сам.</p>}
    </Page>
  );
}