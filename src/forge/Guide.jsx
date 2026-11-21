// src/pages/ForgeGuide.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════ дизайн-система ══════════════════════════ */

const CSS = `
.fgd{
  --ink:#04060b; --surf:#080d16; --panel:#0c1320; --over:#111a2b; --line:#1b2740;
  --tx:#e6edfb; --dim:#8296b8; --faint:#5b6d8c;
  --cy:#22d3ee; --bl:#3b82f6; --vi:#8b5cf6; --mg:#ff4fd8; --li:#9ef01a; --am:#fbbf24; --rd:#ff5470;
  --acc:#22d3ee; --acc2:#8b5cf6;
  --mono:ui-monospace,"SF Mono","Cascadia Code",Consolas,monospace;
  --hh:64px; --sc:1;
  background:var(--ink); color:var(--tx); min-height:100vh; padding-bottom:80px;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.fgd[data-pal="magenta"]{--acc:#ff4fd8;--acc2:#8b5cf6;}
.fgd[data-pal="lime"]{--acc:#9ef01a;--acc2:#22d3ee;}
.fgd[data-pal="amber"]{--acc:#fbbf24;--acc2:#ff5470;}
.fgd *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--acc) var(--surf);}
.fgd *::-webkit-scrollbar{width:11px;height:11px;}
.fgd *::-webkit-scrollbar-track{background:var(--surf);border-left:1px solid var(--line);}
.fgd *::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--acc),var(--acc2));border:3px solid var(--surf);border-radius:20px;}
.fgd *::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--mg),var(--acc));}
.fgd *::-webkit-scrollbar-corner{background:var(--surf);}

/* шапка */
.fd-top{position:fixed;inset:0 0 auto 0;height:var(--hh);z-index:70;display:flex;align-items:center;gap:12px;
  padding:0 16px;background:color-mix(in srgb,var(--over) 92%,transparent);backdrop-filter:blur(18px);
  border-bottom:1px solid var(--line);}
.fd-brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:15px;letter-spacing:-.02em;white-space:nowrap;}
.fd-brand i{width:27px;height:27px;display:grid;place-items:center;border-radius:8px;font-style:normal;font-size:14px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));color:#04060b;box-shadow:0 0 20px -4px var(--acc);}
.fd-brand em{font-style:normal;font:600 10px/1 var(--mono);letter-spacing:.16em;color:var(--acc);
  border:1px solid color-mix(in srgb,var(--acc) 42%,transparent);padding:4px 7px;border-radius:20px;}
.fd-nav{display:flex;gap:2px;margin-left:8px;overflow-x:auto;scrollbar-width:none;}
.fd-nav::-webkit-scrollbar{height:0;}
.fd-nav a{font-size:12.5px;color:var(--dim);text-decoration:none;padding:7px 11px;border-radius:9px;white-space:nowrap;transition:.16s;}
.fd-nav a:hover{color:var(--tx);background:var(--panel);}
.fd-nav a.on{color:#04060b;font-weight:700;background:linear-gradient(120deg,var(--acc),var(--acc2));}
.fd-top-r{margin-left:auto;display:flex;align-items:center;gap:8px;}
.fd-ring{width:34px;height:34px;flex:none;}
.fd-prog{position:fixed;top:var(--hh);left:0;height:2px;z-index:71;
  background:linear-gradient(90deg,var(--li),var(--cy),var(--mg));box-shadow:0 0 12px var(--acc);transition:width .1s linear;}

.fd-btn{border:1px solid var(--line);background:var(--panel);color:var(--tx);border-radius:9px;padding:8px 12px;
  font-size:12.5px;cursor:pointer;transition:.16s;white-space:nowrap;display:inline-flex;align-items:center;gap:7px;}
.fd-btn:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);}
.fd-btn:active{transform:none;}
.fd-btn.pri{background:linear-gradient(120deg,var(--acc),var(--acc2));color:#04060b;font-weight:700;border-color:transparent;}
.fd-btn.pri:hover{color:#04060b;filter:brightness(1.1);}
.fd-btn.dgr:hover{border-color:var(--rd);color:var(--rd);}
.fd-btn.sm{padding:5px 9px;font-size:11.5px;border-radius:7px;}
.fd-btn.on{border-color:var(--acc);color:var(--acc);background:color-mix(in srgb,var(--acc) 10%,var(--panel));}
.fd-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.fd-pill{font:11.5px var(--mono);color:var(--acc);background:var(--ink);border:1px solid var(--line);padding:5px 9px;border-radius:8px;}

/* каркас */
.fd-wrap{max-width:1580px;margin:0 auto;padding:calc(var(--hh) + 18px) 16px 0;}
.fd-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start;}
.fd-main{min-width:0;display:flex;flex-direction:column;gap:16px;}
.fd-rail{position:sticky;top:calc(var(--hh) + 18px);align-self:start;max-height:calc(100vh - var(--hh) - 36px);
  overflow-y:auto;border:1px solid var(--line);border-radius:16px;background:var(--over);}
.rl-h{position:sticky;top:0;z-index:5;padding:12px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;
  background:linear-gradient(120deg,color-mix(in srgb,var(--acc) 15%,var(--over)),var(--over));}
.rl-h b{font-size:13px;} .rl-h u{margin-left:auto;text-decoration:none;font:10px var(--mono);color:var(--acc);letter-spacing:.14em;}
.rl-sec{padding:12px 14px;border-bottom:1px solid var(--line);}
.rl-sec>h3{margin:0 0 10px;font:600 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--faint);}
.rl-row{display:flex;align-items:center;gap:9px;margin-bottom:6px;}
.rl-row label{flex:1;font-size:12.5px;color:var(--dim);}
.rl-val{font:600 12px var(--mono);color:var(--acc);min-width:46px;text-align:right;}
.rl-sld{width:100%;height:5px;-webkit-appearance:none;appearance:none;background:var(--line);border-radius:20px;outline:none;margin:0 0 12px;}
.rl-sld::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;cursor:pointer;border:2px solid var(--over);
  background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 10px -2px var(--acc);transition:.14s;}
.rl-sld::-webkit-slider-thumb:hover{transform:scale(1.2);}
.rl-sld::-moz-range-thumb{width:13px;height:13px;border-radius:50%;cursor:pointer;border:2px solid var(--over);background:var(--acc);}
.rl-sel{width:100%;background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:7px 9px;font-size:12.5px;cursor:pointer;}
.rl-sel:focus{outline:none;border-color:var(--acc);}
.rl-tg{display:flex;align-items:center;gap:9px;width:100%;background:var(--panel);border:1px solid var(--line);border-radius:9px;
  padding:8px 10px;cursor:pointer;color:var(--dim);font-size:12.5px;transition:.16s;margin-bottom:7px;text-align:left;}
.rl-tg:last-child{margin-bottom:0;}
.rl-tg:hover{border-color:var(--acc);color:var(--tx);}
.rl-tg i{width:30px;height:17px;border-radius:20px;background:var(--line);position:relative;flex:none;transition:.18s;}
.rl-tg i::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--faint);transition:.18s;}
.rl-tg.on{color:var(--tx);border-color:color-mix(in srgb,var(--acc) 55%,transparent);background:color-mix(in srgb,var(--acc) 9%,var(--panel));}
.rl-tg.on i{background:linear-gradient(90deg,var(--acc),var(--acc2));}
.rl-tg.on i::after{left:15px;background:#04060b;}
.rl-tg u{margin-left:auto;text-decoration:none;font:10px var(--mono);color:var(--faint);}
.rl-step{display:flex;align-items:center;gap:6px;}
.rl-step button{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--tx);cursor:pointer;font-size:14px;line-height:1;}
.rl-step button:hover{border-color:var(--acc);color:var(--acc);}
.rl-step b{font:600 13px var(--mono);min-width:24px;text-align:center;color:var(--acc);}
.rl-acts{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.rl-acts .fd-btn{justify-content:center;}
.rl-note{font:11px/1.5 var(--mono);color:var(--faint);margin-top:9px;}

/* панели и reveal */
.pan{border:1px solid var(--line);border-radius:18px;background:var(--panel);overflow:hidden;scroll-margin-top:calc(var(--hh) + 16px);}
.rv{opacity:0;transform:translateY(26px);transition:opacity .6s cubic-bezier(.2,.7,.3,1),transform .6s cubic-bezier(.2,.7,.3,1);}
.rv.in{opacity:1;transform:none;}
.ph{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap;
  background:linear-gradient(120deg,color-mix(in srgb,var(--hue,var(--acc)) 10%,var(--over)),var(--over));}
.ph h2{margin:0;font-size:16px;letter-spacing:-.01em;}
.ph .k{font:600 10px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--hue,var(--acc));
  border:1px solid color-mix(in srgb,var(--hue,var(--acc)) 40%,transparent);padding:5px 8px;border-radius:20px;}
.ph .sp{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;align-items:center;}
.pb{padding:18px;}
.pb p{margin:0 0 12px;font-size:14px;line-height:1.72;color:var(--dim);}
.pb p:last-child{margin-bottom:0;}
.pb b{color:var(--tx);} .pb code{font:12.5px var(--mono);color:var(--acc);background:var(--ink);border:1px solid var(--line);padding:1px 6px;border-radius:6px;}
.lead{font-size:15.5px!important;color:var(--tx)!important;}

/* hero */
.hero{position:relative;overflow:hidden;border-radius:20px;border:1px solid var(--line);background:var(--surf);
  padding:34px 30px 26px;isolation:isolate;scroll-margin-top:calc(var(--hh) + 16px);}
.hero-bg{position:absolute;inset:-30%;z-index:-3;filter:blur(76px);opacity:.5;}
.hero-bg i{position:absolute;display:block;border-radius:50%;}
.hero-bg i:nth-child(1){width:46%;height:64%;left:0;top:2%;background:var(--acc);animation:hFloat 22s ease-in-out infinite;}
.hero-bg i:nth-child(2){width:40%;height:58%;right:2%;top:10%;background:var(--mg);animation:hFloat 28s ease-in-out infinite reverse;}
.hero-bg i:nth-child(3){width:34%;height:52%;left:36%;bottom:0;background:var(--bl);animation:hFloat 32s ease-in-out infinite;}
@keyframes hFloat{0%,100%{transform:translate3d(0,0,0) scale(1);}50%{transform:translate3d(7%,-8%,0) scale(1.18);}}
.hero-grid{position:absolute;inset:0;z-index:-2;opacity:.3;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:44px 44px;mask-image:radial-gradient(ellipse at 28% 0%,#000 22%,transparent 76%);}
.hero-grain{position:absolute;inset:0;z-index:-1;opacity:.15;pointer-events:none;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23n)'/%3E%3C/svg%3E");}
.fgd[data-grid="0"] .hero-grid{display:none;}
.fgd[data-glow="0"] .hero-bg{opacity:.16;}
.hero .eyebrow{display:inline-flex;align-items:center;gap:8px;font:600 11px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;
  color:var(--acc);border:1px solid color-mix(in srgb,var(--acc) 42%,transparent);background:color-mix(in srgb,var(--acc) 10%,transparent);
  padding:7px 13px;border-radius:30px;margin-bottom:16px;}
.hero h1{margin:0 0 12px;font-size:clamp(30px,5vw,52px);line-height:1.02;letter-spacing:-.03em;}
.hero h1 em{font-style:normal;background:linear-gradient(100deg,var(--acc),var(--mg) 55%,var(--li));-webkit-background-clip:text;background-clip:text;color:transparent;}
.hero .sub{margin:0 0 22px;max-width:70ch;font-size:15.5px;line-height:1.7;color:var(--dim);}
.hero-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:20px;}
.fact{border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--panel) 80%,transparent);padding:12px 14px;}
.fact b{display:block;font:700 21px/1.1 var(--mono);color:var(--acc);}
.fact.li b{color:var(--li);} .fact.mg b{color:var(--mg);} .fact.am b{color:var(--am);}
.fact span{font-size:11px;color:var(--faint);letter-spacing:.05em;text-transform:uppercase;}

/* конвейер */
.pipe{position:relative;border:1px solid var(--line);border-radius:15px;background:var(--ink);padding:16px 16px 12px;overflow:hidden;}
.pipe-track{position:relative;height:calc(96px * var(--sc));display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:10px;}
.zone{position:relative;border:1px solid var(--line);border-radius:12px;padding:9px 11px;overflow:hidden;transition:.25s;
  background:linear-gradient(160deg,color-mix(in srgb,var(--zc) 10%,var(--surf)),var(--surf));}
.zone.hot{border-color:var(--zc);box-shadow:0 0 0 1px color-mix(in srgb,var(--zc) 34%,transparent),0 14px 34px -22px var(--zc);}
.zone h4{margin:0 0 3px;font:700 11px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--zc);}
.zone small{display:block;font-size:11px;color:var(--faint);line-height:1.45;}
.zone .fn{margin-top:7px;font:11.5px var(--mono);color:var(--tx);}
.pk{position:absolute;top:50%;width:13px;height:13px;border-radius:4px;margin-top:-6px;z-index:4;
  box-shadow:0 0 14px -2px currentColor;transition:none;}
.pk.real{background:var(--li);color:var(--li);}
.pk.fake{background:repeating-linear-gradient(115deg,var(--mg) 0 4px,#7a1f68 4px 8px);color:var(--mg);}
.pipe-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:11px;border-top:1px solid var(--line);}
.vb{font:700 10.5px/1 var(--mono);letter-spacing:.1em;padding:6px 10px;border-radius:20px;border:1px solid var(--line);color:var(--faint);transition:.2s;}
.vb.on.pass{color:#04060b;background:var(--cy);border-color:transparent;}
.vb.on.mod{color:#04060b;background:var(--am);border-color:transparent;}
.vb.on.drop{color:#2a0008;background:var(--rd);border-color:transparent;}
.pipe-foot .agg{margin-left:auto;font:11.5px var(--mono);color:var(--dim);}
.pipe-foot .agg b{color:var(--rd);}

/* зоны-объяснение */
.zcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:11px;}
.zc{border:1px solid var(--line);border-left-width:3px;border-radius:13px;background:var(--surf);padding:13px 15px;cursor:pointer;
  text-align:left;transition:.18s;color:var(--tx);}
.zc:hover{transform:translateY(-2px);box-shadow:0 16px 34px -24px var(--zc);}
.zc.on{border-color:var(--zc);background:color-mix(in srgb,var(--zc) 8%,var(--surf));}
.zc h4{margin:0 0 5px;font-size:14px;color:var(--zc);}
.zc p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dim);}
.zdetail{margin-top:12px;border:1px solid var(--line);border-radius:13px;background:var(--ink);padding:14px 16px;}
.zdetail h5{margin:0 0 8px;font-size:13.5px;color:var(--acc);}
.zdetail ul{margin:0;padding-left:18px;}
.zdetail li{font-size:13px;line-height:1.7;color:var(--dim);margin-bottom:5px;}
.zdetail li:last-child{margin-bottom:0;}
.zdetail li b{color:var(--tx);}

/* apply_call */
.call{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px;}
.call-code{background:#03050a;border:1px solid var(--line);border-radius:13px;padding:13px 15px;font:12.5px/1.85 var(--mono);overflow-x:auto;}
.cl{display:block;padding:1px 6px;border-radius:6px;transition:.2s;color:#cfe0f7;white-space:pre;}
.cl.hot{background:color-mix(in srgb,var(--acc) 16%,transparent);box-shadow:inset 2px 0 0 var(--acc);color:#fff;}
.cl .kw{color:var(--mg);} .cl .fn{color:var(--cy);} .cl .st{color:var(--li);} .cl .cm{color:#4d6183;font-style:italic;}
.argt{border:1px solid var(--line);border-radius:13px;background:var(--surf);overflow:hidden;}
.argt h5{margin:0;padding:10px 13px;font:600 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  border-bottom:1px solid var(--line);background:var(--over);}
.argt table{width:100%;border-collapse:collapse;font:12px var(--mono);}
.argt td{padding:7px 13px;border-bottom:1px solid var(--line);}
.argt tr:last-child td{border-bottom:0;}
.argt td:first-child{color:var(--dim);}
.argt td:last-child{text-align:right;color:var(--tx);transition:.2s;}
.argt tr.chg td:last-child{color:var(--am);font-weight:700;}
.argt tr.sav td:last-child{color:var(--cy);}
.call-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px;}
.cs{border:1px solid var(--line);background:var(--surf);color:var(--dim);border-radius:20px;padding:6px 11px;font-size:11.5px;cursor:pointer;transition:.16s;}
.cs:hover{color:var(--tx);border-color:var(--acc);}
.cs.on{color:#04060b;font-weight:700;background:linear-gradient(120deg,var(--acc),var(--acc2));border-color:transparent;}
.call-note{margin-top:12px;border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:11px;background:var(--ink);padding:12px 15px;}
.call-note b{display:block;font-size:13.5px;margin-bottom:5px;color:var(--acc);}
.call-note p{margin:0;font-size:13px;line-height:1.65;color:var(--dim);}

/* анатомия */
.anat{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;}
.anat-code{background:#03050a;border:1px solid var(--line);border-radius:13px;max-height:460px;overflow:auto;}
.anat-code pre{margin:0;padding:12px 0;font:12.5px/1.75 var(--mono);}
.al{display:block;padding:1px 14px;cursor:pointer;transition:.15s;color:#cfe0f7;white-space:pre;border-left:2px solid transparent;}
.al:hover{background:color-mix(in srgb,var(--acc) 8%,transparent);}
.al.on{background:color-mix(in srgb,var(--acc) 15%,transparent);border-left-color:var(--acc);}
.al i{display:inline-block;width:28px;color:#3d4f6d;font-style:normal;user-select:none;}
.al .kw{color:var(--mg);} .al .fn{color:var(--cy);} .al .st{color:var(--li);} .al .cm{color:#4d6183;font-style:italic;} .al .nm{color:var(--am);}
.anat-side{border:1px solid var(--line);border-radius:13px;background:var(--surf);padding:15px 16px;align-self:start;position:sticky;top:calc(var(--hh) + 18px);}
.anat-side .tag{font:600 9.5px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;padding:4px 8px;border-radius:20px;
  color:var(--tc,var(--acc));border:1px solid color-mix(in srgb,var(--tc,var(--acc)) 42%,transparent);}
.anat-side h4{margin:10px 0 8px;font-size:15px;}
.anat-side p{margin:0 0 10px;font-size:13px;line-height:1.68;color:var(--dim);}
.anat-side .snip{background:#03050a;border:1px solid var(--line);border-radius:9px;padding:9px 11px;font:11.5px/1.6 var(--mono);color:var(--li);white-space:pre-wrap;word-break:break-word;}
.anat-nav{display:flex;gap:6px;margin-top:12px;}

/* карта */
.mp{border:1px solid var(--line);border-radius:14px;background:var(--ink);padding:15px;position:relative;overflow:hidden;}
.mp-sweep{position:absolute;top:0;bottom:0;width:120px;pointer-events:none;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--acc) 12%,transparent),transparent);
  animation:sweep 5.5s linear infinite;}
@keyframes sweep{from{left:-140px}to{left:100%}}
.mp-legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11.5px;color:var(--dim);}
.mp-legend span{display:inline-flex;align-items:center;gap:6px;}
.mp-legend b{width:11px;height:11px;border-radius:3px;display:block;}
.mp-ruler{position:relative;height:15px;}
.mp-ruler u{position:absolute;font:10px var(--mono);color:var(--faint);text-decoration:none;transform:translateX(-50%);}
.mp-ruler u:first-child{transform:none;} .mp-ruler u:last-child{transform:translateX(-100%);}
.mp-track{position:relative;height:calc(34px * var(--sc));border:1px solid var(--line);border-radius:8px;background:var(--surf);overflow:hidden;}
.mp-reg{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;
  font:600 calc(10px * var(--sc))/1 var(--mono);}
.mp-reg.h{background:linear-gradient(180deg,#16233a,#101a2c);color:var(--faint);}
.mp-reg.s{background:linear-gradient(180deg,color-mix(in srgb,var(--cy) 34%,#0b1424),color-mix(in srgb,var(--bl) 26%,#0b1424));color:#eafcff;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cy) 55%,transparent);}
.mp-reg.t{background:linear-gradient(180deg,#101a2c,#0b1220);color:var(--faint);}
.mp-cut{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--am);box-shadow:0 0 10px var(--am);z-index:3;}
.mp-cut u{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font:9.5px var(--mono);color:var(--am);text-decoration:none;
  background:var(--ink);border:1px solid color-mix(in srgb,var(--am) 45%,transparent);padding:1px 5px;border-radius:20px;}
.mp-lanes{margin-top:15px;display:flex;flex-direction:column;gap:6px;}
.mp-lane{display:grid;grid-template-columns:26px 58px minmax(0,1fr) 104px;gap:9px;align-items:center;padding:5px 8px;
  border:1px solid var(--line);border-radius:10px;background:var(--surf);transition:.18s;}
.mp-lane:hover{border-color:var(--acc);transform:translateX(3px);}
.mp-no{font:700 11px var(--mono);color:var(--faint);text-align:center;}
.mp-kind{font:700 9.5px/1 var(--mono);letter-spacing:.1em;text-align:center;padding:4px 0;border-radius:20px;}
.mp-kind.real{color:#0a1400;background:var(--li);} .mp-kind.fake{color:#2a0020;background:var(--mg);}
.mp-bar{position:relative;height:calc(15px * var(--sc));background:var(--ink);border:1px solid var(--line);border-radius:5px;overflow:hidden;}
.mp-fill{position:absolute;top:0;bottom:0;border-radius:4px;}
.mp-fill.real{background:linear-gradient(90deg,color-mix(in srgb,var(--li) 78%,#000),var(--li));}
.mp-fill.fake{background:repeating-linear-gradient(115deg,var(--mg) 0 6px,color-mix(in srgb,var(--mg) 45%,#000) 6px 12px);}
.mp-ovl{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,var(--am) 0 3px,transparent 3px 6px);border-right:1px solid var(--am);}
.mp-meta{font:10px var(--mono);color:var(--dim);text-align:right;white-space:nowrap;}
.mp-meta b{color:var(--tx);}

/* справочник пультов */
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:13px;}
.inp{background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:9px;padding:8px 11px;font:12.5px var(--mono);}
.inp:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 15%,transparent);}
.chip{border:1px solid var(--line);background:var(--surf);color:var(--dim);border-radius:20px;padding:6px 12px;font-size:12px;cursor:pointer;transition:.16s;}
.chip:hover{color:var(--tx);border-color:var(--acc);}
.chip.on{color:#04060b;font-weight:700;background:linear-gradient(120deg,var(--acc),var(--acc2));border-color:transparent;}
.chip u{text-decoration:none;opacity:.72;font:10px var(--mono);margin-left:5px;}
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:10px;}
.tc{border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:12px 14px;text-align:left;cursor:pointer;
  transition:.18s;position:relative;overflow:hidden;color:var(--tx);}
.tc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--tc,var(--acc));}
.tc:hover{transform:translateY(-2px);border-color:var(--tc,var(--acc));box-shadow:0 15px 32px -24px var(--tc,var(--acc));}
.tc h4{margin:0 0 4px;font-size:13.5px;display:flex;align-items:center;gap:7px;}
.tc h4 u{text-decoration:none;font:9.5px var(--mono);color:var(--faint);border:1px solid var(--line);padding:2px 6px;border-radius:20px;}
.tc p{margin:0;font-size:12px;line-height:1.55;color:var(--dim);}
.tc .rng{margin-top:7px;font:10.5px var(--mono);color:var(--tc,var(--acc));}
.empty{border:1px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--faint);font-size:13px;}

/* лестница */
.chart{display:flex;flex-direction:column;gap:9px;}
.crow{display:grid;grid-template-columns:150px minmax(0,1fr) 76px;gap:11px;align-items:center;}
.clabel{display:flex;align-items:center;gap:7px;font-size:12.5px;}
.clabel b{width:9px;height:22px;border-radius:3px;background:var(--ch);flex:none;}
.clabel span{color:var(--tx);}
.clabel u{text-decoration:none;display:block;font:9.5px var(--mono);color:var(--faint);}
.cbar{position:relative;height:26px;background:var(--ink);border:1px solid var(--line);border-radius:7px;overflow:hidden;display:flex;}
.cseg{height:100%;display:flex;align-items:center;justify-content:center;font:700 9.5px var(--mono);overflow:hidden;white-space:nowrap;transition:width .4s cubic-bezier(.2,.7,.3,1);}
.cseg.real{background:linear-gradient(180deg,color-mix(in srgb,var(--li) 82%,#000),var(--li));color:#0a1400;}
.cseg.fake{background:repeating-linear-gradient(115deg,var(--mg) 0 7px,color-mix(in srgb,var(--mg) 42%,#000) 7px 14px);color:#2a0020;}
.cseg.ovl{background:repeating-linear-gradient(45deg,var(--am) 0 4px,color-mix(in srgb,var(--am) 30%,#000) 4px 8px);color:#241a00;}
.ctot{font:600 12px var(--mono);color:var(--acc);text-align:right;}
.clegend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:13px;font-size:11.5px;color:var(--dim);}
.clegend span{display:inline-flex;align-items:center;gap:6px;}
.clegend b{width:14px;height:11px;border-radius:3px;display:block;}

/* грабли */
.traps{display:flex;flex-direction:column;gap:10px;}
.trap{border:1px solid var(--line);border-left-width:3px;border-radius:13px;background:var(--surf);overflow:hidden;transition:.18s;}
.trap.crit{border-left-color:var(--rd);} .trap.warn{border-left-color:var(--am);} .trap.info{border-left-color:var(--cy);}
.trap.open{box-shadow:0 18px 40px -30px var(--acc);}
.trap-h{display:flex;align-items:center;gap:10px;padding:12px 15px;cursor:pointer;flex-wrap:wrap;background:none;border:0;width:100%;text-align:left;color:var(--tx);}
.trap-h:hover{background:color-mix(in srgb,var(--acc) 6%,transparent);}
.trap-h .sev{font:700 9.5px/1 var(--mono);letter-spacing:.1em;padding:4px 8px;border-radius:20px;}
.trap.crit .sev{color:#2a0008;background:var(--rd);} .trap.warn .sev{color:#241a00;background:var(--am);} .trap.info .sev{color:#04121a;background:var(--cy);}
.trap-h b{font-size:13.5px;flex:1;min-width:180px;}
.trap-h .file{font:10.5px var(--mono);color:var(--faint);border:1px solid var(--line);padding:3px 7px;border-radius:20px;}
.trap-h .car{color:var(--faint);transition:.2s;font-size:12px;}
.trap.open .car{transform:rotate(90deg);color:var(--acc);}
.trap-b{padding:0 15px 15px;border-top:1px solid var(--line);}
.trap-b>p{margin:12px 0;font-size:13px;line-height:1.7;color:var(--dim);}
.diff{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.dcol{border:1px solid var(--line);border-radius:11px;overflow:hidden;background:#03050a;}
.dcol h6{margin:0;padding:8px 11px;font:600 9.5px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;border-bottom:1px solid var(--line);}
.dcol.bad h6{color:var(--rd);background:color-mix(in srgb,var(--rd) 10%,var(--over));}
.dcol.good h6{color:var(--li);background:color-mix(in srgb,var(--li) 10%,var(--over));}
.dcol pre{margin:0;padding:10px 12px;font:11.5px/1.65 var(--mono);color:#cfe0f7;white-space:pre-wrap;word-break:break-word;}
.dcol.bad pre{color:#ffb3bf;} .dcol.good pre{color:#d6f7a8;}

/* коды проверок */
.codes{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:10px;}
.code{border:1px solid var(--line);border-left-width:3px;border-radius:12px;background:var(--surf);padding:12px 14px;}
.code.crit{border-left-color:var(--rd);} .code.warn{border-left-color:var(--am);} .code.info{border-left-color:var(--cy);}
.code header{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.code header b{font:700 11px var(--mono);color:var(--tx);border:1px solid var(--line);padding:2px 7px;border-radius:20px;}
.code header em{font-style:normal;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;}
.code.crit em{color:var(--rd);} .code.warn em{color:var(--am);} .code.info em{color:var(--cy);}
.code p{margin:0 0 6px;font-size:12.5px;line-height:1.6;}
.code small{display:block;font-size:11.5px;line-height:1.55;color:var(--dim);}

/* маршрут */
.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:11px;}
.fs{border:1px solid var(--line);border-radius:13px;background:var(--surf);padding:14px 15px;position:relative;overflow:hidden;transition:.18s;}
.fs:hover{transform:translateY(-3px);border-color:var(--acc);box-shadow:0 18px 36px -26px var(--acc);}
.fs::after{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--acc),var(--acc2));}
.fs b{display:block;font:700 10px/1 var(--mono);letter-spacing:.16em;color:var(--acc);margin-bottom:7px;}
.fs h4{margin:0 0 6px;font-size:14px;}
.fs p{margin:0 0 10px;font-size:12.5px;line-height:1.6;color:var(--dim);}

/* чеклист */
.know{display:flex;flex-direction:column;gap:8px;}
.kn{display:flex;gap:11px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:12px 14px;
  cursor:pointer;text-align:left;transition:.16s;color:var(--tx);width:100%;}
.kn:hover{border-color:var(--acc);}
.kn.done{border-color:color-mix(in srgb,var(--li) 45%,transparent);background:color-mix(in srgb,var(--li) 7%,var(--surf));}
.kn i{width:20px;height:20px;border-radius:6px;border:1px solid var(--line);flex:none;display:grid;place-items:center;
  font-style:normal;font-size:12px;color:transparent;transition:.16s;margin-top:1px;}
.kn.done i{background:var(--li);border-color:transparent;color:#0a1400;}
.kn div{min-width:0;}
.kn b{display:block;font-size:13.5px;margin-bottom:3px;}
.kn span{font-size:12.5px;line-height:1.6;color:var(--dim);}
.kn.done b{color:var(--li);}

/* drawer / toast */
.scrim{position:fixed;inset:0;background:#03050acc;backdrop-filter:blur(3px);z-index:90;animation:fade .2s both;}
@keyframes fade{from{opacity:0}to{opacity:1}}
.dw{position:fixed;top:0;right:0;bottom:0;width:min(430px,100%);z-index:91;background:var(--surf);border-left:1px solid var(--line);
  display:flex;flex-direction:column;box-shadow:-30px 0 70px -30px #000;animation:slide .26s cubic-bezier(.2,.7,.3,1) both;}
@keyframes slide{from{transform:translateX(100%)}to{transform:none}}
.dw-h{padding:17px 19px 14px;border-bottom:1px solid var(--line);position:relative;
  background:linear-gradient(140deg,color-mix(in srgb,var(--tc,var(--acc)) 16%,var(--over)),var(--over));}
.dw-h h3{margin:9px 0 6px;font-size:19px;}
.dw-x{position:absolute;top:14px;right:15px;width:31px;height:31px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--tx);cursor:pointer;}
.dw-x:hover{border-color:var(--rd);color:var(--rd);}
.dw-b{padding:17px 19px 26px;overflow-y:auto;display:flex;flex-direction:column;gap:15px;}
.dw-f b{display:block;font:600 9.5px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--faint);margin-bottom:7px;}
.dw-f p{margin:0;font-size:13px;line-height:1.68;}
.dw-code{background:#03050a;border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:11.5px/1.65 var(--mono);color:var(--li);white-space:pre-wrap;word-break:break-word;}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:120;display:flex;align-items:center;gap:11px;
  background:var(--over);border:1px solid var(--li);border-radius:12px;padding:11px 16px;font-size:13px;max-width:calc(100vw - 32px);
  box-shadow:0 22px 46px -24px #000;animation:pop .24s cubic-bezier(.2,.7,.3,1) both;}
@keyframes pop{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
.toast i{width:8px;height:8px;border-radius:50%;background:var(--li);flex:none;}
.toast button{background:none;border:1px solid var(--line);color:var(--acc);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;}
.toast button:hover{border-color:var(--acc);}

@media (max-width:1180px){
  .fd-grid{grid-template-columns:minmax(0,1fr);}
  .fd-rail{position:static;max-height:none;}
  .rl-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));}
  .rl-sec{border-right:1px solid var(--line);}
  .anat{grid-template-columns:minmax(0,1fr);}
  .anat-side{position:static;}
  .call{grid-template-columns:minmax(0,1fr);}
}
@media (max-width:760px){
  .fdg{--hh:108px;}
  .fd-top{height:auto;min-height:var(--hh);flex-wrap:wrap;padding:8px 12px;}
  .fd-nav{order:3;width:100%;}
  .fd-wrap{padding-left:11px;padding-right:11px;}
  .hero{padding:24px 18px;}
  .pipe-track{grid-template-columns:1fr;height:auto;gap:8px;}
  .pk{display:none;}
  .diff{grid-template-columns:1fr;}
  .crow{grid-template-columns:110px minmax(0,1fr) 62px;gap:8px;}
  .mp-lane{grid-template-columns:22px 50px minmax(0,1fr);}
  .mp-meta{grid-column:1/-1;text-align:left;}
  .tgrid,.codes,.flow,.zcards{grid-template-columns:1fr;}
  .rl-body{grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){.fgd *{animation:none!important;transition:none!important;}.rv{opacity:1;transform:none;}}
`;

/* ══════════════════════════ содержание ══════════════════════════ */

const SECTIONS = [
  ["model", "Модель"], ["call", "apply_call"], ["anatomy", "Код"], ["map", "Карта"],
  ["controls", "Пульт"], ["ladder", "Лестница"], ["traps", "Грабли"], ["codes", "Коды"],
  ["flow", "Маршрут"], ["know", "Что знать"]
];

const ZONES = [
  { id: "pre", name: "Пролог", hue: "#22d3ee", short: "Блоки до ядра: фильтры, oob, свои приёмы.",
    points: [
      ["Зачем", "Отсечь лишнее до того, как ядро начнёт резать поток. Каждый отсев здесь экономит вызовы Lua."],
      ["Что класть", "flt_l7 (только нужный протокол), flt_len (минимум байт), flt_once (лимит на соединение), oob, hostcase."],
      ["Порядок", "oob обязан быть в прологе: он должен видеть SYN, а ядро после себя поток уже разрезало."],
      ["Возврат", "Любой return VERDICT_PASS в прологе завершает функцию — ядро не выполнится. Это нормальный отсев."]
    ] },
  { id: "core", name: "Ядро", hue: "#9ef01a", short: "fake_ip_misdirection → outline_random_split. Управляется пультом.",
    points: [
      ["Состав", "Фейк с подменой dst/TTL (включается тумблером), затем случайный разрез нагрузки. Порядок зафиксирован и не переставляется."],
      ["Почему так", "Фейк обязан уйти раньше реальных сегментов: DPI должен увидеть подставные данные до настоящих."],
      ["Аргументы", "Ядро не читает пульт напрямую — кузница подставляет значения через apply_call, поэтому твои --lua-desync аргументы остаются нетронутыми."],
      ["Вердикт", "Разрез возвращает DROP после успешной отправки сегментов, фейк — PASS. Агрегатор оставит DROP."]
    ] },
  { id: "post", name: "Эпилог", hue: "#ff4fd8", short: "Блоки после ядра: доработка, отправка, вердикт.",
    points: [
      ["Зачем", "Добавить приём, который должен отработать по уже разрезанному потоку, или явно задать исход функции."],
      ["Что класть", "udplen для UDP-ветки, log для отладки, dropset если ты сам отправлял данные, явный вердикт."],
      ["Осторожно", "После ядра оригинал уже помечен на дроп. Второй сегментирующий приём здесь обычно бесполезен."],
      ["Вердикт", "Если явного return нет, кузница дописывает return get_verdict() — агрегированный итог всех вызовов."]
    ] }
];

const CALL_STEPS = [
  { t: "Вход", code: 0, note: "desync.arg содержит то, что ты передал в --lua-desync=my_fn:ip_ttl=8:badsum:pos=1,midsld. Это единственная таблица аргументов на весь инстанс — общая для всех блоков." },
  { t: "saved", code: 1, note: "Перед вызовом блока запоминаем текущие значения только тех ключей, которые собираемся перекрыть. Остальные аргументы не трогаем вообще." },
  { t: "override", code: 2, note: "Записываем аргументы блока. Именно поэтому пульт может задать блоку свой TTL, не ломая то, что ты передал снаружи." },
  { t: "pcall", code: 3, note: "Вызываем функцию с НАСТОЯЩЕЙ таблицей desync, а не с прокси. C-функции движка читают поля напрямую, и подменная таблица могла бы им не понравиться. pcall ловит ошибку, чтобы один блок не ронял всю цепочку." },
  { t: "restore", code: 4, note: "Возвращаем сохранённые значения. Следующий блок снова видит исходные аргументы — блоки не наследуют мусор друг от друга." },
  { t: "verdict", code: 5, note: "Агрегируем итог: DROP перебивает MODIFY и PASS, MODIFY перебивает PASS. Функция возвращает get_verdict() один раз в самом конце." }
];

const CALL_CODE = [
  "local saved = {}",
  "for k, v in pairs(over) do saved[k] = desync.arg[k]; desync.arg[k] = v end",
  "-- аргументы блока активны",
  "local ok, v = pcall(fn, ctx, desync)",
  "for k in pairs(over) do desync.arg[k] = saved[k] end",
  "if v == VERDICT_DROP then verdict = VERDICT_DROP end"
];

const ARG_BASE = { ip_ttl: "8", badsum: "true", pos: "1,midsld", mode: "host" };
const ARG_OVER = { ip_ttl: "3", mode: "pos" };

const ANATOMY = [
  { c: "function my_combo(ctx, desync)", n: "Контракт desync-функции", t: "#22d3ee", d: "Движок вызывает функцию на каждый подходящий пакет и передаёт ctx (контекст C-API) и desync (всё о пакете: dis, track, arg, l7payload, reasm_data). Имя функции — это то, что ты пишешь в --lua-desync." },
  { c: "    if not desync.dis.tcp then", n: "Транспортный гейт", t: "#22d3ee", d: "Ядро режет только TCP. Всё остальное сразу отпускаем. Важно: внутри этой ветки нельзя резать инстанс на related ICMP." },
  { c: "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end", n: "Почему проверяется ICMP", t: "#ff5470", d: "Related ICMP (например frag needed) приходит вне TCP-потока. Если на нём сделать cutoff, ты сломаешь PMTU и соединение начнёт витать. В исходном random_split.lua этой проверки не было — это одна из исправленных грабель." },
  { c: "        return VERDICT_PASS", n: "Нейтральный выход", t: "#8296b8", d: "PASS значит «я ничего не сделал, пакет идёт дальше по цепочке инстансов профиля». Это не ошибка и не дроп." },
  { c: "    end", n: "Конец гейта", t: "#8296b8", d: "Дальше идут только TCP-пакеты." },
  { c: "    direction_cutoff_opposite(ctx, desync)", n: "Отсечение встречного направления", t: "#8b5cf6", d: "Штатный хелпер: инстанс перестаёт вызываться на пакетах противоположного направления. Экономит CPU и защищает от двойной обработки." },
  { c: "    if not direction_check(desync) then return VERDICT_PASS end", n: "Аргумент dir", t: "#8b5cf6", d: "Уважает dir=in|out|any из аргументов инстанса. Без этой строки аргумент dir просто игнорируется — так было в обоих исходных файлах." },
  { c: "    if desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end", n: "Аргумент payload", t: "#8b5cf6", d: "Проверяем только если аргумент задан явно. Иначе неполный ClientHello с нераспознанной нагрузкой отсеялся бы именно там, где он нужен." },
  { c: "    if not replay_first(desync) then", n: "Защита от replay", t: "#fbbf24", d: "Когда движок собрал сообщение из нескольких пакетов (reasm), он проигрывает куски заново. Действовать надо один раз — на первом проходе." },
  { c: "        if replay_drop(desync) then return VERDICT_DROP end", n: "Дроп отложенных кусков", t: "#fbbf24", d: "Если данные уже отправлены нами в собранном виде, оригинальные куски надо дропать, иначе сервер получит дубли." },
  { c: "        return VERDICT_PASS", n: "Пропуск replay", t: "#8296b8", d: "Не первый проход и дропать нечего — выходим." },
  { c: "    end", n: "Конец replay-ветки", t: "#8296b8", d: "Дальше — только первый проход." },
  { c: "    local apply_call, get_verdict = make_caller(ctx, desync)", n: "Фабрика вызовов", t: "#9ef01a", d: "Создаёт две функции: apply_call для вызова блока с временной подменой аргументов и get_verdict для чтения агрегированного итога. Состояние живёт в замыкании на время одного пакета." },
  { c: "    -- пролог", n: "Зона пролога", t: "#22d3ee", d: "Сюда попадают блоки, добавленные с настройкой «куда: до ядра». Каждый — самодостаточный фрагмент, часто обёрнутый в do ... end, чтобы имена локалов не сталкивались." },
  { c: "    apply_call(fake_ip_misdirection, { ip_dst = \"192.0.2.1\", ip_ttl = 8 })", n: "Первый вызов ядра", t: "#ff4fd8", d: "Фейк с подменой адреса и TTL. Уходит до реальных данных, чтобы DPI разобрал подставное. Возвращает PASS — оригинал не трогает." },
  { c: "    apply_call(outline_random_split, { mode = \"host\", parts = 3 })", n: "Второй вызов ядра", t: "#9ef01a", d: "Случайный разрез внутри SNI на нужное число частей. Отправляет сегменты сам и возвращает DROP, чтобы оригинал не ушёл целиком." },
  { c: "    -- эпилог", n: "Зона эпилога", t: "#ff4fd8", d: "Блоки «после ядра». Оригинал уже помечен на дроп, поэтому здесь уместны доработки и явные вердикты, а не повторная сегментация." },
  { c: "    return get_verdict()", n: "Агрегированный итог", t: "#fbbf24", d: "DROP > MODIFY > PASS. Если ни один блок не вернул вердикт, итог — PASS." },
  { c: "end", n: "Конец функции", t: "#8296b8", d: "Функция готова к подключению через --lua-init=@\"%~dp0my_combo.lua\" после lib и antidpi." }
];

const CONTROLS = [
  { id: "mode", g: "Разрез", t: "Режим разреза", k: "select", r: "host · random · mid · pos", d: "Способ выбрать точки разреза нагрузки.",
    long: "host — случайная точка внутри имени сайта (SNI/Host), самый осмысленный вариант против SNI-фильтрации. random — случайная точка в заданной доле потока. mid — ровно посередине. pos — явные маркеры zapret (host, endhost, midsld, числа, отрицательные от конца).", trap: "A023" },
  { id: "marker", g: "Разрез", t: "Маркеры", k: "text", r: "midsld · host,endhost · 1,midsld", d: "Список маркеров для режима pos.",
    long: "Маркеры разрешаются в конкретные байтовые позиции функцией resolve_multi_pos. midsld — середина домена второго уровня, host — начало имени, endhost — граница после имени. Числа считаются от начала, отрицательные — от конца. Работает только в режиме pos.", trap: "A022" },
  { id: "parts", g: "Разрез", t: "Сегментов", k: "stepper", r: "2 … 8", d: "На сколько частей резать нагрузку.",
    long: "Больше частей — больше шансов, что DPI не соберёт имя, но больше и служебного трафика, и нагрузки на CPU. Для ClientHello обычно достаточно 2–4. Уникальные точки сортируются, повторы отбрасываются." },
  { id: "seqovl", g: "Разрез", t: "Перекрытие seq", k: "slider", r: "0 … 48 байт", d: "Сколько байтов предыдущего сегмента повторить.",
    long: "Второй сегмент отправляется со смещением назад и содержит хвост первого. DPI видит перекрывающиеся данные и может собрать имя неправильно, а сервер корректно. По умолчанию берутся реальные байты; если задан seqovl_pattern — заполняется паттерном.", trap: "A021" },
  { id: "disorder", g: "Разрез", t: "Обратный порядок", k: "toggle", r: "disorder", d: "Отправлять сегменты с конца к началу.",
    long: "Сегменты уходят в обратном порядке. TCP на сервере соберёт их по seq правильно, а DPI, собирающий поток по порядку прихода, получит кашу. Комбинируется с перекрытием." },
  { id: "fakeBefore", g: "Разрез", t: "Фейк до сегмента", k: "toggle", r: "fake", d: "Подставной кусок перед каждым реальным.",
    long: "Перед каждым реальным сегментом уходит фейк того же диапазона с fooling из аргументов (TTL, badsum). Реальные части при этом идут без fooling — это принципиально, иначе сервер их отбросит.", trap: "A005" },
  { id: "fakeAfter", g: "Разрез", t: "Фейк после", k: "toggle", r: "fake2", d: "Ещё один фейк после реального сегмента.",
    long: "Удваивает количество подставных пакетов. Имеет смысл против DPI, который смотрит на данные после первого прохода. Заметно поднимает трафик." },
  { id: "fakeIp", g: "Фейк IP", t: "Подмена dst + TTL", k: "toggle", r: "ядро", d: "Включает вызов fake_ip_misdirection.",
    long: "Отправляет копию пакета с другим IPv4-адресом получателя и низким TTL. Идея: DPI свяжет подставные данные не с тем соединением, а сервер фейк не получит вовсе." },
  { id: "ipDst", g: "Фейк IP", t: "IPv4 dst", k: "text", r: "A.B.C.D", d: "Куда «уходит» фейк.",
    long: "По умолчанию 192.0.2.1 — TEST-NET-1 из RFC 5737, гарантированно не маршрутизируется в интернете. Можно поставить адрес из белого списка провайдера, если DPI фильтрует по назначению." },
  { id: "ttl", g: "Фейк IP", t: "TTL фейка", k: "slider", r: "1 … 64", d: "Сколько хопов проживёт подставной пакет.",
    long: "Ключевой параметр. Фейк должен умереть после DPI, но до сервера. TTL 1 умирает на домашнем роутере — DPI его не увидит. TTL 64 дойдёт до сервера. Рабочий диапазон обычно 6–10, точное значение подбирается через ip_autottl.", trap: "A002" },
  { id: "repeats", g: "Фейк IP", t: "Повторов", k: "slider", r: "1 … 5", d: "Сколько копий фейка отправить.",
    long: "Иногда DPI пропускает первый подставной пакет. Повторы повышают шанс, но линейно увеличивают трафик. Больше 2–3 редко имеет смысл." },
  { id: "maxFake", g: "Фейк IP", t: "Фейков на поток", k: "stepper", r: "0 … 8", d: "Лимит отправок на одно соединение.",
    long: "Счётчик живёт в desync.track.lua_state и переживает пакеты одного соединения. По достижении лимита инстанс отключается через cutoff. Ноль снимает лимит — и тогда фейк уходит на каждом пакете с нагрузкой.", trap: "A024" },
  { id: "tcpTs", g: "Фейк IP", t: "tcp_ts", k: "text", r: "сдвиг timestamp", d: "Сдвиг TCP timestamp у фейка.",
    long: "Отрицательный сдвиг делает фейк «старым» с точки зрения PAWS. Полезно, когда DPI ориентируется на временные метки. Применяется через штатный apply_fooling." },
  { id: "tlsMod", g: "Фейк IP", t: "tls_mod", k: "text", r: "rnd · rndsni · sni=…", d: "Модификация подставного ClientHello.",
    long: "rnd — случайные байты в случайных полях, rndsni — случайное имя, sni=vk.com — конкретное имя, dupsid, padencap. Работает только для tls_client_hello и только с собранным reasm." },
  { id: "badsum", g: "Фейк IP", t: "Битая сумма", k: "toggle", r: "badsum", d: "Портит контрольную сумму фейка.",
    long: "Сервер отбросит пакет с неверной суммой на уровне стека, а DPI, который не проверяет сумму, его разберёт. Вторая страховка рядом с TTL — включать почти всегда.", trap: "A001" },
  { id: "domain", g: "Нагрузка", t: "Домен (SNI)", k: "text", r: "полное имя", d: "Имя сайта для карты разреза.",
    long: "Меняет модель ClientHello на сцене: длину имени, позицию host-диапазона и разрешимость маркеров. На реальный трафик не влияет — это параметр предпросмотра.", trap: "A022" },
  { id: "total", g: "Нагрузка", t: "Длина hello", k: "slider", r: "160 … 1400 B", d: "Размер моделируемого ClientHello.",
    long: "Реальные hello обычно 250–600 байт, с постквантовыми расширениями бывают больше. Влияет на позиции разрезов и на то, сколько байтов уйдёт в сеть." },
  { id: "dir", g: "Нагрузка", t: "Фильтр направления", k: "toggle", r: "dir", d: "Уважать аргумент dir инстанса.",
    long: "Добавляет direction_cutoff_opposite и direction_check. Выключай только если функция сознательно должна работать в обе стороны." },
  { id: "payloadArg", g: "Нагрузка", t: "payload-аргумент", k: "toggle", r: "payload", d: "Проверять аргумент payload.",
    long: "Проверка выполняется только когда аргумент задан, поэтому неполный hello не отсеивается. Отключение снимает и эту защиту.", trap: "A008" },
  { id: "replay", g: "Нагрузка", t: "Защита replay", k: "toggle", r: "replay", d: "Действовать только на первом проходе.",
    long: "Обязательна для всех сегментирующих приёмов: без неё собранный reasm будет отправлен повторно на каждом отложенном куске." },
  { id: "cutoff", g: "Нагрузка", t: "Cutoff после успеха", k: "toggle", r: "cutoff", d: "Отключить инстанс, когда приём отработал.",
    long: "Экономит CPU на длинных соединениях. Ядро включает его только когда данные пришли из одного пакета: при собранном reasm отложенные куски должны продолжать дропаться.", trap: "A025" },
  { id: "nodrop", g: "Нагрузка", t: "Не дропать оригинал", k: "toggle", r: "nodrop", d: "Оставить оригинальный пакет в цепочке.",
    long: "Полезно для отладки, когда нужно увидеть, что уходит без изменений. В бою обычно выключено: сегменты уже отправлены, оригинал стал дублем." },
  { id: "speed", g: "Сцена", t: "Скорость", k: "slider", r: "0.25× … 3×", d: "Темп проигрывания отправок.", long: "Только визуализация. Замедли, чтобы рассмотреть порядок фейков и реальных частей." },
  { id: "scale", g: "Сцена", t: "Масштаб карты", k: "slider", r: "0.7× … 1.6×", d: "Размер полос и подписей.", long: "Увеличь на большом экране или уменьши, чтобы уместить больше сегментов без прокрутки." },
  { id: "pal", g: "Сцена", t: "Палитра", k: "select", r: "cyan · magenta · lime · amber", d: "Акцентная пара интерфейса.", long: "Меняет акценты, свечения и ползунки. Семантика цветов сегментов не меняется: реальный всегда кислотный, фейк всегда пурпурный." }
];

const LADDER = [
  { n: "multisplit", s: "pos=1,midsld", h: "#22d3ee", real: 512, fake: 0, ovl: 0 },
  { n: "multidisorder", s: "+ seqovl=2", h: "#3b82f6", real: 512, fake: 0, ovl: 2 },
  { n: "fake + split", s: "фейк целиком", h: "#8b5cf6", real: 512, fake: 512, ovl: 0 },
  { n: "fakedsplit", s: "фейк до и после", h: "#ff4fd8", real: 512, fake: 1024, ovl: 0 },
  { n: "fakeddisorder", s: "+ обратный порядок", h: "#fbbf24", real: 512, fake: 1024, ovl: 2 },
  { n: "hostfakesplit", s: "подмена имени", h: "#9ef01a", real: 512, fake: 32, ovl: 0 }
];

const TRAPS = [
  { id: "t1", sev: "crit", f: "random_split.lua", t: "Проверка ClientHello применялась ко всему подряд",
    d: "is_complete_client_hello смотрит на байты 0x16 0x03 у любой нагрузки. Для HTTP-запроса они никогда не совпадут, функция всегда считала данные «неполным hello» и резала ровно на 1 байт — вместо случайного разреза внутри имени.",
    bad: "if not is_complete_client_hello(data) then\n    -- срабатывает и на HTTP, и на unknown\n    local p1 = string.sub(data, 1, 1)",
    good: "local is_tls = (desync.l7payload == \"tls_client_hello\")\nif is_tls and not rs_hello_complete(data) then\n    -- только настоящий неполный TLS hello\n    local n = math.floor(rs_num(desync, \"hello_split\", 1))" },
  { id: "t2", sev: "crit", f: "random_split.lua", t: "Cutoff на related ICMP ломал PMTU",
    d: "На любом не-TCP пакете вызывался instance_cutoff_shim. Related ICMP (frag needed, time exceeded) приходит вне TCP-потока — инстанс отключался и переставал обрабатывать соединение целиком.",
    bad: "if not desync.dis.tcp then\n    instance_cutoff_shim(ctx, desync)\n    return\nend",
    good: "if not desync.dis.tcp then\n    if not desync.dis.icmp then\n        instance_cutoff_shim(ctx, desync)\n    end\n    return VERDICT_PASS\nend" },
  { id: "t3", sev: "crit", f: "fake_ip_misdirection.lua", t: "apply_fooling вызывался с третьим аргументом",
    d: "В zapret-lib.lua сигнатура — apply_fooling(desync, dis). Третья таблица просто игнорировалась, поэтому ip_ttl и tcp_ts из аргументов не применялись: фейк уходил с обычным TTL и доходил до сервера.",
    bad: "apply_fooling(desync, fake_dis, {\n    ip_ttl = desync.arg.ip_ttl or DEFAULT_IP_TTL,\n    tcp_ts = desync.arg.tcp_ts,\n})",
    good: "local saved = {}\nfor k, v in pairs(over) do\n    saved[k] = desync.arg[k]; desync.arg[k] = v\nend\npcall(apply_fooling, desync, fake)\nfor k in pairs(over) do desync.arg[k] = saved[k] end" },
  { id: "t4", sev: "crit", f: "random_split.lua", t: "Реальные сегменты уходили с fooling",
    d: "rawsend_payload_segmented вызывался без таблицы опций, поэтому ip_ttl и badsum из аргументов применялись к настоящим данным. Сервер получал реальные куски с битой суммой и отбрасывал их — соединение рвалось вместо обхода.",
    bad: "rawsend_payload_segmented(desync, part1, 0)\nrawsend_payload_segmented(desync, part2, off)",
    good: "local opts_orig = {\n    rawsend = rawsend_opts_base(desync),\n    reconstruct = {}, ipfrag = {},\n    ipid = desync.arg,\n    fooling = { tcp_ts_up = desync.arg.tcp_ts_up }\n}\nrawsend_payload_segmented(desync, part, off, opts_orig)" },
  { id: "t5", sev: "warn", f: "fake_ip_misdirection.lua", t: "TTL по умолчанию равен 1",
    d: "Пакет с TTL 1 умирает на первом же хопе — домашнем роутере. Внешний DPI его никогда не видит, и весь приём работает вхолостую.",
    bad: "local DEFAULT_IP_TTL = 1",
    good: "over.ip_ttl = fim_num(desync, \"ip_ttl\", 8)\n-- либо авто-подбор:\n-- ip_autottl=-2,3-12 в аргументах инстанса" },
  { id: "t6", sev: "warn", f: "fake_ip_misdirection.lua", t: "Фейк на каждом пакете соединения",
    d: "Ограничения по количеству не было: каждый исходящий пакет с нагрузкой порождал копию. На длинной сессии это десятки лишних пакетов и заметный трафик.",
    bad: "--没有任何 счётчика\nlocal fake_dis = deepcopy(desync.dis)\n-- отправка на каждом пакете",
    good: "local st = desync.track and desync.track.lua_state\nlocal key = \"fim_\" .. tostring(desync.func_instance or 0)\nlocal n = st[key] or 0\nif maxfake > 0 and n >= maxfake then\n    instance_cutoff_shim(ctx, desync)\n    return VERDICT_PASS\nend\nst[key] = n + 1" },
  { id: "t7", sev: "warn", f: "random_split.lua", t: "math.random не сеялся",
    d: "Без randomseed LuaJIT выдаёт одну и ту же последовательность после каждого старта процесса. «Случайный» разрез оказывался предсказуемым и одинаковым для всех соединений.",
    bad: "local sp = math.random(host_range[1], host_range[2] - 1)",
    good: "local s = os.time()\nlocal ok, t = pcall(clock_gettime)\nif ok and tonumber(t) then s = s + math.floor(tonumber(t) * 1000) end\nlocal okp, pid = pcall(getpid)\nif okp and tonumber(pid) then s = s + tonumber(pid) * 7919 end\nmath.randomseed(s % 2147483647)" },
  { id: "t8", sev: "warn", f: "оба файла", t: "Аргументы dir и payload игнорировались",
    d: "Проверялось только desync.outgoing напрямую. Стандартные аргументы инстанса dir=in|out|any и payload=… не работали, хотя документация обещала их поддержку.",
    bad: "if not desync.outgoing or not desync.dis.tcp then\n    return VERDICT_PASS\nend",
    good: "direction_cutoff_opposite(ctx, desync)\nif not direction_check(desync) then return VERDICT_PASS end\nif desync.arg.payload and not payload_check(desync) then\n    return VERDICT_PASS\nend" },
  { id: "t9", sev: "info", f: "random_split.lua", t: "seqovl мог перекрыть весь первый сегмент",
    d: "Условие split_pos >= seqovl допускало равенство. При split_pos == seqovl второй сегмент начинался со смещения 0 и содержал весь первый — вместо небольшого перекрытия получалось полное дублирование.",
    bad: "if seqovl > 0 and split_pos >= seqovl then\n    part2_offset = split_pos - seqovl",
    good: "if i == 2 and seqovl > 0 and off >= seqovl then\n    local ovl = string.sub(data, off - seqovl + 1, off)\n    part = ovl .. part\n    off = off - seqovl\nend" },
  { id: "t10", sev: "info", f: "ядро", t: "Cutoff при собранном reasm опасен",
    d: "Если отключить инстанс сразу после отправки собранного сообщения, отложенные куски перестанут обрабатываться и не будут дропаться — сервер получит дубли. Ядро включает cutoff только когда данные из одного пакета.",
    bad: "instance_cutoff_shim(ctx, desync)\nreturn VERDICT_DROP",
    good: "replay_drop_set(desync)\nif desync.arg.cutoff and not desync.reasm_data then\n    instance_cutoff_shim(ctx, desync)\nend\nreturn nodrop and VERDICT_PASS or VERDICT_DROP" }
];

const CODES = [
  { id: "A001", lv: "crit", t: "Фейк дойдёт до сервера", d: "TTL высокий и badsum выключен.", f: "Снизь TTL до 6–10 или включи битую сумму." },
  { id: "A002", lv: "warn", t: "Фейк умрёт слишком рано", d: "TTL 1–2: пакет не доживает до DPI.", f: "Поставь 8 или используй ip_autottl." },
  { id: "A005", lv: "crit", t: "Фейки сегментов без fooling", d: "Подставные куски уйдут серверу как настоящие.", f: "Включи badsum или снизь TTL." },
  { id: "A008", lv: "info", t: "payload не проверяется", d: "Функция пойдёт по любой нагрузке профиля.", f: "Включи payload-аргумент или задай --payload." },
  { id: "A013", lv: "info", t: "oob не в прологе", d: "Соединение уже разрезано, SYN он не увидит.", f: "Перенеси блок oob в пролог." },
  { id: "A021", lv: "warn", t: "Перекрытие отменится", d: "seqovl больше позиции первого разреза.", f: "Уменьши seqovl или сдвинь разрез правее." },
  { id: "A022", lv: "warn", t: "Хост без точки", d: "Маркеры host и midsld не разрешатся.", f: "Укажи полное доменное имя." },
  { id: "A023", lv: "info", t: "Короткий SLD", d: "Случайный разрез внутри имени почти вырожден.", f: "Попробуй режим pos с маркером midsld." },
  { id: "A024", lv: "warn", t: "Фейк на каждом пакете", d: "maxfake=0 снимает лимит на соединение.", f: "Поставь 1–2." },
  { id: "A025", lv: "info", t: "Cutoff и reasm", d: "Ядро само не отключится при собранном reasm.", f: "Это безопасно, оставь как есть." },
  { id: "L001", lv: "crit", t: "Блоки не сбалансированы", d: "Лишний end или незакрытый function/if/do.", f: "Проверь парность открывающих и закрывающих ключевых слов." },
  { id: "L014", lv: "warn", t: "Неизвестная функция", d: "Вызов имени, которого нет ни в библиотеках, ни в локалах.", f: "Проверь опечатку или подключи файл через --lua-init." }
];

const FLOW = [
  { n: "01", t: "Собрать в кузнице", d: "Выбрать пресет или блоки, настроить ядро пультом, посмотреть карту разреза.", to: "forge", cta: "Открыть кузницу" },
  { n: "02", t: "Забрать файлы", d: "Скачать my_combo.lua и my_combo.bat. Рядом положить random_split.max.lua и fake_ip_misdirection.max.lua.", to: null, cta: "" },
  { n: "03", t: "Проверить сборку", d: "Прогнать .bat через проверку: порядок lua-init, порты, переносы, флаги.", to: "audit", cta: "Разбор всех BAT" },
  { n: "04", t: "Замерить на доменах", d: "Сгенерировать test-zapret.ps1 и прогнать каждую стратегию по каждому домену.", to: "strategytest", cta: "Тест стратегий" },
  { n: "05", t: "Прочитать матрицу", d: "Вставить zapret-test.json: увидеть, где прошло, и получить совет поднять или опустить ступень.", to: "strategytest", cta: "Матрица" },
  { n: "06", t: "Вернуться и докрутить", d: "Поменять режим, число частей, TTL — и повторить замер. Кузница хранит пресеты и сборку.", to: "forge", cta: "Докрутить" }
];

const KNOW = [
  { id: "k1", t: "Порядок lua-init жёсткий", d: "lib → antidpi → auto → свои файлы. Свои функции обязаны идти после antidpi, иначе не найдут хелперов или будут переопределены." },
  { id: "k2", t: "Файлы лежат рядом с .bat", d: "random_split.max.lua и fake_ip_misdirection.max.lua подключаются через --lua-init=@\"%~dp0имя.lua\". Без них ядро вызовет несуществующие функции." },
  { id: "k3", t: "Кавычки вокруг %~dp0 обязательны", d: "Пробел в пути к папке разорвёт команду. Всё, что содержит %~dp0, берётся в двойные кавычки." },
  { id: "k4", t: "Запуск от администратора", d: "WinDivert требует прав администратора. В .bat уже есть проверка через net session." },
  { id: "k5", t: "Вердикты агрегируются", d: "DROP перебивает MODIFY и PASS, MODIFY перебивает PASS. Возврат из середины функции завершает её целиком — блоки после return не выполнятся." },
  { id: "k6", t: "reasm и replay — разные вещи", d: "reasm_data — собранное из нескольких пакетов сообщение. replay — повторный проход его кусков. Действовать надо на первом проходе и дропать остальные." },
  { id: "k7", t: "Фейк обязан уйти раньше реального", d: "Если сегменты ушли первыми, DPI уже разобрал настоящее имя и подстава бесполезна. Поэтому ядро вызывает фейк до разреза." },
  { id: "k8", t: "Fooling — только фейкам", d: "TTL и badsum применяются к подставным частям. Реальные сегменты идут с чистыми опциями, иначе сервер их отбросит." },
  { id: "k9", t: "Кузница ничего не запускает", d: "Это генератор кода и предпросмотр. Реальную работу проверяет test-zapret.ps1 на Windows, а не браузер." },
  { id: "k10", t: "Сборка сохраняется сама", d: "Параметры, блоки и seed пишутся в localStorage. Пресеты можно сохранять вручную и откатывать удаление через «вернуть»." }
];

/* ══════════════════════════ утилиты ══════════════════════════ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const KW = new Set("function local end if then else elseif for while do return repeat until break and or not nil true false in".split(" "));
const FNS = new Set("apply_call get_verdict make_caller pcall pairs deepcopy desync_opts rawsend_opts rawsend_opts_base reconstruct_opts apply_fooling apply_ip_id rawsend_dissect rawsend_payload_segmented direction_check direction_cutoff_opposite payload_check replay_first replay_drop replay_drop_set instance_cutoff_shim resolve_range resolve_multi_pos blob blob_or_def blob_exist pattern DLOG fake_ip_misdirection outline_random_split fake multisplit multidisorder fakedsplit fakeddisorder hostfakesplit udplen oob http_hostcase clock_gettime getpid math string".split(" "));

function hl(line) {
  if (/^\s*--/.test(line)) return <span className="cm">{line}</span>;
  return line.split(/("(?:\\.|[^"\\])*"|\b[A-Za-z_]\w*\b|\b\d+\b)/g).map((t, i) => {
    if (!t) return null;
    if (/^"/.test(t)) return <span className="st" key={i}>{t}</span>;
    if (KW.has(t)) return <span className="kw" key={i}>{t}</span>;
    if (/^\d+$/.test(t)) return <span className="nm" key={i}>{t}</span>;
    if (FNS.has(t)) return <span className="fn" key={i}>{t}</span>;
    return <span key={i}>{t}</span>;
  });
}

const HEAD = 76;
function buildMap(domain, parts, seqovl, disorder, fakes) {
  const sni = String(domain || "www.youtube.com");
  const tail = clamp(512 - HEAD - sni.length, 24, 1400);
  const len = HEAD + sni.length + tail;
  const hs = HEAD + 1, he = HEAD + sni.length;
  const cuts = [];
  for (let i = 0; i < parts - 1; i++) {
    const c = clamp(hs + Math.floor(((i + 1) / parts) * Math.max(1, sni.length - 1)), 1, len - 1);
    if (!cuts.includes(c)) cuts.push(c);
  }
  cuts.sort((a, b) => a - b);
  const segs = []; let start = 1;
  for (let i = 0; i <= cuts.length; i++) {
    const stop = cuts[i] ?? len;
    let off = start - 1, base = stop - start + 1, ovl = 0;
    if (i === 1 && seqovl > 0 && off >= seqovl) { ovl = seqovl; off -= seqovl; }
    segs.push({ s: start, e: stop, off, base, ovl, len: base + ovl });
    start = stop + 1;
  }
  const order = segs.map((_, i) => i);
  if (disorder) order.reverse();
  const em = [];
  order.forEach(i => {
    const s = segs[i];
    if (fakes) em.push({ kind: "fake", off: s.s - 1, len: s.base });
    em.push({ kind: "real", off: s.off, len: s.len, ovl: s.ovl });
  });
  return { len, sni, tail, cuts, em };
}

/* ══════════════════════════ анимированные части ══════════════════════════ */

function Pipeline({ speed, packets, fakes, playing }) {
  const [t, setT] = useState(0);
  const raf = useRef(0); const last = useRef(0); const acc = useRef(0);
  const sp = useRef(speed); const pl = useRef(playing);
  useEffect(() => { sp.current = speed; pl.current = playing; }, [speed, playing]);
  useEffect(() => {
    const loop = ts => {
      if (!last.current) last.current = ts;
      const dt = Math.min(60, ts - last.current); last.current = ts;
      if (pl.current) { acc.current = (acc.current + dt * sp.current / 4200) % 1; setT(acc.current); }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; last.current = 0; };
  }, []);

  const list = useMemo(() => {
    const out = [];
    for (let i = 0; i < packets; i++) {
      const phase = (t + i / packets) % 1;
      out.push({ phase, fake: fakes && i % 2 === 1 });
    }
    return out;
  }, [t, packets, fakes]);

  const zoneOf = p => p < 0.28 ? 0 : p < 0.74 ? 1 : 2;
  const hot = [0, 0, 0];
  list.forEach(p => { hot[zoneOf(p.phase)] = 1; });
  const passedCore = list.some(p => p.phase > 0.6);
  const passedFake = fakes && list.some(p => p.fake && p.phase > 0.45);

  return (
    <div className="pipe">
      <div className="pipe-track">
        {[
          { n: "Пролог", c: "#22d3ee", s: "фильтры · oob · отсев", f: "flt_l7 → flt_once" },
          { n: "Ядро", c: "#9ef01a", s: "фейк, затем разрез", f: "fake_ip → random_split" },
          { n: "Эпилог", c: "#ff4fd8", s: "доработка · вердикт", f: "log → get_verdict" }
        ].map((z, i) => (
          <div key={z.n} className={"zone" + (hot[i] && playing ? " hot" : "")} style={{ "--zc": z.c }}>
            <h4>{z.n}</h4><small>{z.s}</small><div className="fn">{z.f}</div>
          </div>
        ))}
        {list.map((p, i) => (
          <span key={i} className={"pk " + (p.fake ? "fake" : "real")}
            style={{ left: `calc(${(p.phase * 100).toFixed(2)}% - 6px)`, opacity: p.phase > 0.97 ? 0.2 : 1 }} />
        ))}
      </div>
      <div className="pipe-foot">
        <span className={"vb pass" + (list.some(p => p.phase < 0.3) ? " on" : "")}>PASS</span>
        <span className={"vb mod"}>MODIFY</span>
        <span className={"vb drop" + (passedCore ? " on" : "")}>DROP</span>
        <span className="agg">
          {passedFake ? "фейк отправлен · " : ""}итог: <b>{passedCore ? "VERDICT_DROP" : "VERDICT_PASS"}</b>
        </span>
      </div>
    </div>
  );
}

function CallStepper({ speed, playing }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const raf = useRef(0); const last = useRef(0); const acc = useRef(0);
  const sp = useRef(speed); const au = useRef(true); const pl = useRef(playing);
  useEffect(() => { sp.current = speed; au.current = auto; pl.current = playing; }, [speed, auto, playing]);
  useEffect(() => {
    const loop = ts => {
      if (!last.current) last.current = ts;
      const dt = Math.min(60, ts - last.current); last.current = ts;
      if (au.current && pl.current) {
        acc.current += dt * sp.current;
        if (acc.current >= 1900) { acc.current = 0; setStep(s => (s + 1) % CALL_STEPS.length); }
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); raf.current = 0; last.current = 0; };
  }, []);

  const rows = Object.keys(ARG_BASE).map(k => {
    const overridden = Object.prototype.hasOwnProperty.call(ARG_OVER, k);
    let val = ARG_BASE[k], cls = "";
    if (step === 1 && overridden) { val = ARG_BASE[k]; cls = "sav"; }
    else if ((step === 2 || step === 3) && overridden) { val = ARG_OVER[k]; cls = "chg"; }
    else if (step >= 4 && overridden) { val = ARG_BASE[k]; cls = "sav"; }
    return { k, val, cls };
  });

  const pick = i => { setStep(i); setAuto(false); acc.current = 0; };

  return (
    <>
      <div className="call">
        <div className="call-code">
          {CALL_CODE.map((l, i) => (
            <span key={i} className={"cl" + (CALL_STEPS[step].code === i ? " hot" : "")}>{hl(l)}</span>
          ))}
        </div>
        <div className="argt">
          <h5>desync.arg</h5>
          <table><tbody>
            {rows.map(r => (
              <tr key={r.k} className={r.cls}><td>{r.k}</td><td>{r.val}</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <div className="call-steps">
        {CALL_STEPS.map((s, i) => (
          <button key={s.t} className={"cs" + (step === i ? " on" : "")} onClick={() => pick(i)}>{i + 1}. {s.t}</button>
        ))}
        <button className={"fd-btn sm" + (auto ? " on" : "")} onClick={() => { setAuto(a => !a); acc.current = 0; }}>
          {auto ? "❚❚ авто" : "▶ авто"}
        </button>
      </div>
      <div className="call-note">
        <b>{CALL_STEPS[step].t}</b>
        <p>{CALL_STEPS[step].note}</p>
      </div>
    </>
  );
}

/* ══════════════════════════ страница ══════════════════════════ */

const LS = "forge:guide:v1";
const DEF = { speed: 1, sc: 1, packets: 6, glow: true, grid: true, pal: "cyan", fakes: true, disorder: false, parts: 3, seqovl: 0, ttl: 8, hilite: true };

export default function ForgeGuide({ onNav }) {
  const boot = useMemo(() => {
    try { const s = JSON.parse(localStorage.getItem(LS) || "null"); if (s) return s; } catch { /* приватный режим */ }
    return null;
  }, []);
  const reduced = useMemo(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  const [t, setT] = useState({ ...DEF, ...(boot?.t || {}) });
  const [done, setDone] = useState(boot?.done || []);
  const [sec, setSec] = useState("model");
  const [prog, setProg] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [zone, setZone] = useState("core");
  const [line, setLine] = useState(2);
  const [cq, setCq] = useState(""); const [cg, setCg] = useState("Все"); const [cs, setCs] = useState("group");
  const [kq, setKq] = useState(""); const [kl, setKl] = useState("all");
  const [tq, setTq] = useState(""); const [tl, setTl] = useState("all");
  const [open, setOpen] = useState({ t1: true });
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);
  const undoRef = useRef(null);
  const heroRef = useRef(null);

  const set = useCallback((k, v) => setT(s => ({ ...s, [k]: v })), []);
  const say = useCallback((msg, undo) => { undoRef.current = undo || null; setToast({ msg, k: Date.now() }); }, []);

  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ t, done })); } catch { /* ignore */ } }, [t, done]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => { setToast(null); undoRef.current = null; }, 4200); return () => clearTimeout(id); }, [toast]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        setProg(max > 0 ? clamp(h.scrollTop / max, 0, 1) : 0);
        if (heroRef.current) {
          const y = Math.min(h.scrollTop, 700);
          const bg = heroRef.current.querySelector(".hero-bg");
          const gr = heroRef.current.querySelector(".hero-grid");
          if (bg) bg.style.transform = `translateY(${y * 0.16}px)`;
          if (gr) gr.style.transform = `translateY(${y * 0.07}px)`;
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") {
      document.querySelectorAll(".fgd .rv").forEach(e => e.classList.add("in"));
      return;
    }
    const rev = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); rev.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    document.querySelectorAll(".fgd .rv").forEach(e => rev.observe(e));
    const spy = new IntersectionObserver(es => {
      const v = es.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (v) setSec(v.target.id);
    }, { rootMargin: "-90px 0px -58% 0px", threshold: [0.04, 0.25, 0.6] });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) spy.observe(el); });
    return () => { rev.disconnect(); spy.disconnect(); };
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") setDrawer(null);
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); say(msg); }
    catch { say("Буфер недоступен — выдели текст вручную"); }
  };
  const download = (text, name) => {
    const b = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
    say("Скачано: " + name);
  };
  const cheat = () => {
    const L = ["# Кузница — шпаргалка", "", "## Модель", ""];
    ZONES.forEach(z => { L.push(`### ${z.name}`); z.points.forEach(([a, b]) => L.push(`- **${a}**: ${b}`)); L.push(""); });
    L.push("## apply_call", "");
    CALL_STEPS.forEach((s, i) => L.push(`${i + 1}. **${s.t}** — ${s.note}`));
    L.push("", "## Грабли", "");
    TRAPS.forEach(x => L.push(`- [${x.sev}] **${x.t}** (${x.f}) — ${x.d}`));
    L.push("", "## Коды проверок", "");
    CODES.forEach(c => L.push(`- **${c.id}** (${c.lv}) ${c.t}: ${c.d} → ${c.f}`));
    L.push("", "## Что надо знать", "");
    KNOW.forEach(k => L.push(`- **${k.t}** — ${k.d}`));
    download(L.join("\n"), "kuznica-shpargalka.md");
  };

  const map = useMemo(() => buildMap("www.youtube.com", t.parts, t.seqovl, t.disorder, t.fakes), [t.parts, t.seqovl, t.disorder, t.fakes]);
  const pct = v => (v / map.len) * 100;
  const maxTotal = Math.max(...LADDER.map(r => r.real + r.fake + r.ovl));

  const groups = ["Все", ...Array.from(new Set(CONTROLS.map(c => c.g)))];
  const tools = useMemo(() => {
    const n = cq.trim().toLowerCase();
    const l = CONTROLS.filter(c => (cg === "Все" || c.g === cg) && (!n || (c.t + " " + c.d + " " + c.long + " " + c.id).toLowerCase().includes(n)));
    return [...l].sort((a, b) => cs === "alpha" ? a.t.localeCompare(b.t, "ru") : a.g.localeCompare(b.g, "ru") || a.t.localeCompare(b.t, "ru"));
  }, [cq, cg, cs]);
  const codes = useMemo(() => {
    const n = kq.trim().toLowerCase();
    return CODES.filter(c => (kl === "all" || c.lv === kl) && (!n || (c.id + " " + c.t + " " + c.d + " " + c.f).toLowerCase().includes(n)));
  }, [kq, kl]);
  const traps = useMemo(() => {
    const n = tq.trim().toLowerCase();
    return TRAPS.filter(x => (tl === "all" || x.sev === tl) && (!n || (x.t + " " + x.d + " " + x.f).toLowerCase().includes(n)));
  }, [tq, tl]);

  const toggleKnow = id => setDone(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  const resetKnow = () => { const snap = [...done]; setDone([]); say("Прогресс чтения сброшен", () => setDone(snap)); };
  const resetAll = () => {
    const snap = { ...t };
    setT({ ...DEF });
    say("Пульт сброшен", () => setT(snap));
  };
  const shuffle = () => {
    setT(s => ({
      ...s,
      parts: 2 + Math.floor(Math.random() * 5),
      seqovl: Math.floor(Math.random() * 10),
      disorder: Math.random() > 0.5,
      fakes: Math.random() > 0.4,
      ttl: 4 + Math.floor(Math.random() * 10),
      packets: 4 + Math.floor(Math.random() * 7),
      pal: ["cyan", "magenta", "lime", "amber"][Math.floor(Math.random() * 4)]
    }));
    say("Параметры перемешаны");
  };

  const Tg = ({ k, label, hint }) => (
    <button className={"rl-tg" + (t[k] ? " on" : "")} onClick={() => set(k, !t[k])} aria-pressed={!!t[k]}>
      <i aria-hidden="true" />{label}{hint && <u>{hint}</u>}
    </button>
  );
  const Sld = ({ k, label, min, max, step = 1, fmt }) => (
    <>
      <div className="rl-row"><label htmlFor={"g-" + k}>{label}</label><span className="rl-val">{fmt ? fmt(t[k]) : t[k]}</span></div>
      <input id={"g-" + k} className="rl-sld" type="range" min={min} max={max} step={step} value={t[k]}
        onChange={e => set(k, parseFloat(e.target.value))} />
    </>
  );

  const ringPct = done.length / KNOW.length;
  const C = 2 * Math.PI * 14;

  return (
    <div className="fgd" data-pal={t.pal} data-grid={t.grid ? 1 : 0} data-glow={t.glow ? 1 : 0} style={{ "--sc": t.sc }}>
      <style>{CSS}</style>

      <header className="fd-top">
        <div className="fd-brand"><i>⚡</i>Кузница<em>как работает</em></div>
        <nav className="fd-nav">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={"#" + id} className={sec === id ? "on" : ""}>{label}</a>
          ))}
        </nav>
        <div className="fd-top-r">
          <svg className="fd-ring" viewBox="0 0 34 34" aria-label={`Прочитано ${done.length} из ${KNOW.length}`}>
            <circle cx="17" cy="17" r="14" fill="none" stroke="#1b2740" strokeWidth="3" />
            <circle cx="17" cy="17" r="14" fill="none" stroke="url(#gg)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - ringPct)} transform="rotate(-90 17 17)" />
            <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9ef01a" /><stop offset="100%" stopColor="#22d3ee" />
            </linearGradient></defs>
            <text x="17" y="21" textAnchor="middle" fontSize="10" fill="#e6edfb" fontFamily="monospace">{done.length}</text>
          </svg>
          <button className="fd-btn" onClick={() => setPlaying(p => !p)}>{playing ? "❚❚ пауза" : "▶ анимация"}</button>
          <button className="fd-btn pri" onClick={() => onNav?.("forge")}>в кузницу</button>
        </div>
      </header>
      <div className="fd-prog" style={{ width: `${prog * 100}%` }} />

      <div className="fd-wrap">
        <div className="fd-grid">
          <div className="fd-main">

            {/* HERO */}
            <section className="hero" id="intro" ref={heroRef}>
              <div className="hero-bg" aria-hidden="true"><i /><i /><i /></div>
              <div className="hero-grid" aria-hidden="true" />
              <div className="hero-grain" aria-hidden="true" />
              <span className="eyebrow">руководство по сборке функций</span>
              <h1>Кузница собирает функцию<br />из <em>готовых приёмов</em></h1>
              <p className="sub">
                Ты не пишешь пакетную логику с нуля. Ты выбираешь блоки, настраиваешь ядро пультом — и кузница
                выдаёт Lua-функцию, где каждый приём вызывается со своими аргументами, не мешая соседним.
                Ниже разобрано всё: модель сборки, механика вызова, чтение карты разреза, грабли исходных файлов
                и коды проверок.
              </p>
              <Pipeline speed={t.speed} packets={t.packets} fakes={t.fakes} playing={playing} />
              <div className="hero-facts">
                <div className="fact"><b>3</b><span>зоны сборки</span></div>
                <div className="fact li"><b>{BLOCK_COUNT()}</b><span>блоков в палитре</span></div>
                <div className="fact mg"><b>{CONTROLS.length}</b><span>параметров пульта</span></div>
                <div className="fact am"><b>{TRAPS.length}</b><span>разобранных грабель</span></div>
                <div className="fact"><b>{CODES.length}</b><span>кодов проверок</span></div>
              </div>
            </section>

            {/* МОДЕЛЬ */}
            <section className="pan rv" id="model" style={{ "--hue": "#22d3ee" }}>
              <div className="ph"><span className="k">01</span><h2>Модель сборки: три зоны</h2>
                <span className="sp"><span className="fd-pill">пролог → ядро → эпилог</span></span></div>
              <div className="pb">
                <p className="lead">Функция всегда состоит из трёх зон. Ядро зафиксировано и управляется пультом, а пролог и эпилог ты наполняешь блоками из палитры.</p>
                <div className="zcards">
                  {ZONES.map(z => (
                    <button key={z.id} className={"zc" + (zone === z.id ? " on" : "")} style={{ "--zc": z.hue }} onClick={() => setZone(z.id)}>
                      <h4>{z.name}</h4><p>{z.short}</p>
                    </button>
                  ))}
                </div>
                <div className="zdetail">
                  <h5>{ZONES.find(z => z.id === zone).name}</h5>
                  <ul>
                    {ZONES.find(z => z.id === zone).points.map(([a, b]) => <li key={a}><b>{a}.</b> {b}</li>)}
                  </ul>
                </div>
              </div>
            </section>

            {/* APPLY_CALL */}
            <section className="pan rv" id="call" style={{ "--hue": "#9ef01a" }}>
              <div className="ph"><span className="k">02</span><h2>apply_call — почему блоки не мешают друг другу</h2>
                <span className="sp"><span className="fd-pill">6 шагов</span></span></div>
              <div className="pb">
                <p className="lead">
                  Все блоки делят одну таблицу <code>desync.arg</code>. Если каждый будет писать в неё что попало,
                  второй приём получит мусор от первого. Кузница решает это временной подменой с возвратом.
                </p>
                <CallStepper speed={t.speed} playing={playing} />
              </div>
            </section>

            {/* АНАТОМИЯ */}
            <section className="pan rv" id="anatomy" style={{ "--hue": "#8b5cf6" }}>
              <div className="ph"><span className="k">03</span><h2>Анатомия сгенерированной функции</h2>
                <span className="sp">
                  <button className={"fd-btn sm" + (t.hilite ? " on" : "")} onClick={() => set("hilite", !t.hilite)}>подсветка</button>
                  <button className="fd-btn sm" onClick={() => copy(ANATOMY.map(a => a.c).join("\n"), "Каркас функции скопирован")}>копировать каркас</button>
                </span></div>
              <div className="pb">
                <p>Нажми на строку — справа появится объяснение, зачем она нужна и что сломается без неё.</p>
                <div className="anat">
                  <div className="anat-code">
                    <pre>
                      {ANATOMY.map((a, i) => (
                        <span key={i} className={"al" + (line === i ? " on" : "")} onClick={() => setLine(i)}
                          role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setLine(i); }}>
                          <i>{i + 1}</i>{t.hilite ? hl(a.c) : a.c}
                        </span>
                      ))}
                    </pre>
                  </div>
                  <aside className="anat-side" style={{ "--tc": ANATOMY[line].t }}>
                    <span className="tag">строка {line + 1}</span>
                    <h4>{ANATOMY[line].n}</h4>
                    <p>{ANATOMY[line].d}</p>
                    <div className="snip">{ANATOMY[line].c.trim()}</div>
                    <div className="anat-nav">
                      <button className="fd-btn sm" onClick={() => setLine(l => Math.max(0, l - 1))} disabled={line === 0}>← выше</button>
                      <button className="fd-btn sm" onClick={() => setLine(l => Math.min(ANATOMY.length - 1, l + 1))} disabled={line === ANATOMY.length - 1}>ниже →</button>
                    </div>
                  </aside>
                </div>
              </div>
            </section>

            {/* КАРТА */}
            <section className="pan rv" id="map" style={{ "--hue": "#fbbf24" }}>
              <div className="ph"><span className="k">04</span><h2>Как читать карту разреза</h2>
                <span className="sp"><span className="fd-pill">{map.em.length} отправок · {map.len} B</span></span></div>
              <div className="pb">
                <p className="lead">
                  Верхняя полоса — модель ClientHello: заголовки, имя сайта и расширения. Жёлтые линии — точки разреза.
                  Ниже — дорожки отправок в том порядке, в котором пакеты уйдут в сеть.
                </p>
                <div className="mp">
                  {playing && <div className="mp-sweep" style={{ animationDuration: `${5.5 / t.speed}s` }} />}
                  <div className="mp-legend">
                    <span><b style={{ background: "linear-gradient(180deg,#22d3ee,#3b82f6)" }} />SNI</span>
                    <span><b style={{ background: "#9ef01a" }} />реальный сегмент</span>
                    <span><b style={{ background: "repeating-linear-gradient(115deg,#ff4fd8 0 4px,#7a1f68 4px 8px)" }} />фейк</span>
                    <span><b style={{ background: "repeating-linear-gradient(45deg,#fbbf24 0 3px,transparent 3px 6px)", border: "1px solid #fbbf24" }} />перекрытие</span>
                    <span><b style={{ background: "#fbbf24" }} />разрез</span>
                  </div>
                  <div className="mp-ruler">
                    {[0, .25, .5, .75, 1].map(f => <u key={f} style={{ left: `${f * 100}%` }}>{Math.round(f * map.len)}</u>)}
                  </div>
                  <div className="mp-track">
                    <div className="mp-reg h" style={{ left: 0, width: `${pct(HEAD)}%` }}>header {HEAD}B</div>
                    <div className="mp-reg s" style={{ left: `${pct(HEAD)}%`, width: `${pct(map.sni.length)}%` }}>{map.sni}</div>
                    <div className="mp-reg t" style={{ left: `${pct(HEAD + map.sni.length)}%`, width: `${pct(map.tail)}%` }}>extensions</div>
                    {map.cuts.map(c => <div className="mp-cut" key={c} style={{ left: `${pct(c)}%` }}><u>{c}</u></div>)}
                  </div>
                  <div className="mp-lanes">
                    {map.em.map((e, i) => (
                      <div className="mp-lane" key={i}>
                        <span className="mp-no">{i + 1}</span>
                        <span className={"mp-kind " + e.kind}>{e.kind === "real" ? "REAL" : "FAKE"}</span>
                        <span className="mp-bar">
                          <span className={"mp-fill " + e.kind} style={{ left: `${pct(e.off)}%`, width: `${pct(e.len)}%` }} />
                          {e.ovl > 0 && <span className="mp-ovl" style={{ left: `${pct(e.off)}%`, width: `${pct(e.ovl)}%` }} />}
                        </span>
                        <span className="mp-meta">off <b>{e.off}</b> · {e.len}B{e.ovl ? ` · ov ${e.ovl}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p style={{ marginTop: 14 }}>
                  Меняй <b>сегменты</b>, <b>перекрытие</b>, <b>обратный порядок</b> и <b>фейки</b> в пульте — карта перестроится сразу.
                  Смещение <code>off</code> — это позиция куска в TCP-потоке; при перекрытии она уходит назад, и сервер получает часть байтов дважды.
                </p>
              </div>
            </section>

            {/* ПУЛЬТ */}
            <section className="pan rv" id="controls" style={{ "--hue": "#22d3ee" }}>
              <div className="ph"><span className="k">05</span><h2>Пульт кузницы: что за что отвечает</h2>
                <span className="sp"><span className="fd-pill">{tools.length} / {CONTROLS.length}</span></span></div>
              <div className="pb">
                <div className="tools">
                  <input className="inp" style={{ flex: "1 1 200px" }} value={cq} onChange={e => setCq(e.target.value)} placeholder="Поиск параметра…" aria-label="Поиск параметра" />
                  <select className="rl-sel" style={{ width: 150 }} value={cs} onChange={e => setCs(e.target.value)} aria-label="Сортировка">
                    <option value="group">по группам</option><option value="alpha">по алфавиту</option>
                  </select>
                  {groups.map(g => (
                    <button key={g} className={"chip" + (cg === g ? " on" : "")} onClick={() => setCg(g)}>
                      {g}<u>{g === "Все" ? CONTROLS.length : CONTROLS.filter(c => c.g === g).length}</u>
                    </button>
                  ))}
                </div>
                {tools.length === 0 ? <div className="empty">Ничего не найдено — сбрось поиск или выбери другую группу.</div> : (
                  <div className="tgrid">
                    {tools.map(c => (
                      <button key={c.id} className="tc" style={{ "--tc": TONEG(c.g) }} onClick={() => setDrawer(c)}>
                        <h4>{c.t}<u>{c.k}</u></h4>
                        <p>{c.d}</p>
                        <div className="rng">{c.r}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ЛЕСТНИЦА */}
            <section className="pan rv" id="ladder" style={{ "--hue": "#ff4fd8" }}>
              <div className="ph"><span className="k">06</span><h2>Лестница усиления и цена приёма</h2>
                <span className="sp"><span className="fd-pill">hello 512 B</span></span></div>
              <div className="pb">
                <p className="lead">
                  Если приём не сработал — поднимаешься на ступень выше. Каждая ступень добавляет трафика.
                  Ниже реальная цена для ClientHello в 512 байт: сколько уйдёт настоящих данных, подставных и перекрытия.
                </p>
                <div className="clegend">
                  <span><b style={{ background: "#9ef01a" }} />реальные байты</span>
                  <span><b style={{ background: "repeating-linear-gradient(115deg,#ff4fd8 0 5px,#7a1f68 5px 10px)" }} />фейковые байты</span>
                  <span><b style={{ background: "repeating-linear-gradient(45deg,#fbbf24 0 4px,#7a5c00 4px 8px)" }} />перекрытие</span>
                </div>
                <div className="chart">
                  {LADDER.map(r => {
                    const tot = r.real + r.fake + r.ovl;
                    return (
                      <div className="crow" key={r.n}>
                        <div className="clabel" style={{ "--ch": r.h }}>
                          <b /><span>{r.n}<u>{r.s}</u></span>
                        </div>
                        <div className="cbar" title={`${r.n}: реальные ${r.real} B, фейк ${r.fake} B, перекрытие ${r.ovl} B`}>
                          <span className="cseg real" style={{ width: `${(r.real / maxTotal) * 100}%` }}>{r.real}</span>
                          {r.fake > 0 && <span className="cseg fake" style={{ width: `${(r.fake / maxTotal) * 100}%` }}>{r.fake}</span>}
                          {r.ovl > 0 && <span className="cseg ovl" style={{ width: `${(r.ovl / maxTotal) * 100}%` }} />}
                        </div>
                        <div className="ctot">{tot} B</div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ marginTop: 14 }}>
                  <b>hostfakesplit</b> стоит почти как обычный сплит, потому что подменяет только имя, а не весь пакет.
                  <b>fakedsplit</b> и <b>fakeddisorder</b> утраивают трафик — их включают, когда лёгкие ступени уже не проходят.
                </p>
              </div>
            </section>

            {/* ГРАБЛИ */}
            <section className="pan rv" id="traps" style={{ "--hue": "#ff5470" }}>
              <div className="ph"><span className="k">07</span><h2>Грабли исходных файлов</h2>
                <span className="sp">
                  <button className="fd-btn sm" onClick={() => setOpen(Object.fromEntries(TRAPS.map(x => [x.id, true])))}>раскрыть все</button>
                  <button className="fd-btn sm" onClick={() => setOpen({})}>свернуть</button>
                </span></div>
              <div className="pb">
                <p className="lead">
                  Это реальные дефекты в загруженных <code>random_split.lua</code> и <code>fake_ip_misdirection.lua</code>.
                  Версии <code>.max.lua</code> их исправляют — здесь показано, что именно и почему.
                </p>
                <div className="tools">
                  <input className="inp" style={{ flex: "1 1 200px" }} value={tq} onChange={e => setTq(e.target.value)} placeholder="Поиск по граблям…" aria-label="Поиск по граблям" />
                  {[["all", "все"], ["crit", "критично"], ["warn", "warning"], ["info", "замечание"]].map(([k, l]) => (
                    <button key={k} className={"chip" + (tl === k ? " on" : "")} onClick={() => setTl(k)}>
                      {l}<u>{k === "all" ? TRAPS.length : TRAPS.filter(x => x.sev === k).length}</u>
                    </button>
                  ))}
                </div>
                {traps.length === 0 ? <div className="empty">По этому фильтру грабель нет.</div> : (
                  <div className="traps">
                    {traps.map(x => (
                      <article key={x.id} className={"trap " + x.sev + (open[x.id] ? " open" : "")}>
                        <button className="trap-h" onClick={() => setOpen(o => ({ ...o, [x.id]: !o[x.id] }))} aria-expanded={!!open[x.id]}>
                          <span className="sev">{x.sev === "crit" ? "критично" : x.sev === "warn" ? "warning" : "замечание"}</span>
                          <b>{x.t}</b>
                          <span className="file">{x.f}</span>
                          <span className="car">▶</span>
                        </button>
                        {open[x.id] && (
                          <div className="trap-b">
                            <p>{x.d}</p>
                            <div className="diff">
                              <div className="dcol bad"><h6>было</h6><pre>{x.bad}</pre></div>
                              <div className="dcol good"><h6>стало</h6><pre>{x.good}</pre></div>
                            </div>
                            <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
                              <button className="fd-btn sm" onClick={() => copy(x.good, "Исправленный фрагмент скопирован")}>копировать фикс</button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* КОДЫ */}
            <section className="pan rv" id="codes" style={{ "--hue": "#fbbf24" }}>
              <div className="ph"><span className="k">08</span><h2>Коды проверок</h2>
                <span className="sp"><span className="fd-pill">{codes.length} / {CODES.length}</span></span></div>
              <div className="pb">
                <p>A-коды — смысловые подсказки по параметрам сборки. L-коды — проверка самого Lua-кода.</p>
                <div className="tools">
                  <input className="inp" style={{ flex: "1 1 200px" }} value={kq} onChange={e => setKq(e.target.value)} placeholder="Поиск кода или текста…" aria-label="Поиск кода" />
                  {[["all", "все"], ["crit", "критично"], ["warn", "warning"], ["info", "замечание"]].map(([k, l]) => (
                    <button key={k} className={"chip" + (kl === k ? " on" : "")} onClick={() => setKl(k)}>{l}</button>
                  ))}
                </div>
                {codes.length === 0 ? <div className="empty">Коды не найдены.</div> : (
                  <div className="codes">
                    {codes.map(c => (
                      <article key={c.id} className={"code " + c.lv}>
                        <header><b>{c.id}</b><em>{c.lv === "crit" ? "критично" : c.lv === "warn" ? "warning" : "замечание"}</em></header>
                        <p>{c.t}</p>
                        <small>{c.d}</small>
                        <small style={{ color: "var(--li)", marginTop: 5 }}>→ {c.f}</small>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* МАРШРУТ */}
            <section className="pan rv" id="flow" style={{ "--hue": "#9ef01a" }}>
              <div className="ph"><span className="k">09</span><h2>Рабочий маршрут</h2></div>
              <div className="pb">
                <p className="lead">Кузница — только первый шаг. Реальную работоспособность подтверждает прогон на доменах.</p>
                <div className="flow">
                  {FLOW.map(f => (
                    <article className="fs" key={f.n}>
                      <b>ШАГ {f.n}</b><h4>{f.t}</h4><p>{f.d}</p>
                      {f.to && <button className="fd-btn sm pri" onClick={() => onNav?.(f.to)}>{f.cta}</button>}
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* ЧТО ЗНАТЬ */}
            <section className="pan rv" id="know" style={{ "--hue": "#8b5cf6" }}>
              <div className="ph"><span className="k">10</span><h2>Что надо знать перед запуском</h2>
                <span className="sp">
                  <span className="fd-pill">{done.length} / {KNOW.length}</span>
                  <button className="fd-btn sm" onClick={() => setDone(KNOW.map(k => k.id))}>отметить всё</button>
                  <button className="fd-btn sm dgr" onClick={resetKnow}>сбросить</button>
                  <button className="fd-btn sm pri" onClick={cheat}>шпаргалка .md</button>
                </span></div>
              <div className="pb">
                <div className="know">
                  {KNOW.map(k => (
                    <button key={k.id} className={"kn" + (done.includes(k.id) ? " done" : "")} onClick={() => toggleKnow(k.id)} aria-pressed={done.includes(k.id)}>
                      <i>✓</i><div><b>{k.t}</b><span>{k.d}</span></div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

          </div>

          {/* ПУЛЬТ */}
          <aside className="fd-rail" aria-label="Пульт объяснения">
            <div className="rl-h"><b>Пульт объяснения</b><u>live</u></div>
            <div className="rl-body">
              <div className="rl-sec">
                <h3>Анимация</h3>
                <Sld k="speed" label="Скорость" min={0.25} max={3} step={0.25} fmt={v => v.toFixed(2) + "×"} />
                <div className="rl-row"><label>Пакетов в конвейере</label>
                  <span className="rl-step">
                    <button onClick={() => set("packets", clamp(t.packets - 1, 2, 14))} aria-label="Меньше">−</button>
                    <b>{t.packets}</b>
                    <button onClick={() => set("packets", clamp(t.packets + 1, 2, 14))} aria-label="Больше">+</button>
                  </span></div>
                <div style={{ height: 10 }} />
                <Tg k="fakes" label="Показывать фейки" hint="fake" />
                <button className={"rl-tg" + (playing ? " on" : "")} onClick={() => setPlaying(p => !p)} aria-pressed={playing}>
                  <i aria-hidden="true" />{playing ? "Анимация идёт" : "Анимация на паузе"}<u>Space</u>
                </button>
              </div>

              <div className="rl-sec">
                <h3>Карта разреза</h3>
                <div className="rl-row"><label>Сегментов</label>
                  <span className="rl-step">
                    <button onClick={() => set("parts", clamp(t.parts - 1, 2, 8))} aria-label="Меньше">−</button>
                    <b>{t.parts}</b>
                    <button onClick={() => set("parts", clamp(t.parts + 1, 2, 8))} aria-label="Больше">+</button>
                  </span></div>
                <div style={{ height: 10 }} />
                <Sld k="seqovl" label="Перекрытие seq" min={0} max={40} />
                <Tg k="disorder" label="Обратный порядок" hint="disorder" />
                <div className="rl-note">
                  {map.em.length} отправок · {map.cuts.length} разрезов ·{" "}
                  {t.seqovl > 0 && map.cuts[0] != null && t.seqovl > map.cuts[0] ? "перекрытие отменится (A021)" : "перекрытие корректно"}
                </div>
              </div>

              <div className="rl-sec">
                <h3>Разбор TTL</h3>
                <Sld k="ttl" label="TTL фейка" min={1} max={64} />
                <div className="rl-note" style={{ color: t.ttl <= 2 ? "var(--am)" : t.ttl >= 32 ? "var(--rd)" : "var(--li)" }}>
                  {t.ttl <= 2 ? "A002: умрёт на первом хопе — DPI не увидит"
                    : t.ttl >= 32 ? "A001: дойдёт до сервера, нужен badsum"
                    : "рабочий диапазон: DPI увидит, сервер — нет"}
                </div>
              </div>

              <div className="rl-sec">
                <h3>Оформление</h3>
                <Sld k="sc" label="Масштаб" min={0.7} max={1.6} step={0.1} fmt={v => v.toFixed(1) + "×"} />
                <Tg k="glow" label="Свечение" hint="glow" />
                <Tg k="grid" label="Сетка" hint="grid" />
                <Tg k="hilite" label="Подсветка кода" hint="syntax" />
                <div style={{ height: 9 }} />
                <div className="rl-row"><label htmlFor="g-pal">Палитра</label></div>
                <select id="g-pal" className="rl-sel" value={t.pal} onChange={e => set("pal", e.target.value)}>
                  <option value="cyan">cyan · violet</option>
                  <option value="magenta">magenta · violet</option>
                  <option value="lime">lime · cyan</option>
                  <option value="amber">amber · red</option>
                </select>
              </div>

              <div className="rl-sec">
                <h3>Действия</h3>
                <div className="rl-acts">
                  <button className="fd-btn" onClick={shuffle}>🎲 рандом</button>
                  <button className="fd-btn dgr" onClick={resetAll}>↺ сброс</button>
                  <button className="fd-btn" onClick={cheat}>шпаргалка</button>
                  <button className="fd-btn" onClick={() => copy(location.href, "Ссылка на руководство скопирована")}>ссылка</button>
                  <button className="fd-btn pri" style={{ gridColumn: "1 / -1" }} onClick={() => onNav?.("forge")}>открыть кузницу</button>
                </div>
                <div className="rl-note">Space — пауза анимации · Esc — закрыть панель</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {drawer && (
        <>
          <div className="scrim" onClick={() => setDrawer(null)} />
          <aside className="dw" style={{ "--tc": TONEG(drawer.g) }} role="dialog" aria-modal="true" aria-label={drawer.t}>
            <div className="dw-h">
              <button className="dw-x" onClick={() => setDrawer(null)} aria-label="Закрыть">✕</button>
              <span className="fd-pill">{drawer.g}</span>
              <h3>{drawer.t}</h3>
              <span className="fd-pill">{drawer.k} · {drawer.r}</span>
            </div>
            <div className="dw-b">
              <div className="dw-f"><b>Коротко</b><p>{drawer.d}</p></div>
              <div className="dw-f"><b>Подробно</b><p>{drawer.long}</p></div>
              <div className="dw-f"><b>Идентификатор</b><div className="dw-code">{drawer.id}</div></div>
              {drawer.trap && (
                <div className="dw-f"><b>Связанная проверка</b>
                  <div className="dw-code">{drawer.trap} — {CODES.find(c => c.id === drawer.trap)?.t}</div>
                </div>
              )}
              <button className="fd-btn pri" onClick={() => { setDrawer(null); onNav?.("forge"); }}>настроить в кузнице</button>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="toast" key={toast.k} role="status">
          <i />{toast.msg}
          {undoRef.current && <button onClick={() => { undoRef.current?.(); undoRef.current = null; setToast(null); }}>вернуть</button>}
        </div>
      )}
    </div>
  );
}

function TONEG(g) {
  return { "Разрез": "#9ef01a", "Фейк IP": "#ff4fd8", "Нагрузка": "#22d3ee", "Сцена": "#8b5cf6" }[g] || "#22d3ee";
}
function BLOCK_COUNT() { return 15; }