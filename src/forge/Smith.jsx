import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RULES, SNIPPETS, SAMPLE_RANDOM, SAMPLE_FAKE, SKELETON, SEV_W, SEV_RU, CAT,
  lintLua, formatLua, diffLines, hl, clamp, Panel, SegTabs, StatChip, CodeView, Chip, Tg, Sld, download
} from "./shared";

const SNIP_TONE = { "Каркас": "#4dd6ff", "Рандом": "#f0abfc", "Сегментация": "#ffc23d", "Отправка": "#9ef01a", "Fooling": "#ff7a18", "Лимиты": "#2dd4bf", "UDP": "#a78bfa", "Отладка": "#b09a92" };

export default function Smith({ onNav, say, strike, spark, S, setS }) {
  const [sub, setSub] = useState("fix");
  const [docs, setDocs] = useState({ new: SKELETON, fix: SAMPLE_RANDOM });
  const [orig, setOrig] = useState(SAMPLE_RANDOM);
  const [sev, setSev] = useState("all");
  const [dq, setDq] = useState("");
  const [openDef, setOpenDef] = useState({});
  const [sq, setSq] = useState(""); const [scat, setScat] = useState("Все");
  const [log, setLog] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [forging, setForging] = useState(false);
  const [forgeN, setForgeN] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [over, setOver] = useState(false);
  const [caret, setCaret] = useState(1);

  const code = docs[sub];
  const setCode = useCallback(v => setDocs(d => ({ ...d, [sub]: v })), [sub]);
  const taRef = useRef(null), preRef = useRef(null), gutRef = useRef(null);
  const fileRef = useRef(null), forgeTimer = useRef(0), timers = useRef([]), sparkId = useRef(0);

  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(forgeTimer.current); }, []);

  const localSpark = useCallback((n = 12) => {
    const add = [];
    for (let i = 0; i < n; i++) {
      sparkId.current += 1;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.5, dist = 34 + Math.random() * 90;
      add.push({ id: sparkId.current, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist + 26, dur: 420 + Math.random() * 500, c: Math.random() > 0.5 ? "#ffc23d" : "#ff7a18" });
    }
    setSparks(s => [...s, ...add].slice(-40));
    const ids = add.map(a => a.id);
    const id = setTimeout(() => setSparks(s => s.filter(x => !ids.includes(x.id))), 950);
    timers.current.push(id);
  }, []);

  const findings = useMemo(() => {
    const r = [];
    RULES.forEach(rule => rule.find(code).forEach(h => r.push({ ...rule, key: rule.id + ":" + h.line, line: h.line, snippet: h.text })));
    lintLua(code).forEach(l => r.push({ ...l, key: l.id + ":" + l.line + ":" + l.title, snippet: code.split("\n")[l.line - 1] || "" }));
    return r.sort((a, b) => (SEV_W[b.sev] - SEV_W[a.sev]) || a.line - b.line);
  }, [code]);

  const health = useMemo(() => clamp(100 - findings.reduce((a, f) => a + SEV_W[f.sev], 0), 0, 100), [findings]);
  const fixable = findings.filter(f => f.fixable);
  const shown = useMemo(() => {
    const n = dq.trim().toLowerCase();
    return findings.filter(f => (sev === "all" || f.sev === sev) && (!n || (f.id + f.title + f.why + f.cat).toLowerCase().includes(n)));
  }, [findings, sev, dq]);
  const snips = useMemo(() => {
    const n = sq.trim().toLowerCase();
    return SNIPPETS.filter(s => (scat === "Все" || s.cat === scat) && (!n || (s.title + s.desc).toLowerCase().includes(n)));
  }, [sq, scat]);
  const diff = useMemo(() => sub === "fix" ? diffLines(orig, code) : [], [orig, code, sub]);
  const diffStat = { add: diff.filter(d => d.t === "+").length, del: diff.filter(d => d.t === "-").length };
  const fnName = (code.match(/function\s+([A-Za-z_]\w*)\s*\(\s*ctx/) || [, "my_fn"])[1];
  const healthColor = health >= 80 ? "var(--lime)" : health >= 50 ? "var(--gold)" : "var(--red)";

  const pushLog = (kind, text) => setLog(l => [...l.slice(-110), { kind, text, tm: new Date().toLocaleTimeString("ru-RU") }]);

  const applyRule = useCallback(rule => {
    const before = docs[sub], after = rule.apply(before);
    if (after === before) { pushLog("sk", `${rule.id} — изменений нет`); return; }
    setDocs(d => ({ ...d, [sub]: after }));
    pushLog("ok", `${rule.id} · ${rule.title}`);
    localSpark(14); strike("hit");
    say(`Выковано: ${rule.title}`, () => setDocs(d => ({ ...d, [sub]: before })));
  }, [docs, sub, say, strike, localSpark]);

  const forgeAll = useCallback(() => {
    if (forging) return;
    const snap = docs[sub];
    const list = RULES.filter(r => r.fixable && r.find(docs[sub]).length);
    if (!list.length) { say("Нечего ковать"); return; }
    setForging(true); setForgeN(0);
    let i = 0, cur = docs[sub], done = 0;
    const tick = () => {
      if (i >= list.length) {
        setForging(false); localSpark(26); strike("done");
        pushLog("ok", `Ковка завершена: ${done}`);
        say(`Выковано ${done} правок`, () => { setDocs(d => ({ ...d, [sub]: snap })); pushLog("er", "Ковка отменена"); });
        return;
      }
      const r = list[i++], next = r.apply(cur);
      if (next !== cur) { cur = next; done++; setDocs(d => ({ ...d, [sub]: cur })); pushLog("ok", `${r.id} · ${r.title}`); localSpark(11); strike("hit"); }
      else pushLog("sk", `${r.id} — уже исправлено`);
      setForgeN(i);
      forgeTimer.current = setTimeout(tick, 430 / S.speed);
    };
    tick();
  }, [forging, docs, sub, say, strike, localSpark, S.speed]);

  const loadText = (text, name) => {
    const clean = String(text).replace(/\r\n/g, "\n");
    setSub("fix"); setDocs(d => ({ ...d, fix: clean })); setOrig(clean); setOpenDef({}); setLog([]);
    pushLog("ok", `Загружен ${name} · ${clean.split("\n").length} строк`);
    say(`Загружено: ${name}`);
  };

  const insertSnippet = s => {
    const ta = taRef.current, cur = docs[sub];
    if (ta && typeof ta.selectionStart === "number") {
      const a = ta.selectionStart, b = ta.selectionEnd;
      const next = cur.slice(0, a) + s.code + cur.slice(b);
      setDocs(d => ({ ...d, [sub]: next }));
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a + s.code.length, a + s.code.length); });
    } else setDocs(d => ({ ...d, [sub]: cur + "\n" + s.code }));
    say(`Вставлено: ${s.title}`, () => setDocs(d => ({ ...d, [sub]: cur })));
    setDrawer(null);
  };

  const syncScroll = () => {
    const ta = taRef.current; if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutRef.current) gutRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  const onTaKey = e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget, a = ta.selectionStart, pad = " ".repeat(S.tab);
      setCode(code.slice(0, a) + pad + code.slice(ta.selectionEnd));
      requestAnimationFrame(() => ta.setSelectionRange(a + S.tab, a + S.tab));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sub === "fix" ? forgeAll() : setCode(formatLua(code, S.tab)); }
  };

  const bat = useMemo(() => {
    const cmd = ['start "zapret2" /min "%~dp0winws2.exe"', "--wf-tcp-out=80,443",
      '--lua-init=@"%~dp0lua\\zapret-lib.lua"', '--lua-init=@"%~dp0lua\\zapret-antidpi.lua"',
      `--lua-init=@"%~dp0${fnName}.lua"`, `--new=${fnName}`, `--name=${fnName}`,
      "--filter-tcp=443", "--filter-l7=tls", "--payload=tls_client_hello", "--out-range=-n30", `--lua-desync=${fnName}`];
    return ["@echo off", "chcp 65001 >nul", "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)", 'cd /d "%~dp0"', cmd.join(" ^\n ")].join("\n") + "\n";
  }, [fnName]);

  return (
    <div className="fg-stack">
      <Panel k="режим" title="Ковка" hue="#ff7a18"
        right={<>
          <SegTabs options={[{ id: "fix", label: "Исправление" }, { id: "new", label: "Новая функция" }]} value={sub} onChange={setSub} />
          <button className="fg-btn pri" onClick={forging ? () => { clearTimeout(forgeTimer.current); setForging(false); say("Ковка остановлена"); } : forgeAll}>
            {forging ? `■ стоп ${forgeN}` : `⚒ выковать ${fixable.length}`}
          </button>
        </>}>
        <div className="fg-stats">
          <StatChip cls="st" v={code.split("\n").length} label="строк" />
          <StatChip cls="rd" v={findings.filter(f => f.sev === "crit").length} label="критично" />
          <StatChip v={findings.filter(f => f.sev === "warn").length} label="warning" />
          <StatChip cls="vi" v={findings.filter(f => f.sev === "info").length} label="замечаний" />
          <StatChip cls="li" v={fixable.length} label="куётся авто" />
          {sub === "fix" && <StatChip cls="li" v={`+${diffStat.add}/−${diffStat.del}`} label="дифф" />}
        </div>
        <div className="fg-health">
          <span>здоровье</span>
          <span className="fg-hbar"><i style={{ width: health + "%", background: healthColor }} /></span>
          <span className="fg-hv" style={{ color: healthColor }}>{health}%</span>
        </div>
      </Panel>

      {sub === "fix" && (
        <Panel k="01" title="Заготовка" hue="#4dd6ff" right={<span className="fg-pill">{fnName}.lua</span>}>
          <div className={"fg-drop" + (over ? " over" : "")}
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) f.text().then(t => loadText(t, f.name)); }}>
            <b>Перетащи .lua сюда</b>
            <p>или выбери файл, или вставь код в редактор ниже.</p>
            <div className="fg-row-btn">
              <button className="fg-btn pri" onClick={() => fileRef.current?.click()}>выбрать файл</button>
              <input ref={fileRef} type="file" hidden accept=".lua,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(t => loadText(t, f.name)); e.target.value = ""; }} />
              <button className="fg-btn" onClick={() => loadText(SAMPLE_RANDOM, "random_split.lua")}>мой random_split</button>
              <button className="fg-btn" onClick={() => loadText(SAMPLE_FAKE, "fake_ip_misdirection.lua")}>мой fake_ip_misdirection</button>
              <button className="fg-btn dgr" onClick={() => { const s = code; setCode(orig); say("Возврат к исходнику", () => setCode(s)); }}>↺ исходник</button>
            </div>
          </div>
        </Panel>
      )}

      {sub === "new" && (
        <Panel k="01" title="Палитра заготовок" hue="#9ef01a" right={<span className="fg-pill">{snips.length}</span>}>
          <div className="fg-tools">
            <input className="fg-inp" style={{ flex: "1 1 190px" }} value={sq} onChange={e => setSq(e.target.value)} placeholder="Поиск заготовки…" />
            {["Все", ...Array.from(new Set(SNIPPETS.map(s => s.cat)))].map(c => (
              <Chip key={c} on={scat === c} onClick={() => setScat(c)}>{c}</Chip>
            ))}
          </div>
          <div className="fg-sgrid">
            {snips.map(s => (
              <article className="fg-sc" key={s.id} style={{ "--tc": SNIP_TONE[s.cat] || "#ff7a18" }}>
                <span className="fg-tag">{s.cat}</span><h4>{s.title}</h4><p>{s.desc}</p>
                <div className="fg-row-btn">
                  <button className="fg-btn sm pri" onClick={() => insertSnippet(s)}>вставить</button>
                  <button className="fg-btn sm" onClick={() => setDrawer({ kind: "snip", d: s })}>код</button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}

      <Panel k="02" title="Наковальня" hue="#ffc23d" right={<>
        <button className="fg-btn sm" onClick={() => setCode(formatLua(code, S.tab))}>отступы</button>
        <button className="fg-btn sm" onClick={async () => { try { await navigator.clipboard.writeText(code); say("Код скопирован"); } catch { say("Буфер недоступен"); } }}>копировать</button>
        <button className="fg-btn sm pri" onClick={() => download(code, fnName + ".lua")}>скачать .lua</button>
      </>}>
        <div className="fg-ed" data-hl={S.hl ? 1 : 0} data-wrap={S.wrap ? 1 : 0} style={{ "--fs": S.fs + "px", "--eh": S.eh + "px", "--tab": S.tab }}>
          <div className="fg-ed-body">
            {S.nums && <div className="fg-gut"><div className="fg-gut-in" ref={gutRef}>
              {code.split("\n").map((_, i) => <span key={i} className={findings.some(f => f.line === i + 1) ? "hot" : ""}>{i + 1}</span>)}
            </div></div>}
            <div className="fg-ed-stack">
              <pre className="fg-pre" ref={preRef} aria-hidden="true">
                {code.split("\n").map((l, i) => <span key={i} style={{ display: "block" }}>{S.hl ? hl(l) : l}{"\n"}</span>)}
              </pre>
              <textarea className="fg-ta" ref={taRef} value={code} spellCheck={false}
                onChange={e => setCode(e.target.value)} onScroll={syncScroll} onKeyDown={onTaKey}
                onKeyUp={e => setCaret(code.slice(0, e.currentTarget.selectionStart).split("\n").length)} aria-label="Редактор Lua" />
            </div>
          </div>
          <div className="fg-ed-foot">
            <span>строка {caret} · {code.split("\n").length} строк</span>
            <span>Tab — отступ · Ctrl+Enter — {sub === "fix" ? "ковать" : "форматировать"}</span>
          </div>
        </div>
      </Panel>

      <Panel k="03" title="Что нашёл ков" hue="#ff5470" right={<span className="fg-pill">{shown.length} / {findings.length}</span>}>
        <div className="fg-tools">
          <input className="fg-inp" style={{ flex: "1 1 180px" }} value={dq} onChange={e => setDq(e.target.value)} placeholder="Поиск дефекта…" />
          {[["all", "все"], ["crit", "критично"], ["warn", "warning"], ["info", "замечание"]].map(([k, l]) => (
            <Chip key={k} on={sev === k} onClick={() => setSev(k)}>{l}<u>{k === "all" ? findings.length : findings.filter(f => f.sev === k).length}</u></Chip>
          ))}
        </div>
        {findings.length === 0 ? <div className="fg-empty" style={{ color: "var(--lime)", borderColor: "var(--lime)" }}>Заготовка чистая.</div> : (
          <div className="fg-defs">
            {shown.map(f => (
              <article key={f.key} className={"fg-def " + f.sev + (openDef[f.key] ? " open" : "")} style={{ "--dc": CAT[f.cat] }}>
                <button className="fg-def-h" onClick={() => setOpenDef(o => ({ ...o, [f.key]: !o[f.key] }))} aria-expanded={!!openDef[f.key]}>
                  <span className="sev">{SEV_RU[f.sev]}</span><span className="cat">{f.cat}</span>
                  <b>{f.title}</b><span className="ln">{f.id} · строка {f.line}</span><span className="car">▶</span>
                </button>
                {openDef[f.key] && (
                  <div className="fg-def-b">
                    <p>{f.why}</p>
                    <div className="fg-snippet">{f.snippet}</div>
                    <div className="fg-row-btn">
                      {f.fixable && <button className="fg-btn sm pri" onClick={() => applyRule(RULES.find(r => r.id === f.id))}>⚒ выковать это</button>}
                      <button className="fg-btn sm" onClick={() => setDrawer({ kind: "rule", d: f })}>подробно</button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      {sub === "fix" && diffStat.add + diffStat.del > 0 && (
        <Panel k="04" title="Было → стало" hue="#9ef01a" right={<>
          <span className="fg-pill" style={{ color: "var(--lime)" }}>+{diffStat.add}</span>
          <span className="fg-pill" style={{ color: "var(--red)" }}>−{diffStat.del}</span>
        </>}>
          <div className="fg-dv">
            <table><tbody>
              {diff.map((d, i) => (
                <tr key={i} className={d.t === "+" ? "add" : d.t === "-" ? "del" : "eq"}>
                  <td className="n">{d.a || ""}</td><td className="n">{d.b || ""}</td>
                  <td className="s">{d.t === "+" ? "+ " : d.t === "-" ? "− " : "  "}{d.s}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </Panel>
      )}

      <Panel k="05" title="Журнал ковки" hue="#2dd4bf">
        <div className="fg-log">
          {log.length === 0 ? <div className="fg-log-empty">Журнал пуст.</div> : (
            <div className="fg-log-in">
              {log.map((l, i) => (
                <div key={i}><span className="tm">{l.tm}</span><span className={l.kind}>{l.kind === "ok" ? "✓" : l.kind === "sk" ? "·" : "✕"}</span><span className={l.kind}>{l.text}</span></div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel k="06" title="Забрать результат" hue="#ff7a18">
        <div className="fg-row-btn">
          <button className="fg-btn pri" onClick={() => download(code, fnName + ".lua")}>скачать .lua</button>
          <button className="fg-btn" onClick={() => download(bat, fnName + ".bat")}>скачать .bat</button>
          <button className="fg-btn" onClick={() => onNav?.("run")}>в прогон</button>
          <button className="fg-btn" onClick={() => onNav?.("strategy")}>в тест стратегий</button>
        </div>
        <CodeView code={bat} nums={false} maxH={200} />
      </Panel>

      {drawer && (
        <>
          <div className="fg-scrim" onClick={() => setDrawer(null)} />
          <aside className="fg-dw" style={{ "--tc": drawer.kind === "snip" ? SNIP_TONE[drawer.d.cat] : CAT[drawer.d.cat] }} role="dialog" aria-modal="true">
            <div className="fg-dw-h">
              <button className="fg-dw-x" onClick={() => setDrawer(null)} aria-label="Закрыть">✕</button>
              <span className="fg-pill">{drawer.d.cat}</span><h3>{drawer.d.title}</h3>
            </div>
            <div className="fg-dw-b">
              <div><b>{drawer.kind === "snip" ? "Что делает" : "Почему дефект"}</b><p>{drawer.kind === "snip" ? drawer.d.desc : drawer.d.why}</p></div>
              <div><b>{drawer.kind === "snip" ? "Код" : "Фрагмент"}</b><div className="fg-dw-code">{drawer.kind === "snip" ? drawer.d.code : drawer.d.snippet}</div></div>
              {drawer.kind === "snip"
                ? <button className="fg-btn pri" onClick={() => insertSnippet(drawer.d)}>вставить в редактор</button>
                : drawer.d.fixable && <button className="fg-btn pri" onClick={() => { applyRule(RULES.find(r => r.id === drawer.d.id)); setDrawer(null); }}>⚒ выковать</button>}
            </div>
          </aside>
        </>
      )}
      <div className="fg-sparks" aria-hidden="true">
        {sparks.map(s => <span key={s.id} className="fg-spark" style={{ "--dx": s.dx + "px", "--dy": s.dy + "px", "--dur": s.dur + "ms", background: s.c }} />)}
      </div>
    </div>
  );
}