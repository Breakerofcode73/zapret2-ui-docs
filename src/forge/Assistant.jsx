import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as T from "../lib/ai/tutor";
import * as A from "../lib/ai/advisor";
import { checkLua } from "../lib/checkLua";
import { synthesize } from "../lib/synth";
import { OPS } from "../lib/intent";
import { exam } from "../lib/ai/engine";

const CSS = `
.ta{--ln:#1e2c47;--pn:#0e1524;--ov:#131c2e;--bg2:#0a0f1a;--tx2:#e6edfb;--dm:#8296b8;--fn2:#5b6d8c;
--cy2:#22d3ee;--li2:#9ef01a;--am2:#fbbf24;--rd2:#ff5470;--mg2:#ff4fd8;--vi2:#a78bfa;
--mono2:ui-monospace,"Cascadia Code",Consolas,monospace;color:var(--tx2)}
.ta *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--cy2) var(--bg2)}
.ta *::-webkit-scrollbar{width:10px;height:10px}
.ta *::-webkit-scrollbar-track{background:var(--bg2)}
.ta *::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--cy2),var(--vi2));border:3px solid var(--bg2);border-radius:20px}
.ta-grid{display:grid;grid-template-columns:minmax(0,1fr) 296px;gap:14px;align-items:start}
.ta-main{min-width:0;display:flex;flex-direction:column;gap:14px}
.ta-rail{position:sticky;top:62px;align-self:start;max-height:calc(100vh - 84px);overflow-y:auto;border:1px solid var(--ln);border-radius:14px;background:var(--ov)}
.ta-rh{position:sticky;top:0;z-index:4;padding:11px 13px;border-bottom:1px solid var(--ln);font-size:13px;font-weight:700;background:linear-gradient(120deg,color-mix(in srgb,var(--cy2) 14%,var(--ov)),var(--ov))}
.ta-rs{padding:11px 13px;border-bottom:1px solid var(--ln)}
.ta-rs>h3{margin:0 0 9px;font:600 10px/1 var(--mono2);letter-spacing:.15em;text-transform:uppercase;color:var(--fn2)}
.ta-p{border:1px solid var(--ln);border-radius:14px;background:var(--pn);overflow:hidden}
.ta-ph{display:flex;gap:9px;align-items:center;flex-wrap:wrap;padding:12px 15px;border-bottom:1px solid var(--ln);background:linear-gradient(120deg,color-mix(in srgb,var(--h,var(--cy2)) 11%,var(--ov)),var(--ov))}
.ta-ph h2{margin:0;font-size:15px;border:0;padding:0}
.ta-ph h2::before{content:none}
.ta-k{font:600 10px/1 var(--mono2);letter-spacing:.16em;text-transform:uppercase;color:var(--h,var(--cy2));border:1px solid color-mix(in srgb,var(--h,var(--cy2)) 42%,transparent);padding:5px 8px;border-radius:20px}
.ta-sp{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.ta-pb{padding:15px}
.ta-b{border:1px solid var(--ln);background:var(--pn);color:var(--tx2);border-radius:9px;padding:8px 12px;font-size:12.5px;cursor:pointer;transition:.16s;display:inline-flex;gap:7px;align-items:center;white-space:nowrap}
.ta-b:hover{border-color:var(--cy2);color:var(--cy2);transform:translateY(-1px)}
.ta-b.pri{background:linear-gradient(120deg,var(--cy2),var(--vi2));color:#04101c;font-weight:700;border-color:transparent}
.ta-b.pri:hover{color:#04101c;filter:brightness(1.09)}
.ta-b.dgr:hover{border-color:var(--rd2);color:var(--rd2)}
.ta-b.sm{padding:5px 9px;font-size:11.5px;border-radius:7px}
.ta-b:disabled{opacity:.42;cursor:not-allowed;transform:none}
.ta-ta{width:100%;background:#04060b;color:var(--tx2);border:1px solid var(--ln);border-radius:11px;padding:12px 14px;font:14px/1.6 var(--mono2);min-height:84px;resize:vertical}
.ta-ta:focus{outline:none;border-color:var(--cy2);box-shadow:0 0 0 3px color-mix(in srgb,var(--cy2) 15%,transparent)}
.ta-code{background:#04060b;border:1px solid var(--ln);border-radius:11px;max-height:var(--ch,380px);overflow:auto}
.ta-code pre{margin:0;padding:11px 0;font:var(--fs2,13px)/1.7 var(--mono2);background:none;border:0;box-shadow:none}
.ta-cl{display:block;padding:1px 13px;white-space:pre;color:#cfe0f7}
.ta-cl i{display:inline-block;width:30px;color:#3d4f6d;font-style:normal;user-select:none}
.ta-cl.add{background:color-mix(in srgb,var(--li2) 13%,transparent);color:#cdf59a}
.ta-cl.del{background:color-mix(in srgb,var(--rd2) 12%,transparent);color:#ffb3bf;text-decoration:line-through}
.ta-kw{color:var(--mg2)}.ta-fn{color:var(--cy2)}.ta-st{color:var(--li2)}.ta-cm{color:#4d6183;font-style:italic}.ta-nm{color:var(--am2)}
.ta-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:12px}
.ta-sb{border:1px solid var(--ln);border-radius:11px;background:var(--bg2);padding:9px 11px}
.ta-sb b{display:block;font:700 19px/1.1 var(--mono2);color:var(--cy2)}
.ta-sb.li b{color:var(--li2)}.ta-sb.rd b{color:var(--rd2)}.ta-sb.am b{color:var(--am2)}.ta-sb.vi b{color:var(--vi2)}
.ta-sb span{font-size:10px;color:var(--fn2);text-transform:uppercase;letter-spacing:.05em}
.ta-q{border:1px solid var(--am2);border-left-width:3px;border-radius:12px;background:color-mix(in srgb,var(--am2) 7%,var(--bg2));padding:14px 15px}
.ta-q h3{margin:0 0 6px;font-size:15px;color:var(--am2)}
.ta-q p{margin:0 0 11px;font-size:13px;line-height:1.6;color:var(--dm)}
.ta-opts{display:flex;flex-direction:column;gap:7px}
.ta-opt{text-align:left;border:1px solid var(--ln);background:var(--pn);color:var(--tx2);border-radius:10px;padding:10px 13px;cursor:pointer;transition:.16s}
.ta-opt:hover{border-color:var(--cy2);transform:translateX(3px);background:color-mix(in srgb,var(--cy2) 8%,var(--pn))}
.ta-opt b{display:block;font-size:13.5px;margin-bottom:2px}
.ta-opt span{font-size:11.5px;color:var(--dm)}
.ta-opt u{text-decoration:none;font:10px var(--mono2);color:var(--cy2);margin-left:6px}
.ta-is{border:1px solid var(--ln);border-left-width:3px;border-radius:11px;background:var(--bg2);padding:11px 13px;margin-bottom:8px}
.ta-is.crit{border-left-color:var(--rd2)}.ta-is.warn{border-left-color:var(--am2)}.ta-is.info{border-left-color:var(--cy2)}
.ta-is header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.ta-is .sv{font:700 9px/1 var(--mono2);letter-spacing:.1em;padding:4px 7px;border-radius:20px}
.ta-is.crit .sv{background:var(--rd2);color:#2a0008}.ta-is.warn .sv{background:var(--am2);color:#241500}.ta-is.info .sv{background:var(--cy2);color:#04121a}
.ta-is .kd{font:9.5px var(--mono2);color:var(--fn2);border:1px solid var(--ln);padding:3px 7px;border-radius:20px;text-transform:uppercase}
.ta-is b{font-size:13px;flex:1;min-width:140px}
.ta-is p{margin:0 0 8px;font-size:12.5px;line-height:1.6;color:var(--dm)}
.ta-alt{border:1px solid var(--ln);border-radius:11px;background:var(--bg2);padding:11px 13px;margin-bottom:8px}
.ta-alt header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.ta-alt .tg{font:700 9px/1 var(--mono2);padding:4px 7px;border-radius:20px;letter-spacing:.09em}
.ta-alt .tg.fix{background:var(--li2);color:#0a1400}.ta-alt .tg.softer{background:var(--cy2);color:#04121a}.ta-alt .tg.stronger{background:var(--mg2);color:#2a0020}
.ta-alt b{font-size:13px;flex:1;min-width:130px}
.ta-alt p{margin:0 0 7px;font-size:12px;color:var(--dm)}
.ta-row{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.ta-row label{flex:1;font-size:12.5px;color:var(--dm)}
.ta-v{font:600 12px var(--mono2);color:var(--cy2);min-width:44px;text-align:right}
.ta-sl{width:100%;height:5px;-webkit-appearance:none;appearance:none;background:var(--ln);border-radius:20px;outline:none;margin:0 0 11px}
.ta-sl::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;cursor:pointer;border:2px solid var(--ov);background:linear-gradient(135deg,var(--cy2),var(--vi2))}
.ta-sel{width:100%;background:#04060b;border:1px solid var(--ln);color:var(--tx2);border-radius:8px;padding:7px 9px;font-size:12.5px;cursor:pointer}
.ta-tg{display:flex;gap:9px;align-items:center;width:100%;background:var(--pn);border:1px solid var(--ln);border-radius:9px;padding:8px 10px;cursor:pointer;color:var(--dm);font-size:12.5px;margin-bottom:7px;text-align:left;transition:.16s}
.ta-tg:hover{border-color:var(--cy2);color:var(--tx2)}
.ta-tg i{width:29px;height:16px;border-radius:20px;background:var(--ln);position:relative;flex:none;transition:.18s}
.ta-tg i::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--fn2);transition:.18s}
.ta-tg.on{color:var(--tx2);border-color:color-mix(in srgb,var(--cy2) 55%,transparent)}
.ta-tg.on i{background:linear-gradient(90deg,var(--cy2),var(--vi2))}
.ta-tg.on i::after{left:15px;background:#04101c}
.ta-tg u{margin-left:auto;text-decoration:none;font:10px var(--mono2);color:var(--fn2)}
.ta-note{font:11px/1.55 var(--mono2);color:var(--fn2);margin-top:8px}
.ta-lex{display:flex;flex-wrap:wrap;gap:6px}
.ta-lx{border:1px solid var(--ln);background:var(--bg2);border-radius:20px;padding:4px 10px;font:11.5px var(--mono2);color:var(--dm);display:inline-flex;gap:6px;align-items:center}
.ta-lx b{color:var(--cy2)}
.ta-lx button{background:none;border:0;color:var(--fn2);cursor:pointer;font-size:12px;padding:0}
.ta-lx button:hover{color:var(--rd2)}
.ta-hb{height:9px;background:#04060b;border:1px solid var(--ln);border-radius:20px;overflow:hidden;flex:1;min-width:130px}
.ta-hb i{display:block;height:100%;border-radius:20px;transition:width .5s,background .4s}
.ta-tr{border:1px solid var(--ln);border-radius:10px;background:#04060b;padding:10px 12px;font:11.5px/1.7 var(--mono2);color:var(--dm);max-height:220px;overflow:auto}
.ta-tr b{color:var(--cy2)}
.ta-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:130;display:flex;gap:10px;align-items:center;background:var(--ov);border:1px solid var(--li2);border-radius:12px;padding:11px 16px;font-size:13px;max-width:calc(100vw - 30px)}
.ta-toast i{width:8px;height:8px;border-radius:50%;background:var(--li2);flex:none}
@media(max-width:1080px){.ta-grid{grid-template-columns:minmax(0,1fr)}.ta-rail{position:static;max-height:none}.ta-rbody{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.ta-rs{border-right:1px solid var(--ln)}}
@media(max-width:640px){.ta-rbody{grid-template-columns:1fr}}
`;

const KW = new Set("function local end if then else elseif for while do return repeat until break and or not nil true false in".split(" "));
const FNS = new Set("fake multisplit multidisorder fakedsplit fakeddisorder hostfakesplit oob udplen http_hostcase apply_fooling apply_ip_id deepcopy desync_opts rawsend_dissect rawsend_payload_segmented rawsend_opts_base reconstruct_opts direction_check direction_cutoff_opposite payload_check replay_first replay_drop replay_drop_set instance_cutoff_shim resolve_range blob blob_or_def blob_exist DLOG bu8 pcall pairs tostring tonumber clock_gettime getpid outline_random_split fake_ip_misdirection __seed".split(" "));

function hl(l) {
  if (/^\s*--/.test(l)) return <span className="ta-cm">{l}</span>;
  const parts = l.split(/("(?:\\.|[^"\\])*"|\b[A-Za-z_]\w*\b|\b0x[0-9a-fA-F]+\b|\b\d+\b)/g);
  return parts.map((t, i) => {
    if (!t) return null;
    if (t.charAt(0) === '"') return <span className="ta-st" key={i}>{t}</span>;
    if (KW.has(t)) return <span className="ta-kw" key={i}>{t}</span>;
    if (/^(0x|\d)/.test(t)) return <span className="ta-nm" key={i}>{t}</span>;
    if (FNS.has(t)) return <span className="ta-fn" key={i}>{t}</span>;
    return <span key={i}>{t}</span>;
  });
}

function diffOld(a, b) {
  const X = a.split("\n"), Y = b.split("\n"), out = [];
  let i = 0;
  while (i < X.length && i < Y.length && X[i] === Y[i]) { out.push({ t: "=", s: X[i] }); i++; }
  let ea = X.length, eb = Y.length;
  while (ea > i && eb > i && X[ea - 1] === Y[eb - 1]) { ea--; eb--; }
  for (let k = i; k < ea; k++) out.push({ t: "-", s: X[k] });
  for (let k = i; k < eb; k++) out.push({ t: "+", s: Y[k] });
  for (let k = ea; k < X.length; k++) out.push({ t: "=", s: X[k] });
  return out;
}

const DEF = { strict: 1, threshold: 0.45, ask: true, autofix: true, autolearn: true, transport: "tcp", target: "copy", fs: 13, ch: 380, trace: false };
const SEV_RU = { crit: "критично", warn: "warning", info: "замечание" };

export default function Assistant({ onNav }) {
  const [S, setS] = useState(() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem("z2ai:ui:v1") || "{}") }; } catch { return DEF; } });
  const [phrase, setPhrase] = useState("");
  const [name, setName] = useState("my_ai");
  const [asked, setAsked] = useState([]);
  const [res, setRes] = useState(null);
  const [code, setCode] = useState("");
  const [orig, setOrig] = useState("");
  const [rev, setRev] = useState(null);
  const [fix, setFix] = useState(null);
  const [prog, setProg] = useState(null);
  const [ex, setEx] = useState(null);
  const [toast, setToast] = useState(null);
  const undoRef = useRef(null);

  const set = useCallback((k, v) => setS(s => ({ ...s, [k]: v })), []);
  const say = useCallback((m, u) => { undoRef.current = u || null; setToast({ m, k: Date.now() }); }, []);

  useEffect(() => { try { localStorage.setItem("z2ai:ui:v1", JSON.stringify(S)); } catch { /* ignore */ } }, [S]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => { setToast(null); undoRef.current = null; }, 4200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setProg(T.progress()); }, [res, fix]);

  const ctx = useMemo(() => ({ target: S.target, transport: S.transport, name, payload: S.transport === "udp" ? "quic_initial" : "tls_client_hello" }), [S.target, S.transport, name]);

  const run = useCallback((p, a) => {
    const text = p === undefined ? phrase : p;
    const hist = a === undefined ? asked : a;
    if (!text.trim()) return;
    const r = T.resolve(text, { ...ctx, ops: (res && res.ops) || [] }, hist, S.threshold);
    setRes(r);
    let c = (r.build && r.build.code) || "";
    if (!c && r.ops.length) { try { const b = synthesize(r.ops, ctx, name); c = (b && b.code) || ""; } catch { c = ""; } }
    if (c) { setCode(c); setOrig(c); }
    const rv = A.review({ ops: r.ops, ctx, params: { ip_ttl: r.ops.includes("ttl") ? 8 : undefined, maxfake: 1 }, code: c, strict: S.strict });
    setRev(rv);
    if (c && S.autofix && rv.issues.some(i => i.kind === "код")) {
      const f = A.repair(c, S.strict);
      if (f.changed) { setFix(f); setCode(f.text); } else setFix(null);
    } else setFix(null);
  }, [phrase, asked, ctx, name, S.threshold, S.strict, S.autofix, res]);

  const answer = opt => {
    const q = res.question;
    const r = T.learnAnswer(q, opt, phrase, { ...ctx, ops: res.ops });
    const na = asked.concat([q.id]);
    setAsked(na);
    say(r.learned ? "Выучено: " + opt.label : "Пропущено — не запоминаю");
    setTimeout(() => run(phrase, na), 60);
  };

  const doFix = () => {
    const f = A.repair(code, S.strict);
    if (!f.changed) { say("Править нечего — код уже чистый"); return; }
    const before = code;
    setFix(f); setCode(f.text);
    setRev(A.review({ ops: (res && res.ops) || [], ctx, code: f.text, strict: S.strict }));
    say("Починено: " + (f.applied.length + f.luaApplied.length) + " правок", () => { setCode(before); setFix(null); });
  };

  const takeAlt = alt => {
    const before = { code, ops: res && res.ops };
    const c2 = alt.code || (() => { try { const b = synthesize(alt.ops, { ...ctx, ...(alt.ctx || {}) }, name); return (b && b.code) || ""; } catch { return ""; } })();
    if (!c2) { say("Для этой альтернативы код не собрался"); return; }
    setCode(c2); setOrig(c2); setFix(null);
    setRes(r => r ? { ...r, ops: alt.ops } : r);
    setRev(A.review({ ops: alt.ops, ctx: { ...ctx, ...(alt.ctx || {}) }, code: c2, strict: S.strict }));
    if (S.autolearn) { T.confirm({ phrase, ops: alt.ops, ctx }, 1, "принята альтернатива: " + alt.label); setProg(T.progress()); }
    say("Применено: " + alt.label, () => { setCode(before.code); setRes(r => r ? { ...r, ops: before.ops } : r); });
  };

  const judge = sign => {
    if (!res) return;
    T.confirm(res, sign, sign > 0 ? "замысел верный" : "замысел неверный");
    setProg(T.progress());
    say(sign > 0 ? "Запомнил как верный разбор" : "Запомнил как ошибочный — переучусь");
  };

  const toSmith = async () => {
    try { localStorage.setItem("z2ai:handoff:v1", JSON.stringify({ name, code, phrase, ops: (res && res.ops) || [] })); } catch { /* ignore */ }
    try { await navigator.clipboard.writeText(code); say("Код скопирован — вставь в редактор Ковки"); } catch { say("Открой Ковку и вставь код вручную"); }
    if (onNav) onNav("forge");
  };

  const dl = (text, fn) => {
    const b = new Blob([text], { type: "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = fn; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000); say("Скачано: " + fn);
  };

  const rows = useMemo(() => fix ? diffOld(orig, code) : code.split("\n").map(s => ({ t: "=", s })), [fix, orig, code]);
  const chk = useMemo(() => { try { return code.trim() ? checkLua(code, FNS) : null; } catch { return null; } }, [code]);
  const health = (rev && rev.health) || 0;
  const hv = rev ? health : 100;
  const hc = hv >= 80 ? "var(--li2)" : hv >= 50 ? "var(--am2)" : "var(--rd2)";
  const lexList = (res && res.lexicon) || T.lexicon().slice(0, 14);

  const Tg = ({ k, label, hint }) => (
    <button className={"ta-tg" + (S[k] ? " on" : "")} onClick={() => set(k, !S[k])} aria-pressed={!!S[k]}>
      <i aria-hidden="true" />{label}{hint ? <u>{hint}</u> : null}
    </button>
  );
  const Sl = ({ k, label, min, max, step, fmt }) => (
    <>
      <div className="ta-row"><label htmlFor={"t-" + k}>{label}</label><span className="ta-v">{fmt ? fmt(S[k]) : S[k]}</span></div>
      <input id={"t-" + k} className="ta-sl" type="range" min={min} max={max} step={step || 1} value={S[k]} onChange={e => set(k, parseFloat(e.target.value))} />
    </>
  );

  return (
    <div className="ta">
      <style>{CSS}</style>
      <div className="ta-grid">
        <div className="ta-main">

          <section className="ta-p" style={{ "--h": "var(--cy2)" }}>
            <div className="ta-ph"><span className="ta-k">01</span><h2>Замысел словами</h2>
              <span className="ta-sp"><span className="ta-note">Alt+Enter — разобрать</span></span></div>
            <div className="ta-pb">
              <textarea className="ta-ta" value={phrase} onChange={e => setPhrase(e.target.value)}
                onKeyDown={e => { if (e.altKey && e.key === "Enter") { e.preventDefault(); setAsked([]); run(phrase, []); } }}
                placeholder="Например: чтобы провайдер видел мусор, а настоящий запрос ушёл нетронутым" />
              <div className="ta-sp" style={{ marginTop: 10, marginLeft: 0 }}>
                <input className="ta-ta" style={{ minHeight: 0, width: 170, padding: "8px 11px", fontSize: 13 }} value={name}
                  onChange={e => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "_"))} aria-label="Имя функции" />
                <button className="ta-b pri" onClick={() => { setAsked([]); run(phrase, []); }}>разобрать</button>
                <button className="ta-b" onClick={() => { setPhrase(""); setRes(null); setCode(""); setOrig(""); setRev(null); setFix(null); setAsked([]); }}>сброс</button>
                {res ? <button className="ta-b sm" onClick={() => judge(1)}>верно</button> : null}
                {res ? <button className="ta-b sm dgr" onClick={() => judge(-1)}>неверно</button> : null}
              </div>
              {res ? (
                <div className="ta-stats" style={{ marginTop: 13 }}>
                  <div className="ta-sb"><b>{res.ops.length}</b><span>приёмов</span></div>
                  <div className="ta-sb vi"><b>{Math.round(res.confidence * 100)}%</b><span>уверенность</span></div>
                  <div className="ta-sb am"><b>{res.unknown.length}</b><span>неизвестных слов</span></div>
                  <div className="ta-sb li"><b>{res.lexUsed.length}</b><span>из словаря</span></div>
                  <div className="ta-sb rd"><b>{rev ? rev.issues.filter(i => i.sev === "crit").length : 0}</b><span>критично</span></div>
                  <div className="ta-sb"><b>{rev && rev.rung >= 0 ? rev.rung : "—"}</b><span>ступень</span></div>
                </div>
              ) : null}
              {res ? (
                <div className="ta-row" style={{ marginTop: 4 }}>
                  <span className="ta-note">здоровье замысла</span>
                  <span className="ta-hb"><i style={{ width: hv + "%", background: hc }} /></span>
                  <span className="ta-v" style={{ color: hc }}>{hv}%</span>
                </div>
              ) : null}
              {res && res.ops.length > 0 ? <div className="ta-note">приёмы: {res.ops.map(o => (OPS[o] && OPS[o].label) || o).join(" · ")}</div> : null}
            </div>
          </section>

          {res && res.needAsk && S.ask ? (
            <section className="ta-p" style={{ "--h": "var(--am2)" }}>
              <div className="ta-ph"><span className="ta-k">02</span><h2>ИИ уточняет</h2>
                <span className="ta-sp"><span className="ta-note">шаг {asked.length + 1}</span></span></div>
              <div className="ta-pb">
                <div className="ta-q">
                  <h3>{res.question.text}</h3><p>{res.question.why}</p>
                  <div className="ta-opts">
                    {res.question.options.map((o, i) => (
                      <button key={i} className="ta-opt" onClick={() => answer(o)}>
                        <b>{o.label}{o.ops && o.ops.length ? <u>{o.ops.join(",")}</u> : null}</b>
                        {o.hint ? <span>{o.hint}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div className="ta-note">Ответ запоминается на трёх слоях: словарь слов, веса признаков, эпизодическая память. В следующий раз вопрос не появится.</div>
                </div>
                {res.understanding.reasons.length ? <div className="ta-note">почему спросил: {res.understanding.reasons.join("; ")}</div> : null}
              </div>
            </section>
          ) : null}

          {rev && rev.issues.length ? (
            <section className="ta-p" style={{ "--h": "var(--rd2)" }}>
              <div className="ta-ph"><span className="ta-k">03</span><h2>Критик: что навредит</h2>
                <span className="ta-sp"><span className="ta-note">{rev.issues.length} замечаний</span>
                  <button className="ta-b sm pri" onClick={doFix}>починить код</button></span></div>
              <div className="ta-pb">
                {rev.issues.map((i, k) => (
                  <article key={k} className={"ta-is " + i.sev}>
                    <header><span className="sv">{SEV_RU[i.sev]}</span><span className="kd">{i.kind}</span><b>{i.title}</b><span className="ta-note">{i.id}</span></header>
                    <p>{i.why}</p>
                    {i.better && i.better.ops && i.better.ops.length ? (
                      <button className="ta-b sm" onClick={() => takeAlt({ label: i.better.label, ops: i.better.ops, args: i.better.args, ctx: i.better.ctx, code: null, tag: "fix" })}>применить: {i.better.label}</button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {rev && rev.alternatives.length ? (
            <section className="ta-p" style={{ "--h": "var(--li2)" }}>
              <div className="ta-ph"><span className="ta-k">04</span><h2>Оптимальнее</h2>
                <span className="ta-sp"><span className="ta-note">готовый код к каждой</span></span></div>
              <div className="ta-pb">
                {rev.alternatives.map((a, k) => (
                  <div key={k} className="ta-alt">
                    <header><span className={"tg " + a.tag}>{a.tag === "fix" ? "исправление" : a.tag === "softer" ? "мягче" : "сильнее"}</span>
                      <b>{a.label}</b>{a.code ? <span className="ta-note">{a.issues} замечаний</span> : null}</header>
                    <p>{a.why}</p>
                    {a.args ? <div className="ta-note">аргументы: {a.args}</div> : null}
                    <div className="ta-sp" style={{ marginLeft: 0, marginTop: 8 }}>
                      <button className="ta-b sm pri" onClick={() => takeAlt(a)}>применить</button>
                      {a.code ? <button className="ta-b sm" onClick={() => dl(a.code, name + "_" + a.tag + ".lua")}>скачать</button> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {code ? (
            <section className="ta-p" style={{ "--h": "var(--vi2)" }}>
              <div className="ta-ph"><span className="ta-k">05</span><h2>{name}.lua</h2>
                <span className="ta-sp">
                  {fix ? <span className="ta-note">+{fix.applied.length + fix.luaApplied.length} правок</span> : null}
                  <span className="ta-note">{(chk && chk.issues && chk.issues.length) || 0} замечаний Lua</span>
                  <button className="ta-b sm" onClick={() => dl(code, name + ".lua")}>скачать</button>
                  <button className="ta-b sm pri" onClick={toSmith}>в Ковку</button></span></div>
              <div className="ta-pb" style={{ padding: 12 }}>
                <div className="ta-code" style={{ "--fs2": S.fs + "px", "--ch": S.ch + "px" }}>
                  <pre>{rows.map((r, i) => (
                    <span key={i} className={"ta-cl" + (r.t === "+" ? " add" : r.t === "-" ? " del" : "")}><i>{i + 1}</i>{hl(r.s)}</span>
                  ))}</pre>
                </div>
                {fix && fix.applied.length ? <div className="ta-note">правки: {fix.applied.map(a => a.id + " " + a.title).join(" · ")}</div> : null}
                {chk && chk.issues && chk.issues.length ? <div className="ta-note">осталось: {chk.issues.slice(0, 4).map(i => (i.id || "?") + " строка " + i.line + ": " + (i.msg || i.title)).join(" · ")}</div> : null}
              </div>
            </section>
          ) : null}

          {S.trace && res && res.trace ? (
            <section className="ta-p" style={{ "--h": "var(--fn2)" }}>
              <div className="ta-ph"><span className="ta-k">06</span><h2>Трассировка разбора</h2></div>
              <div className="ta-pb"><div className="ta-tr">
                {res.trace.map(t => (
                  <div key={t.id}><b>{t.title}</b> — {t.detail}{(t.data || []).slice(0, 4).map((d, i) => <div key={i}>{"  " + d}</div>)}</div>
                ))}
              </div></div>
            </section>
          ) : null}
        </div>

        <aside className="ta-rail" aria-label="Пульт обучения">
          <div className="ta-rh">Пульт обучения</div>
          <div className="ta-rbody">
            <div className="ta-rs"><h3>Понимание</h3>
              <Tg k="ask" label="Спрашивать, если не понял" hint="ask" />
              <Sl k="threshold" label="Порог уверенности" min={0.2} max={0.8} step={0.05} fmt={v => Math.round(v * 100) + "%"} />
              <Tg k="autolearn" label="Учить на принятии альтернативы" hint="auto" />
              <Tg k="trace" label="Показывать трассировку" hint="trace" />
            </div>
            <div className="ta-rs"><h3>Критик</h3>
              <Sl k="strict" label="Строгость" min={0} max={1} step={0.5} fmt={v => v === 0 ? "только крит" : v === 0.5 ? "крит+warn" : "всё"} />
              <Tg k="autofix" label="Автопочинка кода" hint="fix" />
              <div className="ta-row"><label htmlFor="t-tr">Транспорт</label></div>
              <select id="t-tr" className="ta-sel" value={S.transport} onChange={e => set("transport", e.target.value)}>
                <option value="tcp">TCP</option><option value="udp">UDP</option></select>
              <div style={{ height: 9 }} />
              <div className="ta-row"><label htmlFor="t-tg">Объект воздействия</label></div>
              <select id="t-tg" className="ta-sel" value={S.target} onChange={e => set("target", e.target.value)}>
                <option value="copy">копия (оригинал цел)</option><option value="original">оригинал</option></select>
            </div>
            <div className="ta-rs"><h3>Прогресс</h3>
              {prog ? (
                <div className="ta-stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div className="ta-sb li"><b>{prog.words}</b><span>выучено слов</span></div>
                  <div className="ta-sb"><b>{prog.asked}</b><span>вопросов</span></div>
                  <div className="ta-sb vi"><b>{Math.round(prog.rate * 100)}%</b><span>усвоено</span></div>
                  <div className="ta-sb am"><b>{prog.contradictions}</b><span>противоречий</span></div>
                </div>
              ) : null}
              <div className="ta-sp" style={{ marginLeft: 0 }}>
                <button className="ta-b sm" onClick={() => { try { setEx(exam()); } catch { say("Экзамен недоступен"); } }}>экзамен</button>
                <button className="ta-b sm" onClick={() => setProg(T.progress())}>обновить</button>
              </div>
              {ex ? <div className="ta-note">корпус: {ex.authored.exact}/{ex.authored.n} · твои фразы: {ex.own.exact}/{ex.own.n} · пробелов: {ex.gaps.length}</div> : null}
            </div>
            <div className="ta-rs"><h3>Словарь</h3>
              <div className="ta-lex">
                {lexList.map(w => (
                  <span key={w.word} className="ta-lx"><b>{w.word}</b>{w.ops.join(",")}
                    <button onClick={() => { T.forgetWord(w.word); setProg(T.progress()); say("Слово забыто: " + w.word); }} aria-label="Забыть">×</button></span>
                ))}
                {lexList.length === 0 ? <span className="ta-note">пока пусто — ответь на вопрос, и слова появятся</span> : null}
              </div>
            </div>
            <div className="ta-rs"><h3>Вид</h3>
              <Sl k="fs" label="Кегль кода" min={10} max={19} fmt={v => v + "px"} />
              <Sl k="ch" label="Высота кода" min={200} max={700} step={20} fmt={v => v + "px"} />
            </div>
            <div className="ta-rs"><h3>Данные</h3>
              <div className="ta-sp" style={{ marginLeft: 0 }}>
                <button className="ta-b sm" onClick={() => dl(T.exportTutor(), "zapret-tutor.json")}>экспорт обучения</button>
                <button className="ta-b sm dgr" onClick={() => { const s = T.exportTutor(); T.resetTutor(); setProg(T.progress()); say("Обучение сброшено", () => { T.importTutor(s); setProg(T.progress()); }); }}>сброс обучения</button>
              </div>
              <div className="ta-note">Словарь и журнал — localStorage. Веса модели — z2ai:learn:v1, память — z2ai:mem:v1.</div>
            </div>
          </div>
        </aside>
      </div>
      {toast ? (
        <div className="ta-toast" key={toast.k} role="status"><i />{toast.m}
          {undoRef.current ? <button className="ta-b sm" onClick={() => { if (undoRef.current) undoRef.current(); undoRef.current = null; setToast(null); }}>вернуть</button> : null}
        </div>
      ) : null}
    </div>
  );
}
