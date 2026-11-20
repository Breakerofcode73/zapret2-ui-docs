import { useMemo, useRef, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { save } from "../lib/pack";
import { parseProfiles, toStrategies, staticCheck, genPs1, parseResults, bestByDomain } from "../lib/strategyTest";
import "../styles/builder.css";
import "../styles/checkers.css";

const SAMPLE_BAT = `@echo off
chcp 65001 >nul
start /min "" "%~dp0winws2.exe" --wf-tcp-out=80,443 ^
 --lua-init=@"%~dp0lua\\zapret-lib.lua" ^
 --lua-init=@"%~dp0lua\\zapret-antidpi.lua" ^
 --new=tls-fake-split ^
 --name=tls-fake-split ^
 --filter-tcp=443 ^
 --filter-l7=tls ^
 --payload=tls_client_hello ^
 --out-range=-n30 ^
 --lua-desync=fake:blob=fake_default_tls:ip_ttl=8:badsum ^
 --lua-desync=multisplit:pos=1,midsld ^
 --new=http-hostcase ^
 --name=http-hostcase ^
 --filter-tcp=80 ^
 --filter-l7=http ^
 --payload=http_req ^
 --lua-desync=http_hostcase:spell=hOst`;
const SAMPLE_DOM = "youtube.com\ndiscord.com\ninstagram.com\nexample.com";
const BG = { ok: "rgba(52,211,153,.16)", warn: "rgba(251,191,36,.16)", bad: "rgba(248,113,113,.16)" };
const cell = (bg) => ({ background: bg, border: "1px solid var(--line)", padding: "4px 8px", fontSize: 12, textAlign: "center", whiteSpace: "nowrap" });
const th = { border: "1px solid var(--line)", padding: "4px 8px", fontSize: 12, textAlign: "left", position: "sticky", left: 0, background: "var(--card)" };

export default function StrategyTest({ onNav }) {
  const [bat, setBat] = useState("");
  const [domText, setDomText] = useState("");
  const [resText, setResText] = useState("");
  const batRef = useRef(null), domRef = useRef(null);
  const parsed = useMemo(() => parseProfiles(bat), [bat]);
  const strategies = useMemo(() => toStrategies(parsed), [parsed]);
  const domains = useMemo(() => [...new Set(domText.split(/[\s,;]+/).map(d => d.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))], [domText]);
  const real = useMemo(() => parseResults(resText), [resText]);
  const best = useMemo(() => bestByDomain(real.rows), [real]);
  const read = async (f, set) => { if (f) set(await f.text()); };
  const ps1 = useMemo(() => strategies.length && domains.length ? genPs1(strategies, domains) : "", [strategies, domains]);
  const realCell = (s, d) => {
    const rs = real.rows.filter(r => r.strategy === s && r.domain === d);
    if (!rs.length) return null;
    const ok = rs.some(r => r.ok);
    const oks = rs.filter(r => r.ok).map(r => r.ms);
    return { ok, ms: oks.length ? Math.min(...oks) : null };
  };

  return (
    <Page title="Тест стратегий по доменам" desc="Воссоздание test zapret.ps1: проект собирает PowerShell-скрипт, который локально проверяет каждый домен каждой отдельной стратегией (профилем .bat). В браузере — офлайн-предпроверка применимости и разбор результатов. Реальный обход проверяется только скриптом на Windows.">
      <h2>1 · Стратегии из .bat</h2>
      <div className="bd-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(e.dataTransfer.files[0], setBat); }}>
        <textarea className="bd-ta big" spellCheck={false} value={bat} placeholder="Вставь multi-profile .bat (профили через --new)…" onChange={e => setBat(e.target.value)} />
        <div className="bd-drop-bar">
          <button onClick={() => batRef.current?.click()}>открыть .bat</button>
          <input ref={batRef} type="file" hidden accept=".bat,.cmd,.txt" onChange={e => read(e.target.files[0], setBat)} />
          <button onClick={() => setBat(SAMPLE_BAT)}>пример (2 стратегии)</button>
          <button onClick={() => setBat("")}>очистить</button>
          <span className="bd-meta">профилей: {strategies.length}{parsed.profiles.some(p => p.skip) ? " (часть --skip)" : ""}</span>
        </div>
      </div>
      {strategies.length > 0 && <div className="chk-bar">{strategies.map(s => <span key={s.name} className="chk-pill info">{s.name}</span>)}</div>}

      <h2>2 · Домены</h2>
      <div className="bd-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(e.dataTransfer.files[0], setDomText); }}>
        <textarea className="bd-ta" spellCheck={false} value={domText} placeholder="По одному домену на строку (или через запятую)…" onChange={e => setDomText(e.target.value)} />
        <div className="bd-drop-bar">
          <button onClick={() => domRef.current?.click()}>открыть список</button>
          <input ref={domRef} type="file" hidden accept=".txt,.txt,.md" onChange={e => read(e.target.files[0], setDomText)} />
          <button onClick={() => setDomText(SAMPLE_DOM)}>пример</button>
          <span className="bd-meta">доменов: {domains.length}</span>
        </div>
      </div>

      {strategies.length > 0 && domains.length > 0 && (
        <>
          <h2>3 · Предпроверка применимости (офлайн)</h2>
          <p className="note">Это совместимость фильтров и маркеров с доменом, а не реальный обход. Наведи на ячейку — увидишь причины.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>стратегия \ домен</th>{domains.map(d => <th key={d} style={th}>{d}</th>)}</tr></thead>
              <tbody>
                {strategies.map(s => (
                  <tr key={s.name}>
                    <td style={th}><b>{s.name}</b></td>
                    {domains.map(d => { const r = staticCheck(s, d); return <td key={d} style={cell(BG[r.level])} title={r.reasons.join("\n")}>{r.level === "ok" ? "✓" : r.level === "warn" ? "?" : "✗"}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>4 · Реальный тест: test-zapret.ps1</h2>
          <div className="chk-bar">
            <button onClick={() => save(ps1, "test-zapret.ps1")}>скачать test-zapret.ps1</button>
            <button onClick={() => navigator.clipboard?.writeText(ps1)}>копировать скрипт</button>
            <button onClick={() => save(domains.join("\n"), "domains.txt")}>скачать domains.txt</button>
          </div>
          <p className="note">Положи скрипт рядом с <code>winws2.exe</code>, <code>WinDivert</code> и папкой <code>lua\</code>. Запусти PowerShell <b>от администратора</b>: <code>.\test-zapret.ps1</code> (QUIC: <code>-Quic</code>, таймаут: <code>-Timeout 10</code>). Скрипт проверит baseline без zapret, затем каждый профиль отдельно (через @config, с раскрытием %~dp0) и сохранит <code>zapret-test.json</code>/<code>.csv</code>.</p>
          <details className="chk-profile"><summary>Показать сгенерированный скрипт</summary><Code label="test-zapret.ps1">{ps1}</Code></details>

          <h2>5 · Результаты</h2>
          <textarea className="bd-ta" spellCheck={false} value={resText} placeholder="Вставь сюда содержимое zapret-test.json (или .csv)…" onChange={e => setResText(e.target.value)} />
          {real.error && <p className="note">{real.error}</p>}
          {real.rows.length > 0 && (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={th}>стратегия \ домен</th>{domains.map(d => <th key={d} style={th}>{d}{best[d] ? " ★" : ""}</th>)}</tr></thead>
                  <tbody>
                    {["baseline", ...strategies.map(s => s.name)].map(s => (
                      <tr key={s}>
                        <td style={th}><b>{s}</b></td>
                        {domains.map(d => {
                          const c = realCell(s, d);
                          if (!c) return <td key={d} style={cell("transparent")}>—</td>;
                          const isBest = best[d] && best[d].strategy === s;
                          return <td key={d} style={cell(c.ok ? BG.ok : BG.bad)} title={c.ok ? "успех" : "не прошло"}>{c.ok ? "✓" : "✗"}{c.ms != null ? ` ${c.ms}ms` : ""}{isBest ? " ★" : ""}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2>Лучшая стратегия на домен</h2>
              <div className="chk-list">
                {domains.map(d => (
                  <article key={d} className={"chk-item " + (best[d] ? "info" : "warn")}>
                    <header><b>{d}</b><span className="chk-line">{best[d] ? `${best[d].strategy} · ${best[d].proto} · ${best[d].ms}ms` : "ни одна не прошла"}</span></header>
                    {real.rows.some(r => r.domain === d && r.strategy === "baseline" && r.ok) && <p className="chk-fix">baseline прошёл — домен, похоже, не заблокирован (или блокируется не на этом уровне).</p>}
                  </article>
                ))}
              </div>
              <div className="chk-bar">
                <button onClick={() => save(JSON.stringify(real.rows, null, 2), "zapret-test-parsed.json", "application/json")}>экспорт JSON</button>
                <button onClick={() => save("strategy,domain,proto,ok,status,ms\n" + real.rows.map(r => `${r.strategy},${r.domain},${r.proto},${r.ok},${r.status},${r.ms}`).join("\n"), "zapret-test-parsed.csv")}>экспорт CSV</button>
                <button onClick={() => onNav?.("strategy")}>к стратегиям</button>
              </div>
            </>
          )}
        </>
      )}
      {(!strategies.length || !domains.length) && <p className="note">Добавь .bat со стратегиями и список доменов — появятся матрица, скрипт и разбор результатов.</p>}
    </Page>
  );
}