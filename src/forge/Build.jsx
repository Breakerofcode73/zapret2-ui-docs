// src/pages/Forge.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────── палитра и стили ─────────────────────────── */

const CSS = `
.fg{
  --ink:#04060b; --surf:#080d16; --panel:#0c1320; --over:#111a2b; --line:#1b2740;
  --tx:#e6edfb; --dim:#8296b8; --faint:#5b6d8c;
  --cy:#22d3ee; --bl:#3b82f6; --vi:#8b5cf6; --mg:#ff4fd8; --li:#9ef01a; --am:#fbbf24; --rd:#ff5470;
  --acc:#22d3ee; --acc2:#8b5cf6;
  --mono:ui-monospace,"SF Mono","Cascadia Code",Consolas,monospace;
  --hh:60px; --scale:1;
  color:var(--tx); background:var(--ink); min-height:100vh;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding-bottom:60px;
}
.fg[data-pal="magenta"]{--acc:#ff4fd8;--acc2:#8b5cf6;}
.fg[data-pal="lime"]{--acc:#9ef01a;--acc2:#22d3ee;}
.fg[data-pal="amber"]{--acc:#fbbf24;--acc2:#ff5470;}
.fg *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--acc) var(--surf);}
.fg *::-webkit-scrollbar{width:11px;height:11px;}
.fg *::-webkit-scrollbar-track{background:var(--surf);border-left:1px solid var(--line);}
.fg *::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--acc),var(--acc2));border:3px solid var(--surf);border-radius:20px;}
.fg *::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--mg),var(--acc));}
.fg *::-webkit-scrollbar-corner{background:var(--surf);}

.fg-top{position:fixed;inset:0 0 auto 0;height:var(--hh);z-index:60;display:flex;align-items:center;gap:12px;
  padding:0 16px;background:color-mix(in srgb,var(--over) 90%,transparent);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--line);}
.fg-brand{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.02em;font-size:15px;white-space:nowrap;}
.fg-brand i{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;font-style:normal;font-size:14px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));color:#04060b;box-shadow:0 0 18px -4px var(--acc);}
.fg-brand em{font-style:normal;font:600 10px/1 var(--mono);letter-spacing:.16em;color:var(--acc);
  border:1px solid color-mix(in srgb,var(--acc) 40%,transparent);padding:4px 7px;border-radius:20px;}
.fg-nav{display:flex;gap:2px;margin-left:6px;}
.fg-nav a{font-size:12.5px;color:var(--dim);text-decoration:none;padding:7px 11px;border-radius:9px;transition:.16s;}
.fg-nav a:hover{color:var(--tx);background:var(--panel);}
.fg-nav a.on{color:#04060b;font-weight:700;background:linear-gradient(120deg,var(--acc),var(--acc2));}
.fg-top-r{margin-left:auto;display:flex;align-items:center;gap:8px;}
.fg-route{font:11.5px var(--mono);color:var(--acc);background:var(--ink);border:1px solid var(--line);padding:5px 9px;border-radius:8px;}
.fg-name{background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:9px;padding:8px 11px;
  font:13px var(--mono);width:170px;transition:.16s;}
.fg-name:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 16%,transparent);}

.fg-btn{border:1px solid var(--line);background:var(--panel);color:var(--tx);border-radius:9px;padding:8px 12px;
  font-size:12.5px;cursor:pointer;transition:.16s;white-space:nowrap;display:inline-flex;align-items:center;gap:7px;}
.fg-btn:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);}
.fg-btn:active{transform:translateY(0);}
.fg-btn.pri{background:linear-gradient(120deg,var(--acc),var(--acc2));color:#04060b;font-weight:700;border-color:transparent;}
.fg-btn.pri:hover{color:#04060b;filter:brightness(1.1);}
.fg-btn.dgr:hover{border-color:var(--rd);color:var(--rd);}
.fg-btn.sm{padding:5px 9px;font-size:11.5px;border-radius:7px;}
.fg-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}

.fg-wrap{max-width:1560px;margin:0 auto;padding:calc(var(--hh) + 16px) 16px 0;}
.fg-grid{display:grid;grid-template-columns:minmax(0,1fr) 336px;
  grid-template-areas:"stage rail" "build rail" "code rail";gap:16px;align-items:start;}
.fg-stage{grid-area:stage;} .fg-build{grid-area:build;} .fg-code{grid-area:code;} .fg-rail{grid-area:rail;}
.fg-stage,.fg-build,.fg-code{scroll-margin-top:calc(var(--hh) + 14px);}

.fg-panel{border:1px solid var(--line);border-radius:16px;background:var(--panel);overflow:hidden;
  animation:fgUp .5s both cubic-bezier(.2,.7,.3,1);}
@keyframes fgUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
.fg-ph{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line);
  background:linear-gradient(120deg,color-mix(in srgb,var(--acc) 8%,var(--over)),var(--over));flex-wrap:wrap;}
.fg-ph h2{margin:0;font-size:14.5px;letter-spacing:-.01em;}
.fg-ph .sub{font:11px var(--mono);color:var(--faint);letter-spacing:.1em;text-transform:uppercase;}
.fg-ph .sp{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;}

/* сцена */
.fg-stage .fg-ph{background:linear-gradient(120deg,color-mix(in srgb,var(--mg) 10%,var(--over)),color-mix(in srgb,var(--acc) 8%,var(--over)));}
.pm{position:relative;padding:18px 18px 14px;isolation: isolate;}
.pm-bg{position:absolute;inset:0;z-index:-2;overflow:hidden;}
.pm-bg i{position:absolute;display:block;border-radius:50%;filter:blur(64px);opacity:.4;}
.pm-bg i:nth-child(1){width:44%;height:120%;left:-6%;top:-40%;background:var(--acc);animation:pmF 21s ease-in-out infinite;}
.pm-bg i:nth-child(2){width:38%;height:120%;right:-4%;top:-30%;background:var(--mg);animation:pmF 27s ease-in-out infinite reverse;}
@keyframes pmF{0%,100%{transform:translate3d(0,0,0) scale(1);}50%{transform:translate3d(8%,10%,0) scale(1.2);}}
.pm-grid{position:absolute;inset:0;z-index:-1;opacity:.28;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:34px 34px;mask-image:radial-gradient(ellipse at 40% 0%,#000 25%,transparent 80%);}
.pm[data-grid="0"] .pm-grid{display:none;}
.pm[data-glow="0"] .pm-bg{opacity:.2;}

.pm-legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:11.5px;color:var(--dim);}
.pm-legend span{display:inline-flex;align-items:center;gap:6px;}
.pm-legend b{width:11px;height:11px;border-radius:3px;display:block;}

.pm-ruler{position:relative;height:16px;margin-bottom:4px;}
.pm-ruler u{position:absolute;top:0;font:10px var(--mono);color:var(--faint);text-decoration:none;transform:translateX(-50%);}
.pm-ruler u:first-child{transform:none;} .pm-ruler u:last-child{transform:translateX(-100%);}
.pm-track{position:relative;height:calc(38px * var(--scale));border:1px solid var(--line);border-radius:9px;
  background:var(--ink);overflow:hidden;}
.pm-reg{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;overflow:hidden;
  font:600 calc(10.5px * var(--scale))/1 var(--mono);letter-spacing:.06em;white-space:nowrap;}
.pm-reg.head{background:linear-gradient(180deg,#16233a,#101a2c);color:var(--faint);}
.pm-reg.host{background:linear-gradient(180deg,color-mix(in srgb,var(--cy) 34%,#0b1424),color-mix(in srgb,var(--bl) 26%,#0b1424));
  color:#eafcff;text-shadow:0 1px 6px #000;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cy) 55%,transparent);}
.pm-reg.tail{background:linear-gradient(180deg,#101a2c,#0b1220);color:var(--faint);}
.pm-cut{position:absolute;top:-6px;bottom:-6px;width:2px;background:var(--am);z-index:3;
  box-shadow:0 0 10px var(--am);border-radius:2px;}
.pm-cut u{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font:9.5px var(--mono);color:var(--am);
  background:var(--ink);border:1px solid color-mix(in srgb,var(--am) 45%,transparent);padding:1px 5px;border-radius:20px;text-decoration:none;}
.pm-play{position:absolute;top:0;bottom:0;width:3px;background:var(--li);z-index:4;border-radius:3px;
  box-shadow:0 0 16px var(--li);transition:left .09s linear;}

.pm-lanes{margin-top:16px;display:flex;flex-direction:column;gap:calc(6px * var(--scale));
  max-height:calc(300px * var(--scale));overflow-y:auto;padding-right:4px;}
.pm-lane{position:relative;display:grid;grid-template-columns:30px 62px minmax(0,1fr) 96px;gap:9px;align-items:center;
  padding:calc(5px * var(--scale)) 8px;border:1px solid var(--line);border-radius:10px;background:var(--surf);
  transition:border-color .18s,box-shadow .18s,transform .18s,background .18s;}
.pm-lane.act{border-color:var(--li);background:color-mix(in srgb,var(--li) 8%,var(--surf));
  box-shadow:0 0 0 1px color-mix(in srgb,var(--li) 30%,transparent),0 10px 26px -18px var(--li);transform:translateX(3px);}
.pm-lane.done{opacity:.62;}
.pm-no{font:700 calc(11px * var(--scale))/1 var(--mono);color:var(--faint);text-align:center;}
.pm-lane.act .pm-no{color:var(--li);}
.pm-kind{font:700 calc(9.5px * var(--scale))/1 var(--mono);letter-spacing:.1em;text-align:center;padding:4px 0;border-radius:20px;}
.pm-kind.real{color:#0a1400;background:var(--li);}
.pm-kind.fake{color:#2a0020;background:var(--mg);}
.pm-bar{position:relative;height:calc(16px * var(--scale));background:var(--ink);border-radius:5px;border:1px solid var(--line);overflow:hidden;}
.pm-fill{position:absolute;top:0;bottom:0;border-radius:4px;}
.pm-fill.real{background:linear-gradient(90deg,color-mix(in srgb,var(--li) 80%,#000),var(--li));}
.pm-fill.fake{background:repeating-linear-gradient(115deg,var(--mg) 0 6px,color-mix(in srgb,var(--mg) 45%,#000) 6px 12px);}
.pm-ovl{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,var(--am) 0 3px,transparent 3px 6px);
  border-right:1px solid var(--am);}
.pm-meta{font:calc(10px * var(--scale))/1.3 var(--mono);color:var(--dim);text-align:right;white-space:nowrap;}
.pm-meta b{color:var(--tx);font-weight:600;}

.pm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin-top:14px;}
.pm-stat{border:1px solid var(--line);border-radius:11px;background:var(--surf);padding:9px 11px;}
.pm-stat b{display:block;font:700 19px/1.15 var(--mono);color:var(--acc);}
.pm-stat.li b{color:var(--li);} .pm-stat.mg b{color:var(--mg);} .pm-stat.am b{color:var(--am);}
.pm-stat span{font-size:10.5px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase;}
.pm-transport{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:13px;padding-top:12px;border-top:1px solid var(--line);}
.pm-scrub{flex:1;min-width:130px;height:6px;-webkit-appearance:none;appearance:none;background:var(--line);border-radius:20px;outline:none;}
.pm-scrub::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;cursor:pointer;
  background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 12px -2px var(--acc);border:2px solid var(--ink);}
.pm-scrub::-moz-range-thumb{width:14px;height:14px;border-radius:50%;cursor:pointer;border:2px solid var(--ink);
  background:var(--acc);}
.pm-time{font:11.5px var(--mono);color:var(--dim);min-width:66px;text-align:right;}

/* рейл */
.fg-rail{position:sticky;top:calc(var(--hh) + 16px);align-self:start;max-height:calc(100vh - var(--hh) - 32px);
  overflow-y:auto;border:1px solid var(--line);border-radius:16px;background:var(--over);
  animation:fgUp .5s .06s both cubic-bezier(.2,.7,.3,1);}
.rl-h{position:sticky;top:0;z-index:5;padding:12px 14px;border-bottom:1px solid var(--line);
  background:linear-gradient(120deg,color-mix(in srgb,var(--acc) 14%,var(--over)),var(--over));
  display:flex;align-items:center;gap:8px;}
.rl-h b{font-size:13px;} .rl-h u{margin-left:auto;text-decoration:none;font:10px var(--mono);color:var(--acc);letter-spacing:.12em;}
.rl-sec{padding:12px 14px;border-bottom:1px solid var(--line);}
.rl-sec>h3{margin:0 0 10px;font:600 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--faint);}
.rl-row{display:flex;align-items:center;gap:9px;margin-bottom:10px;}
.rl-row:last-child{margin-bottom:0;}
.rl-row label{flex:1;font-size:12.5px;color:var(--dim);}
.rl-val{font:600 12px var(--mono);color:var(--acc);min-width:44px;text-align:right;}
.rl-sld{width:100%;height:5px;-webkit-appearance:none;appearance:none;background:var(--line);border-radius:20px;outline:none;margin:2px 0 12px;}
.rl-sld::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;cursor:pointer;
  background:linear-gradient(135deg,var(--acc),var(--acc2));border:2px solid var(--over);box-shadow:0 0 10px -2px var(--acc);transition:.14s;}
.rl-sld::-webkit-slider-thumb:hover{transform:scale(1.18);}
.rl-sld::-moz-range-thumb{width:13px;height:13px;border-radius:50%;cursor:pointer;border:2px solid var(--over);background:var(--acc);}
.rl-in{width:100%;background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:7px 9px;font:12.5px var(--mono);}
.rl-in:focus{outline:none;border-color:var(--acc);}
.rl-sel{width:100%;background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:7px 9px;font-size:12.5px;cursor:pointer;}
.rl-sel:focus{outline:none;border-color:var(--acc);}
.rl-tg{display:flex;align-items:center;gap:9px;width:100%;background:var(--panel);border:1px solid var(--line);
  border-radius:9px;padding:8px 10px;cursor:pointer;color:var(--dim);font-size:12.5px;transition:.16s;margin-bottom:7px;text-align:left;}
.rl-tg:last-child{margin-bottom:0;}
.rl-tg:hover{border-color:var(--acc);color:var(--tx);}
.rl-tg i{width:30px;height:17px;border-radius:20px;background:var(--line);position:relative;flex:none;transition:.18s;}
.rl-tg i::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--faint);transition:.18s;}
.rl-tg.on{color:var(--tx);border-color:color-mix(in srgb,var(--acc) 55%,transparent);background:color-mix(in srgb,var(--acc) 9%,var(--panel));}
.rl-tg.on i{background:linear-gradient(90deg,var(--acc),var(--acc2));}
.rl-tg.on i::after{left:15px;background:#04060b;}
.rl-tg u{margin-left:auto;text-decoration:none;font:10px var(--mono);color:var(--faint);}
.rl-step{display:flex;align-items:center;gap:6px;}
.rl-step button{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel);
  color:var(--tx);cursor:pointer;font-size:14px;line-height:1;transition:.14s;}
.rl-step button:hover{border-color:var(--acc);color:var(--acc);}
.rl-step b{font:600 13px var(--mono);min-width:26px;text-align:center;color:var(--acc);}
.rl-acts{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.rl-acts .fg-btn{justify-content:center;}
.rl-seed{font:11px var(--mono);color:var(--faint);text-align:center;margin-top:8px;}

/* сборка */
.bd-tabs{display:flex;gap:6px;flex-wrap:wrap;}
.bd-tab{border:1px solid var(--line);background:var(--panel);color:var(--dim);border-radius:20px;padding:6px 12px;
  font-size:12px;cursor:pointer;transition:.16s;}
.bd-tab:hover{color:var(--tx);border-color:var(--acc);}
.bd-tab.on{color:#04060b;font-weight:700;background:linear-gradient(120deg,var(--acc),var(--acc2));border-color:transparent;}
.bd-tab u{text-decoration:none;opacity:.7;font:10px var(--mono);margin-left:5px;}
.bd-tools{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;align-items:center;}
.bd-search{flex:1;min-width:170px;background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:9px;
  padding:8px 11px;font:12.5px var(--mono);}
.bd-search:focus{outline:none;border-color:var(--acc);}
.bd-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(226px,1fr));gap:9px;padding:14px 16px;}
.bd-card{border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:11px 12px;text-align:left;
  display:flex;flex-direction:column;gap:6px;transition:.18s;position:relative;overflow:hidden;}
.bd-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--tone,var(--acc));}
.bd-card:hover{transform:translateY(-2px);border-color:var(--tone,var(--acc));box-shadow:0 14px 30px -22px var(--tone,var(--acc));}
.bd-card h4{margin:0;font-size:13px;}
.bd-card p{margin:0;font-size:11.5px;line-height:1.5;color:var(--dim);}
.bd-card .row{display:flex;gap:6px;margin-top:auto;padding-top:4px;}
.bd-tag{font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--tone,var(--acc));
  border:1px solid color-mix(in srgb,var(--tone,var(--acc)) 40%,transparent);padding:3px 7px;border-radius:20px;align-self:flex-start;}

.bd-zone{padding:14px 16px;border-top:1px solid var(--line);}
.bd-zone>h3{margin:0 0 10px;font:600 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--faint);
  display:flex;align-items:center;gap:8px;}
.bd-zone>h3 u{text-decoration:none;color:var(--acc);}
.bd-empty{border:1px dashed var(--line);border-radius:11px;padding:16px;text-align:center;color:var(--faint);font-size:12.5px;}
.st{border:1px solid var(--line);border-radius:12px;background:var(--surf);padding:11px 12px;margin-bottom:8px;
  transition:.16s;position:relative;}
.st:last-child{margin-bottom:0;}
.st.drag{opacity:.4;} .st.over{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 22%,transparent);}
.st.core{border-color:color-mix(in srgb,var(--acc) 42%,transparent);background:linear-gradient(120deg,color-mix(in srgb,var(--acc) 7%,var(--surf)),var(--surf));}
.st-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.st-h b{font-size:13px;}
.st-h .grip{cursor:grab;color:var(--faint);font-size:14px;user-select:none;padding:0 2px;}
.st-h .grip:active{cursor:grabbing;}
.st-h .sp{margin-left:auto;display:flex;gap:5px;}
.st-p{display:flex;gap:9px;flex-wrap:wrap;margin-top:9px;}
.st-f{display:flex;flex-direction:column;gap:4px;}
.st-f span{font:9.5px var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--faint);}
.st-f input{background:var(--ink);border:1px solid var(--line);color:var(--tx);border-radius:7px;padding:6px 8px;font:12px var(--mono);width:132px;}
.st-f input:focus{outline:none;border-color:var(--acc);}
.st-note{margin:8px 0 0;font:11.5px/1.5 var(--mono);color:var(--faint);}

/* код */
.cd-wrap{position:relative;background:#03050a;max-height:520px;overflow:auto;}
.cd-pre{margin:0;padding:14px 16px;font:12.5px/1.72 var(--mono);white-space:pre;color:#cfe0f7;}
.cd-pre .ln{display:block;}
.cd-pre .ln i{display:inline-block;width:34px;color:#3d4f6d;font-style:normal;user-select:none;}
.cd-pre .kw{color:var(--mg);} .cd-pre .fn{color:var(--cy);} .cd-pre .st{color:var(--li);}
.cd-pre .cm{color:#4d6183;font-style:italic;} .cd-pre .nm{color:var(--am);}
.cd-issues{display:flex;flex-direction:column;gap:7px;padding:14px 16px;border-top:1px solid var(--line);}
.iss{border:1px solid var(--line);border-left-width:3px;border-radius:10px;background:var(--surf);padding:9px 12px;}
.iss.crit{border-left-color:var(--rd);} .iss.warn{border-left-color:var(--am);} .iss.info{border-left-color:var(--cy);}
.iss header{display:flex;gap:9px;align-items:center;margin-bottom:3px;}
.iss code{font:10px var(--mono);color:var(--faint);border:1px solid var(--line);padding:1px 6px;border-radius:20px;}
.iss em{font-style:normal;font-size:10px;letter-spacing:.1em;text-transform:uppercase;}
.iss.crit em{color:var(--rd);} .iss.warn em{color:var(--am);} .iss.info em{color:var(--cy);}
.iss p{margin:0;font-size:12.5px;line-height:1.5;}
.iss small{display:block;margin-top:4px;color:var(--dim);font-size:11.5px;}
.cd-ok{padding:12px 16px;border-top:1px solid var(--line);color:var(--li);font-size:13px;
  border-left:3px solid var(--li);background:color-mix(in srgb,var(--li) 6%,transparent);}
.cd-acts{display:flex;gap:8px;flex-wrap:wrap;padding:13px 16px;border-top:1px solid var(--line);}

.psv{display:flex;gap:7px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line);align-items:center;}
.psv .fg-btn.on{border-color:var(--acc);color:var(--acc);}

/* drawer */
.dw-scrim{position:fixed;inset:0;background:#03050acc;backdrop-filter:blur(3px);z-index:80;animation:fgF .2s both;}
@keyframes fgF{from{opacity:0}to{opacity:1}}
.dw{position:fixed;top:0;right:0;bottom:0;width:min(430px,100%);z-index:81;background:var(--surf);
  border-left:1px solid var(--line);display:flex;flex-direction:column;box-shadow:-30px 0 70px -30px #000;
  animation:fgS .26s cubic-bezier(.2,.7,.3,1) both;}
@keyframes fgS{from{transform:translateX(100%)}to{transform:none}}
.dw-h{padding:17px 19px 14px;border-bottom:1px solid var(--line);position:relative;
  background:linear-gradient(140deg,color-mix(in srgb,var(--tone,var(--acc)) 16%,var(--over)),var(--over));}
.dw-h h3{margin:8px 0 6px;font-size:19px;}
.dw-x{position:absolute;top:14px;right:15px;width:31px;height:31px;border-radius:9px;border:1px solid var(--line);
  background:var(--panel);color:var(--tx);cursor:pointer;}
.dw-x:hover{border-color:var(--rd);color:var(--rd);}
.dw-b{padding:17px 19px 26px;overflow-y:auto;display:flex;flex-direction:column;gap:15px;}
.dw-f b{display:block;font:600 9.5px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--faint);margin-bottom:7px;}
.dw-f p{margin:0;font-size:13px;line-height:1.62;color:var(--tx);}
.dw-code{background:#03050a;border:1px solid var(--line);border-radius:10px;padding:11px 12px;
  font:11.5px/1.65 var(--mono);color:#cfe0f7;white-space:pre-wrap;word-break:break-word;}
.dw-tbl{width:100%;border-collapse:collapse;font-size:12px;}
.dw-tbl td{border:1px solid var(--line);padding:6px 9px;}
.dw-tbl td:first-child{font-family:var(--mono);color:var(--acc);white-space:nowrap;}

.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:120;display:flex;align-items:center;gap:11px;
  background:var(--over);border:1px solid var(--li);border-radius:12px;padding:11px 16px;font-size:13px;
  box-shadow:0 22px 46px -24px #000;animation:fgT .24s cubic-bezier(.2,.7,.3,1) both;max-width:calc(100vw - 32px);}
@keyframes fgT{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
.toast i{width:8px;height:8px;border-radius:50%;background:var(--li);flex:none;}
.toast button{background:none;border:1px solid var(--line);color:var(--acc);border-radius:8px;padding:5px 10px;
  font-size:12px;cursor:pointer;}
.toast button:hover{border-color:var(--acc);}

@media (max-width:1120px){
  .fg-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"stage" "rail" "build" "code";}
  .fg-rail{position:static;max-height:none;}
  .rl-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));}
  .rl-sec{border-right:1px solid var(--line);}
}
@media (max-width:720px){
  .fg-top{height:auto;min-height:var(--hh);flex-wrap:wrap;padding:8px 12px;gap:8px;}
  .fg{--hh:104px;}
  .fg-nav{order:3;width:100%;}
  .fg-name{width:130px;}
  .fg-wrap{padding-left:11px;padding-right:11px;}
  .pm-lane{grid-template-columns:24px 52px minmax(0,1fr);gap:7px;}
  .pm-meta{grid-column:1/-1;text-align:left;}
  .bd-pal{grid-template-columns:1fr;}
  .rl-body{grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){.fg *{animation:none!important;transition:none!important;}}
`;

/* ─────────────────────────── каталог блоков ─────────────────────────── */

const TONE = { Фильтры: "#22d3ee", Приёмы: "#ff4fd8", Отправка: "#9ef01a", Вердикт: "#fbbf24", Отладка: "#8b5cf6" };

const BLOCKS = [
  { id: "flt_l7", cat: "Фильтры", title: "Только протокол", desc: "Отсев по desync.l7payload — функция не тратится на чужой трафик.",
    docs: "Ставь первым, если функция рассчитана на один тип нагрузки. Для TLS — tls_client_hello, для HTTP — http_req, для QUIC — quic_initial.",
    params: [{ k: "l7", label: "l7payload", def: "tls_client_hello" }],
    code: 'if desync.l7payload ~= {{l7}} then return VERDICT_PASS end' },
  { id: "flt_len", cat: "Фильтры", title: "Минимальная длина", desc: "Не действовать на коротких пакетах.",
    docs: "Защищает от разреза на пакетах, где нечего резать. Значение в байтах полезной нагрузки.",
    params: [{ k: "n", label: "байт", def: "40" }],
    code: 'if #(desync.reasm_data or desync.dis.payload or "") < {{n}} then return VERDICT_PASS end' },
  { id: "flt_once", cat: "Фильтры", title: "Один раз на соединение", desc: "Счётчик в track.lua_state + cutoff по лимиту.",
    docs: "Ключевая защита от флуда: без неё фейк уходит на каждом исходящем пакете с payload. Счётчик живёт в conntrack до конца потока.",
    params: [{ k: "max", label: "лимит", def: "1" }],
    code: 'do\n    local st = desync.track and desync.track.lua_state\n    if st then\n        local k = "forge_{{uid}}"\n        local n = st[k] or 0\n        if n >= {{max}} then instance_cutoff_shim(ctx, desync); return VERDICT_PASS end\n        st[k] = n + 1\n    end\nend' },
  { id: "std", cat: "Приёмы", title: "Штатная функция antidpi", desc: "Любая: multisplit, fakedsplit, hostfakesplit, udplen…",
    docs: "Вызов любой функции из zapret-antidpi.lua. Аргументы передаются через запятую в формате k=v; флаг — просто имя. Аргументы подставляются на время вызова и возвращаются назад.",
    params: [{ k: "fn", label: "функция", def: "multisplit" }, { k: "args", label: "k=v,k=v", def: "pos=1,midsld" }],
    code: 'apply_call({{fn}}, { {{kv:args}} })' },
  { id: "clone_ttl", cat: "Приёмы", title: "Клон с другим TTL", desc: "Отправляет копию пакета с изменённым TTL и badsum.",
    docs: "Ручной фейк без вызова antidpi: клонирует dissect, меняет TTL/hop limit, портит контрольную сумму и отправляет. Оригинал не трогается.",
    params: [{ k: "ttl", label: "ttl", def: "6" }],
    code: 'do\n    local dis = deepcopy(desync.dis)\n    if dis.ip then dis.ip.ip_ttl = {{ttl}} elseif dis.ip6 then dis.ip6.ip6_hlim = {{ttl}} end\n    local o = desync_opts(desync)\n    o.reconstruct.badsum = true\n    rawsend_dissect(dis, o.rawsend, o.reconstruct)\nend' },
  { id: "hostcase", cat: "Приёмы", title: "HTTP: регистр Host", desc: "http_hostcase — заголовок Host меняет написание.",
    docs: "Многие DPI ищут заголовок строго в нижнем регистре. Значение должно быть ровно 4 символа.",
    params: [{ k: "spell", label: "spell (4)", def: "hOst" }],
    code: 'apply_call(http_hostcase, { spell = {{spell}} })' },
  { id: "udplen", cat: "Приёмы", title: "UDP: длина пакета", desc: "udplen — паддинг/обрезка UDP-нагрузки.",
    docs: "Ломаает сигнатуры, привязанные к длине датаграммы. Отрицательное значение обрезает пакет.",
    params: [{ k: "inc", label: "increment", def: "2" }],
    code: 'apply_call(udplen, { increment = {{inc}} })' },
  { id: "oob", cat: "Приёмы", title: "OOB / urgent", desc: "oob — срочный байт с начала соединения.",
    docs: "Должен видеть SYN, поэтому ставь до сегментирующих приёмов и без payload-фильтра в профиле.",
    params: [], code: 'apply_call(oob, {})' },
  { id: "send_seg", cat: "Отправка", title: "Свой сегмент", desc: "Отправить срез нагрузки со смещением.",
    docs: "Ручная сегментация вне ядра. Данные берутся из reasm, иначе из текущего payload. Смещение — позиция в потоке, с которой начинается кусок.",
    params: [{ k: "from", label: "с байта", def: "1" }, { k: "to", label: "по байт", def: "1" }, { k: "off", label: "смещение", def: "0" }],
    code: 'do\n    local d = desync.reasm_data or desync.dis.payload\n    if d and #d >= {{from}} then\n        local p = string.sub(d, {{from}}, {{to}})\n        local o = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {}, ipid = desync.arg, fooling = {} }\n        rawsend_payload_segmented(desync, p, {{off}}, o)\n    end\nend' },
  { id: "cutoff", cat: "Отправка", title: "Отключить инстанс", desc: "instance_cutoff_shim — дальше по потоку не вызывать.",
    docs: "Экономит CPU, когда приём уже отработал. Осторожно при reasm: отложенные куски перестанут дропаться этим инстансом.",
    params: [], code: 'instance_cutoff_shim(ctx, desync)' },
  { id: "dropset", cat: "Отправка", title: "Дропать replay", desc: "replay_drop_set после собственной отправки.",
    docs: "Обязательно, если ты сам отправил собранный reasm: иначе сервер получит дубли отложенных кусков.",
    params: [], code: 'replay_drop_set(desync)' },
  { id: "v_drop", cat: "Вердикт", title: "VERDICT_DROP", desc: "Оригинал не отправлять.",
    docs: "Используй, если данные уже ушли твоей ручной отправкой.", params: [], code: 'return VERDICT_DROP' },
  { id: "v_pass", cat: "Вердикт", title: "VERDICT_PASS", desc: "Оригинал идёт дальше по цепочке.",
    docs: "Нейтральный исход: следующие инстансы профиля получат пакет.", params: [], code: 'return VERDICT_PASS' },
  { id: "v_mod", cat: "Вердикт", title: "VERDICT_MODIFY", desc: "Отправить изменённый оригинал.",
    docs: "Нужен, когда ты правил desync.dis напрямую, а не отправлял клон.", params: [], code: 'return VERDICT_MODIFY' },
  { id: "log", cat: "Отладка", title: "DLOG", desc: "Отладочная строка в лог движка.",
    docs: "Виден при --debug=1. Обёрнут в b_debug, чтобы не тратить CPU в бою.",
    params: [{ k: "msg", label: "текст", def: "step" }],
    code: 'if b_debug then DLOG("{{name}}: {{msg}}") end' }
];
const B = id => BLOCKS.find(b => b.id === id);

const DEFAULT_TUNE = {
  mode: "host", marker: "midsld", parts: 3, seqovl: 0, rmin: 0.25, rmax: 0.75,
  fakeIp: true, ipDst: "192.0.2.1", ttl: 8, tcpTs: "-600000", repeats: 1, maxFake: 1, tlsMod: "",
  disorder: false, fakeBefore: false, fakeAfter: false, badsum: true, cutoff: false, nodrop: false,
  domain: "www.youtube.com", total: 512,
  dir: true, replay: true, payloadArg: true,
  speed: 1, loop: true, scale: 1, glow: true, grid: true, pal: "cyan"
};

const BUILTIN_PRESETS = [
  { id: "p_classic", name: "Классика: фейк → сплит", tune: { ...DEFAULT_TUNE }, extras: [] },
  { id: "p_max", name: "Максимум: 4 части + disorder", tune: { ...DEFAULT_TUNE, parts: 4, seqovl: 3, disorder: true, fakeBefore: true, fakeAfter: false, cutoff: true }, extras: [] },
  { id: "p_soft", name: "Мягкий: только сплит", tune: { ...DEFAULT_TUNE, fakeIp: false, parts: 2, mode: "mid" }, extras: [] },
  { id: "p_http", name: "HTTP-сайт", tune: { ...DEFAULT_TUNE, fakeIp: false, domain: "example.org", mode: "pos", marker: "host,endhost" },
    extras: [{ uid: 1, id: "hostcase", where: "pre", p: { spell: "hOst" } }] }
];

/* ─────────────────────────── утилиты ─────────────────────────── */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const luaName = s => String(s || "my_fn").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "_$1").replace(/_+/g, "_").replace(/^_|_$/g, "") || "my_fn";
const q = s => '"' + String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const rid = () => Math.floor(Math.random() * 1e9);

function fill(tpl, p, ctx) {
  return tpl
    .replace(/\{\{kv:([a-z0-9_]+)\}\}/gi, (_, k) => String(p[k] || "").split(",").map(x => x.trim()).filter(Boolean)
      .map(x => { const i = x.indexOf("="); return i < 0 ? `${x} = true` : `${x.slice(0, i).trim()} = ${q(x.slice(i + 1).trim())}`; }).join(", "))
    .replace(/\{\{name\}\}/g, ctx.name).replace(/\{\{uid\}\}/g, ctx.uid)
    .replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, k) => {
      const v = p[k];
      if (v === undefined || v === "") return "nil";
      if (/^-?\d+(\.\d+)?$/.test(String(v))) return String(v);
      if (k === "fn") return String(v);
      return q(v);
    });
}

function buildPayload(domain, total) {
  const head = 76;
  const sni = String(domain || "example.com");
  const tail = clamp(Math.round(total) - head - sni.length, 24, 1400);
  const len = head + sni.length + tail;
  const hostStart = head + 1, hostEnd = head + sni.length;
  const parts = sni.split(".");
  const sld = parts.length >= 2 ? parts[parts.length - 2] : "";
  const sldIdx = sld ? sni.lastIndexOf(sld) : -1;
  return { len, head, tail, sni, hostStart, hostEnd, sld, sldIdx, dotted: sni.includes(".") };
}

function markerPos(m, P) {
  m = String(m).trim().toLowerCase();
  if (/^-?\d+$/.test(m)) { const n = parseInt(m, 10); return n < 0 ? P.len + n + 1 : n; }
  if (m === "host") return P.hostStart;
  if (m === "endhost") return P.hostEnd + 1;
  if (m === "sld") return P.sldIdx >= 0 ? P.hostStart + P.sldIdx : null;
  if (m === "endsld") return P.sldIdx >= 0 ? P.hostStart + P.sldIdx + P.sld.length : null;
  if (m === "midsld") return P.sldIdx >= 0 ? P.hostStart + P.sldIdx + Math.floor(P.sld.length / 2) : null;
  const mm = m.match(/^(midsld|sld|host|endhost)([+-]\d+)$/);
  if (mm) { const b = markerPos(mm[1], P); return b == null ? null : b + parseInt(mm[2], 10); }
  return null;
}

function computePlan(tune, seed) {
  const P = buildPayload(tune.domain, tune.total);
  const rand = rng(seed);
  const ri = (a, b) => a + Math.floor(rand() * (Math.max(a, b) - a + 1));
  const cuts = [];
  const push = c => { c = Math.floor(c); if (c >= 1 && c <= P.len - 1 && !cuts.includes(c)) cuts.push(c); };
  const parts = clamp(Math.round(tune.parts), 2, 8);

  if (tune.mode === "pos") {
    String(tune.marker || "midsld").split(",").forEach(m => { const p = markerPos(m, P); if (p != null && p > 1) push(p - 1); });
  } else if (tune.mode === "mid") {
    push(P.len / 2);
  } else if (tune.mode === "random") {
    const lo = clamp(Math.floor(P.len * tune.rmin), 1, P.len - 1);
    const hi = clamp(Math.floor(P.len * tune.rmax), lo, P.len - 1);
    for (let i = 0; i < parts - 1; i++) push(ri(lo, hi));
  } else {
    const lo = P.hostStart, hi = Math.max(P.hostStart, P.hostEnd - 1);
    for (let i = 0; i < parts - 1; i++) push(ri(lo, hi));
  }
  cuts.sort((a, b) => a - b);
  if (!cuts.length) push(P.len / 2);

  const segs = [];
  let start = 1;
  const ov = Math.max(0, Math.round(tune.seqovl));
  for (let i = 0; i <= cuts.length; i++) {
    const stop = cuts[i] ?? P.len;
    let off = start - 1, base = stop - start + 1, ovl = 0;
    if (i === 1 && ov > 0 && off >= ov) { ovl = ov; off -= ov; }
    segs.push({ i, s: start, e: stop, off, base, ovl, len: base + ovl });
    start = stop + 1;
  }
  const order = segs.map((_, i) => i);
  if (tune.disorder) order.reverse();

  const emissions = [];
  order.forEach(idx => {
    const s = segs[idx];
    if (tune.fakeBefore) emissions.push({ kind: "fake", off: s.s - 1, len: s.base, seg: idx });
    emissions.push({ kind: "real", off: s.off, len: s.len, ovl: s.ovl, seg: idx });
    if (tune.fakeAfter) emissions.push({ kind: "fake", off: s.s - 1, len: s.base, seg: idx });
  });
  const bytes = emissions.reduce((a, e) => a + e.len, 0);
  return { P, cuts, segs, emissions, bytes, ovlCancelled: ov > 0 && cuts[0] != null && ov > cuts[0] };
}

/* ─────────────────────────── генерация Lua ─────────────────────────── */

function generate(fname, desc, tune, extras) {
  const name = luaName(fname);
  const L = [];
  L.push(`-- ${name}.lua`);
  if (desc.trim()) L.push(`-- ${desc.replace(/\r?\n/g, " ").slice(0, 170)}`);
  L.push(`-- собрано в кузнице · ядро: outline_random_split${tune.fakeIp ? " + fake_ip_misdirection" : ""}`);
  L.push("");
  L.push("local function make_caller(ctx, desync)");
  L.push("    local verdict = VERDICT_PASS");
  L.push("    local function apply(fn, over)");
  L.push("        local saved = {}");
  L.push("        for k, v in pairs(over) do saved[k] = desync.arg[k]; desync.arg[k] = v end");
  L.push("        local ok, v = pcall(fn, ctx, desync)");
  L.push("        for k in pairs(over) do desync.arg[k] = saved[k] end");
  L.push('        if not ok then DLOG("forge: call failed: " .. tostring(v)); return end');
  L.push("        if v == VERDICT_DROP then verdict = VERDICT_DROP");
  L.push("        elseif v == VERDICT_MODIFY and verdict ~= VERDICT_DROP then verdict = VERDICT_MODIFY end");
  L.push("    end");
  L.push("    return apply, function() return verdict end");
  L.push("end");
  L.push("");
  L.push(`function ${name}(ctx, desync)`);
  L.push("    if not desync.dis.tcp then");
  L.push("        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end");
  L.push("        return VERDICT_PASS");
  L.push("    end");
  if (tune.dir) {
    L.push("    direction_cutoff_opposite(ctx, desync)");
    L.push("    if not direction_check(desync) then return VERDICT_PASS end");
  }
  if (tune.payloadArg) L.push("    if desync.arg.payload and not payload_check(desync) then return VERDICT_PASS end");
  if (tune.replay) {
    L.push("    if not replay_first(desync) then");
    L.push("        if replay_drop(desync) then return VERDICT_DROP end");
    L.push("        return VERDICT_PASS");
    L.push("    end");
  }
  L.push("");
  L.push("    local apply_call, get_verdict = make_caller(ctx, desync)");
  const emit = (list, tag) => {
    if (!list.length) return;
    L.push("");
    L.push(`    -- ${tag}`);
    list.forEach((it, i) => {
      const d = B(it.id); if (!d) return;
      const p = { ...Object.fromEntries((d.params || []).map(x => [x.k, x.def])), ...(it.p || {}) };
      fill(d.code, p, { name, uid: `${name}_${it.uid}` }).split("\n").forEach(l => L.push("    " + l));
      void i;
    });
  };
  emit(extras.filter(e => e.where === "pre"), "пролог");
  L.push("");
  L.push("    -- ядро");
  if (tune.fakeIp) {
    const a = [`ip_dst = ${q(tune.ipDst)}`, `ip_ttl = ${Math.round(tune.ttl)}`, `repeats = ${Math.round(tune.repeats)}`, `maxfake = ${Math.round(tune.maxFake)}`];
    if (String(tune.tcpTs).trim()) a.push(`tcp_ts = ${q(tune.tcpTs)}`);
    if (String(tune.tlsMod).trim()) a.push(`tls_mod = ${q(tune.tlsMod)}`);
    L.push(`    apply_call(fake_ip_misdirection, { ${a.join(", ")} })`);
  }
  const rs = [`mode = ${q(tune.mode)}`, `parts = ${clamp(Math.round(tune.parts), 2, 8)}`, `seqovl = ${Math.round(tune.seqovl)}`, `ip_ttl = ${Math.round(tune.ttl)}`];
  if (tune.mode === "pos") rs.push(`pos = ${q(tune.marker)}`);
  if (tune.mode === "random") { rs.push(`rmin = ${tune.rmin}`); rs.push(`rmax = ${tune.rmax}`); }
  if (tune.disorder) rs.push("disorder = true");
  if (tune.fakeBefore) rs.push("fake = true");
  if (tune.fakeAfter) rs.push("fake2 = true");
  if (tune.badsum) rs.push("badsum = true");
  if (tune.cutoff) rs.push("cutoff = true");
  if (tune.nodrop) rs.push("nodrop = true");
  L.push(`    apply_call(outline_random_split, { ${rs.join(", ")} })`);
  emit(extras.filter(e => e.where === "post"), "эпилог");
  L.push("");
  L.push("    return get_verdict()");
  L.push("end");
  return { name, code: L.join("\n") + "\n" };
}

function batFor(name, tune) {
  const cmd = ['start "zapret2" /min "%~dp0winws2.exe"', "--wf-tcp-out=80,443"];
  ["lua\\zapret-lib.lua", "lua\\zapret-antidpi.lua"].forEach(f => cmd.push(`--lua-init=@"%~dp0${f}"`));
  if (tune.fakeIp) cmd.push('--lua-init=@"%~dp0fake_ip_misdirection.max.lua"');
  cmd.push('--lua-init=@"%~dp0random_split.max.lua"');
  cmd.push(`--lua-init=@"%~dp0${name}.lua"`);
  cmd.push(`--new=${name}`, `--name=${name}`, "--filter-tcp=443", "--filter-l7=tls",
    "--payload=tls_client_hello", "--out-range=-n30", `--lua-desync=${name}`);
  return ["@echo off", "chcp 65001 >nul",
    "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)",
    'cd /d "%~dp0"', cmd.join(" ^\n ")].join("\n") + "\n";
}

/* ─────────────────────────── линт ─────────────────────────── */

const KNOWN_FN = new Set(("print pairs ipairs type tostring tonumber pcall xpcall error assert select next setmetatable getmetatable rawget rawset require " +
  "string table math os io unpack load loadstring dofile collectgarbage " +
  "deepcopy desync_opts rawsend_opts rawsend_opts_base reconstruct_opts ipfrag_opts apply_fooling apply_ip_id " +
  "rawsend_dissect rawsend_dissect_ipfrag rawsend_payload_segmented rawsend_dissect_segmented " +
  "direction_check direction_cutoff_opposite payload_check replay_first replay_drop replay_drop_set " +
  "instance_cutoff_shim cutoff_shim_check lua_cutoff instance_cutoff execution_plan timer_set timer_del " +
  "resolve_pos resolve_multi_pos resolve_range zero_based_pos delete_pos_1 pos_normalize pos_get " +
  "blob blob_or_def blob_exist hex pattern parse_hex bu8 bu16 bu32 u32add bitand bitor bitnot bxor " +
  "DLOG hexdump_dlog tls_mod_shim tls_client_hello_mod http_dissect_req http_reconstruct_req " +
  "genhost host_ip dissect_url dissect_nld find_tcp_options wsize_rewrite ip6hdr packet_len " +
  "clock_gettime getpid uname time brandom bcryptorandom hash apply_execution_plan verdict_aggregate " +
  "fake multisplit multidisorder multidisorder_legacy fakedsplit fakeddisorder hostfakesplit tcpseg oob " +
  "syndata rst udplen dht_dn synack synack_split wsize wssize drop send pktmod pass luaexec " +
  "http_hostcase http_domcase http_methodeol http_unixeol tls_client_hello_clone " +
  "fake_ip_misdirection outline_random_split apply apply_call get_verdict").split(/\s+/));

function lintLua(code) {
  const out = [];
  const lines = code.split("\n");
  const clean = lines.map(l => l.replace(/--.*$/, "").replace(/"(\\.|[^"\\])*"/g, '""').replace(/'(\\.|[^'\\])*'/g, "''"));
  let depth = 0, bad = -1;
  clean.forEach((l, i) => {
    const words = l.match(/[A-Za-z_]\w*/g) || [];
    words.forEach(w => {
      if (w === "function" || w === "if" || w === "do" || w === "repeat") depth++;
      else if (w === "end" || w === "until") { depth--; if (depth < 0 && bad < 0) bad = i + 1; }
    });
  });
  if (bad > 0) out.push({ level: "crit", code: "L001", msg: `Лишний end на строке ${bad} — блоки не сбалансированы.` });
  else if (depth !== 0) out.push({ level: "crit", code: "L001", msg: `Не закрыто блоков: ${depth}. Добавь недостающие end.` });

  const locals = new Set();
  clean.forEach(l => {
    (l.match(/local\s+function\s+([A-Za-z_]\w*)/g) || []).forEach(m => locals.add(m.split(/\s+/).pop()));
    (l.match(/local\s+([A-Za-z_]\w*(\s*,\s*[A-Za-z_]\w*)*)/g) || []).forEach(m =>
      m.replace(/^local\s+/, "").split(",").forEach(x => locals.add(x.trim())));
    (l.match(/function\s+([A-Za-z_]\w*)\s*\(/g) || []).forEach(m => locals.add(m.replace(/^function\s+/, "").replace(/\s*\($/, "")));
  });
  const seen = new Set();
  clean.forEach((l, i) => {
    (l.match(/\b([A-Za-z_]\w*)\s*\(/g) || []).forEach(m => {
      const n = m.replace(/\s*\($/, "");
      if (KNOWN_FN.has(n) || locals.has(n) || seen.has(n)) return;
      seen.add(n);
      out.push({ level: "warn", code: "L014", msg: `Неизвестная функция ${n}() — строка ${i + 1}.`, fix: "Проверь имя или подключи файл через --lua-init." });
    });
  });
  return out;
}

function advise(tune, plan, extras) {
  const out = [];
  if (tune.fakeIp && tune.ttl >= 32 && !tune.badsum)
    out.push({ level: "crit", code: "A001", msg: `Фейк с TTL ${tune.ttl} и без badsum дойдёт до сервера.`, fix: "Уменьши TTL до 6–10 или включи badsum." });
  if (tune.fakeIp && tune.ttl <= 2)
    out.push({ level: "warn", code: "A002", msg: `TTL ${tune.ttl}: фейк умрёт на первом хопе и внешний DPI его не увидит.`, fix: "Поставь 8 или используй ip_autottl в .bat." });
  if ((tune.fakeBefore || tune.fakeAfter) && !tune.badsum && tune.ttl >= 32)
    out.push({ level: "crit", code: "A005", msg: "Фейки вокруг сегментов уйдут серверу без fooling.", fix: "Включи badsum или снизь TTL." });
  if (plan.ovlCancelled)
    out.push({ level: "warn", code: "A021", msg: `seqovl=${tune.seqovl} больше первого разреза (${plan.cuts[0]}) — перекрытие будет отменено.`, fix: "Уменьши seqovl или сдвинь точку разреза правее." });
  if (!plan.P.dotted)
    out.push({ level: "warn", code: "A022", msg: `Хост «${plan.P.sni}» без точки: маркеры host/midsld не разрешатся.`, fix: "Укажи полное доменное имя." });
  if (tune.mode === "host" && plan.P.sld.length < 2)
    out.push({ level: "info", code: "A023", msg: "Короткий SLD — случайный разрез внутри имени почти вырожден.", fix: "Попробуй mode=pos с маркером midsld." });
  if (!tune.payloadArg)
    out.push({ level: "info", code: "A008", msg: "Аргумент payload не проверяется — функция пойдёт по любой нагрузке профиля.", fix: "Включи «payload-аргумент» или задай --payload в профиле." });
  if (tune.fakeIp && tune.maxFake === 0)
    out.push({ level: "warn", code: "A024", msg: "maxfake=0 — фейк на каждом пакете соединения.", fix: "Поставь 1–2, чтобы не флудить." });
  if (extras.some(e => e.id === "oob") && extras.filter(e => e.where === "pre").length === 0)
    out.push({ level: "info", code: "A013", msg: "oob в эпилоге: соединение уже разрезано, SYN он не увидит.", fix: "Перенеси oob в пролог." });
  if (tune.cutoff && tune.replay)
    out.push({ level: "info", code: "A025", msg: "cutoff включён: при собранном reasm ядро само не отключится — это безопасно.", fix: "Оставь как есть." });
  return out;
}

/* ─────────────────────────── подсветка ─────────────────────────── */

const KW = new Set("function local end if then else elseif for while do return repeat until break and or not nil true false in".split(" "));
function highlight(line) {
  if (/^\s*--/.test(line)) return <span className="cm">{line}</span>;
  const parts = line.split(/("(?:\\.|[^"\\])*"|\b[A-Za-z_]\w*\b|\b\d+\b)/g);
  return parts.map((t, i) => {
    if (!t) return null;
    if (/^"/.test(t)) return <span className="st" key={i}>{t}</span>;
    if (KW.has(t)) return <span className="kw" key={i}>{t}</span>;
    if (/^\d+$/.test(t)) return <span className="nm" key={i}>{t}</span>;
    if (/^[A-Za-z_]\w*$/.test(t) && KNOWN_FN.has(t)) return <span className="fn" key={i}>{t}</span>;
    return <span key={i}>{t}</span>;
  });
}

/* ─────────────────────────── компонент ─────────────────────────── */

const LS_PRESETS = "forge:presets:v2";
const LS_STATE = "forge:state:v2";

export default function Forge({ onNav }) {
  const boot = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_STATE) || "null");
      if (s && s.tune) return s;
    } catch { /* приватный режим */ }
    return null;
  }, []);

  const [fname, setFname] = useState(boot?.fname || "my_combo");
  const [desc, setDesc] = useState(boot?.desc || "Фейк с подменой dst, затем случайный разрез внутри SNI");
  const [tune, setTune] = useState({ ...DEFAULT_TUNE, ...(boot?.tune || {}) });
  const [extras, setExtras] = useState(boot?.extras || []);
  const [seed, setSeed] = useState(boot?.seed || 20261120);
  const [cat, setCat] = useState("Все");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("cat");
  const [where, setWhere] = useState("post");
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [head, setHead] = useState(0);
  const [presets, setPresets] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem(LS_PRESETS) || "null"); if (Array.isArray(p)) return p; } catch { /* ignore */ }
    return [];
  });
  const [presetName, setPresetName] = useState("");
  const [active, setActive] = useState("stage");
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const undoRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const posRef = useRef(0);
  const speedRef = useRef(tune.speed);
  const loopRef = useRef(tune.loop);
  const uidRef = useRef(1000);

  const set = useCallback((k, v) => setTune(t => ({ ...t, [k]: v })), []);
  const say = useCallback((msg, undo) => { undoRef.current = undo || null; setToast({ msg, k: Date.now() }); }, []);

  const plan = useMemo(() => computePlan(tune, seed), [tune, seed]);
  const gen = useMemo(() => generate(fname, desc, tune, extras), [fname, desc, tune, extras]);
  const bat = useMemo(() => batFor(gen.name, tune), [gen.name, tune]);
  const issues = useMemo(() => [...advise(tune, plan, extras), ...lintLua(gen.code)], [tune, plan, extras, gen.code]);
  const total = plan.emissions.length;
  const sig = `${tune.mode}|${tune.marker}|${tune.parts}|${tune.seqovl}|${tune.disorder}|${tune.fakeBefore}|${tune.fakeAfter}|${tune.domain}|${tune.total}|${seed}|${tune.rmin}|${tune.rmax}`;

  useEffect(() => { speedRef.current = tune.speed; loopRef.current = tune.loop; }, [tune.speed, tune.loop]);
  useEffect(() => {
    try { localStorage.setItem(LS_STATE, JSON.stringify({ fname, desc, tune, extras, seed })); } catch { /* ignore */ }
  }, [fname, desc, tune, extras, seed]);
  useEffect(() => {
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(presets)); } catch { /* ignore */ }
  }, [presets]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => { setToast(null); undoRef.current = null; }, 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => { posRef.current = 0; setHead(0); }, [sig]);

  useEffect(() => {
    if (!playing || total === 0) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; lastRef.current = 0; return; }
    const step = t => {
      if (!lastRef.current) lastRef.current = t;
      const dt = Math.min(64, t - lastRef.current); lastRef.current = t;
      posRef.current += dt / (620 / Math.max(0.25, speedRef.current));
      if (posRef.current >= total) {
        if (loopRef.current) posRef.current = 0;
        else { posRef.current = total; setHead(total); setPlaying(false); return; }
      }
      setHead(posRef.current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; lastRef.current = 0; };
  }, [playing, total]);

  useEffect(() => {
    const ids = ["stage", "build", "code"];
    const obs = new IntersectionObserver(es => {
      const vis = es.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-80px 0px -55% 0px", threshold: [0.05, 0.3, 0.6] });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") setDrawer(null);
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
      if (e.key.toLowerCase() === "r") { posRef.current = 0; setHead(0); setPlaying(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const download = (text, filename, mime = "text/plain") => {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say(`Скачано: ${filename}`);
  };
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); say(msg); }
    catch { say("Буфер недоступен — выдели код вручную"); }
  };

  const addBlock = id => {
    const d = B(id); if (!d) return;
    uidRef.current += 1;
    const item = { uid: uidRef.current, id, where, p: Object.fromEntries((d.params || []).map(x => [x.k, x.def])) };
    setExtras(v => [...v, item]);
    say(`Добавлен блок «${d.title}» ${where === "pre" ? "в пролог" : "в эпилог"}`, () => setExtras(v => v.filter(x => x.uid !== item.uid)));
    setDrawer(null);
  };
  const removeBlock = uid => {
    const item = extras.find(x => x.uid === uid);
    setExtras(v => v.filter(x => x.uid !== uid));
    say(`Убран блок «${B(item?.id)?.title || item?.id}»`, () => setExtras(v => [...v, item].sort((a, b) => a.uid - b.uid)));
  };
  const setParam = (uid, k, v) => setExtras(list => list.map(x => x.uid === uid ? { ...x, p: { ...x.p, [k]: v } } : x));
  const move = (uid, dir) => setExtras(list => {
    const it = list.find(x => x.uid === uid); if (!it) return list;
    const zone = list.filter(x => x.where === it.where);
    const i = zone.findIndex(x => x.uid === uid), j = i + dir;
    if (j < 0 || j >= zone.length) return list;
    const swapped = [...zone]; [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    let k = 0;
    return list.map(x => x.where === it.where ? swapped[k++] : x);
  });
  const dropOn = (uid) => {
    if (dragId == null || dragId === uid) { setDragId(null); setOverId(null); return; }
    setExtras(list => {
      const a = list.find(x => x.uid === dragId), b = list.find(x => x.uid === uid);
      if (!a || !b || a.where !== b.where) return list;
      const zone = list.filter(x => x.where === a.where);
      const from = zone.findIndex(x => x.uid === dragId), to = zone.findIndex(x => x.uid === uid);
      const reordered = [...zone]; const [m] = reordered.splice(from, 1); reordered.splice(to, 0, m);
      let k = 0;
      return list.map(x => x.where === a.where ? reordered[k++] : x);
    });
    setDragId(null); setOverId(null);
  };

  const applyPreset = p => {
    setTune({ ...DEFAULT_TUNE, ...p.tune });
    setExtras((p.extras || []).map(e => ({ ...e, uid: ++uidRef.current })));
    if (p.fname) setFname(p.fname);
    posRef.current = 0; setHead(0); setPlaying(true);
    say(`Загружен пресет «${p.name}»`);
  };
  const savePreset = () => {
    const nm = presetName.trim() || `Моя сборка ${presets.length + 1}`;
    const p = { id: "u" + Date.now(), name: nm, tune: { ...tune }, extras: extras.map(e => ({ ...e })), fname };
    setPresets(v => [...v, p]); setPresetName("");
    say(`Пресет «${nm}» сохранён`, () => setPresets(v => v.filter(x => x.id !== p.id)));
  };
  const delPreset = id => {
    const p = presets.find(x => x.id === id);
    setPresets(v => v.filter(x => x.id !== id));
    say(`Пресет «${p?.name}» удалён`, () => setPresets(v => [...v, p]));
  };
  const resetAll = () => {
    const snap = { tune: { ...tune }, extras: extras.map(e => ({ ...e })), fname, desc, seed };
    setTune({ ...DEFAULT_TUNE }); setExtras([]); setFname("my_combo"); setSeed(20261120);
    posRef.current = 0; setHead(0);
    say("Сборка сброшена к исходной", () => { setTune(snap.tune); setExtras(snap.extras); setFname(snap.fname); setDesc(snap.desc); setSeed(snap.seed); });
  };
  const randomize = () => {
    const s = rid();
    setSeed(s);
    setTune(t => ({
      ...t, mode: ["host", "random", "mid", "pos"][s % 4],
      parts: 2 + (s % 5), seqovl: (s >> 3) % 9,
      disorder: !!(s & 16), fakeBefore: !!(s & 32), fakeAfter: !!(s & 64),
      ttl: 4 + ((s >> 7) % 10), repeats: 1 + ((s >> 11) % 3)
    }));
    setPlaying(true);
    say("Параметры перемешаны");
  };
  const toRun = () => {
    try { localStorage.setItem("z2config:v1", bat); window.dispatchEvent(new Event("z2config")); } catch { /* ignore */ }
    say("Конфиг передан в «Прогон конфига»");
    onNav?.("run");
  };

  const palette = useMemo(() => {
    const n = query.trim().toLowerCase();
    let l = BLOCKS.filter(b => (cat === "Все" || b.cat === cat) &&
      (!n || (b.title + " " + b.desc + " " + b.id + " " + b.cat).toLowerCase().includes(n)));
    return [...l].sort((a, b) => sort === "alpha" ? a.title.localeCompare(b.title, "ru") : a.cat.localeCompare(b.cat, "ru") || a.title.localeCompare(b.title, "ru"));
  }, [cat, query, sort]);

  const act = Math.min(Math.max(0, total - 1), Math.floor(head));
  const cur = plan.emissions[act];
  const pct = v => (v / plan.P.len) * 100;
  const cats = ["Все", ...Object.keys(TONE)];
  const cnt = c => c === "Все" ? BLOCKS.length : BLOCKS.filter(b => b.cat === c).length;

  const Zone = ({ tag, label }) => {
    const list = extras.filter(e => e.where === tag);
    return (
      <div className="bd-zone">
        <h3>{label} <u>{list.length}</u></h3>
        {list.length === 0 ? (
          <div className="bd-empty">Пусто. Выбери «куда: {tag === "pre" ? "до ядра" : "после ядра"}» и добавь блок из палитры.</div>
        ) : list.map((it, i) => {
          const d = B(it.id); if (!d) return null;
          return (
            <div key={it.uid} className={"st" + (dragId === it.uid ? " drag" : "") + (overId === it.uid ? " over" : "")}
              draggable onDragStart={() => setDragId(it.uid)} onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={e => { e.preventDefault(); setOverId(it.uid); }} onDragLeave={() => setOverId(o => o === it.uid ? null : o)}
              onDrop={e => { e.preventDefault(); dropOn(it.uid); }}>
              <div className="st-h">
                <span className="grip" aria-hidden="true">⠿</span>
                <span className="bd-tag" style={{ "--tone": TONE[d.cat] }}>{i + 1}</span>
                <b>{d.title}</b>
                <span className="sp">
                  <button className="fg-btn sm" onClick={() => move(it.uid, -1)} disabled={i === 0} aria-label="Выше">↑</button>
                  <button className="fg-btn sm" onClick={() => move(it.uid, 1)} disabled={i === list.length - 1} aria-label="Ниже">↓</button>
                  <button className="fg-btn sm" onClick={() => setDrawer(d)}>инфо</button>
                  <button className="fg-btn sm dgr" onClick={() => removeBlock(it.uid)}>убрать</button>
                </span>
              </div>
              {(d.params || []).length > 0 && (
                <div className="st-p">
                  {d.params.map(p => (
                    <label className="st-f" key={p.k}>
                      <span>{p.label}</span>
                      <input value={it.p?.[p.k] ?? ""} onChange={e => setParam(it.uid, p.k, e.target.value)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const Tg = ({ k, label, hint }) => (
    <button className={"rl-tg" + (tune[k] ? " on" : "")} onClick={() => set(k, !tune[k])} aria-pressed={!!tune[k]}>
      <i aria-hidden="true" />{label}{hint && <u>{hint}</u>}
    </button>
  );
  const Sld = ({ k, label, min, max, step = 1, fmt }) => (
    <>
      <div className="rl-row"><label htmlFor={"sld-" + k}>{label}</label>
        <span className="rl-val">{fmt ? fmt(tune[k]) : tune[k]}</span></div>
      <input id={"sld-" + k} className="rl-sld" type="range" min={min} max={max} step={step}
        value={tune[k]} onChange={e => set(k, parseFloat(e.target.value))} />
    </>
  );

  return (
    <div className="fg" data-pal={tune.pal}>
      <style>{CSS}</style>

      <header className="fg-top">
        <div className="fg-brand"><i>⚡</i>Кузница<em>zapret2</em></div>
        <nav className="fg-nav">
          {[["stage", "Сцена"], ["build", "Сборка"], ["code", "Код"]].map(([id, t]) => (
            <a key={id} href={"#" + id} className={active === id ? "on" : ""}>{t}</a>
          ))}
        </nav>
        <div className="fg-top-r">
          <input className="fg-name" value={fname} onChange={e => setFname(e.target.value)} aria-label="Имя функции" />
          <button className="fg-btn" onClick={() => setPlaying(p => !p)}>{playing ? "❚❚ пауза" : "▶ проиграть"}</button>
          <button className="fg-btn pri" onClick={() => download(gen.code, gen.name + ".lua")}>скачать .lua</button>
          <span className="fg-route">#/forge</span>
        </div>
      </header>

      <div className="fg-wrap">
        <div className="fg-grid">

          {/* ── СЦЕНА ── */}
          <section className="fg-panel fg-stage" id="stage">
            <div className="fg-ph">
              <span className="sub">сцена</span>
              <h2>Карта разреза ClientHello</h2>
              <span className="sp">
                <button className="fg-btn sm" onClick={() => { setSeed(rid()); setPlaying(true); }}>🎲 новый seed</button>
                <button className="fg-btn sm" onClick={() => { posRef.current = 0; setHead(0); setPlaying(true); }}>↺ сначала</button>
              </span>
            </div>

            <div className="pm" data-grid={tune.grid ? 1 : 0} data-glow={tune.glow ? 1 : 0} style={{ "--scale": tune.scale }}>
              <div className="pm-bg" aria-hidden="true"><i /><i /></div>
              <div className="pm-grid" aria-hidden="true" />

              <div className="pm-legend">
                <span><b style={{ background: "linear-gradient(180deg,#22d3ee,#3b82f6)" }} />SNI / Host</span>
                <span><b style={{ background: "#9ef01a" }} />реальный сегмент</span>
                <span><b style={{ background: "repeating-linear-gradient(115deg,#ff4fd8 0 4px,#7a1f68 4px 8px)" }} />фейк</span>
                <span><b style={{ background: "repeating-linear-gradient(45deg,#fbbf24 0 3px,transparent 3px 6px)", border: "1px solid #fbbf24" }} />перекрытие seq</span>
                <span><b style={{ background: "#fbbf24" }} />точка разреза</span>
              </div>

              <div className="pm-ruler">
                {[0, 0.25, 0.5, 0.75, 1].map(f => (
                  <u key={f} style={{ left: `${f * 100}%` }}>{Math.round(f * plan.P.len)}</u>
                ))}
              </div>

              <div className="pm-track">
                <div className="pm-reg head" style={{ left: 0, width: `${pct(plan.P.head)}%` }}>TLS header · {plan.P.head}B</div>
                <div className="pm-reg host" style={{ left: `${pct(plan.P.head)}%`, width: `${pct(plan.P.sni.length)}%` }}>{plan.P.sni}</div>
                <div className="pm-reg tail" style={{ left: `${pct(plan.P.head + plan.P.sni.length)}%`, width: `${pct(plan.P.tail)}%` }}>extensions · {plan.P.tail}B</div>
                {plan.cuts.map(c => (
                  <div className="pm-cut" key={c} style={{ left: `${pct(c)}%` }}><u>{c}</u></div>
                ))}
                {cur && <div className="pm-play" style={{ left: `${pct(cur.off + cur.len * (head - act))}%` }} />}
              </div>

              <div className="pm-lanes">
                {plan.emissions.map((e, i) => (
                  <div key={i} className={"pm-lane" + (i === act && playing ? " act" : "") + (i < act ? " done" : "")}>
                    <span className="pm-no">{i + 1}</span>
                    <span className={"pm-kind " + e.kind}>{e.kind === "real" ? "REAL" : "FAKE"}</span>
                    <span className="pm-bar">
                      <span className={"pm-fill " + e.kind} style={{ left: `${pct(e.off)}%`, width: `${pct(e.len)}%` }} />
                      {e.ovl > 0 && <span className="pm-ovl" style={{ left: `${pct(e.off)}%`, width: `${pct(e.ovl)}%` }} />}
                    </span>
                    <span className="pm-meta">off <b>{e.off}</b> · {e.len}B{e.ovl ? ` · ov ${e.ovl}` : ""}</span>
                  </div>
                ))}
              </div>

              <div className="pm-stats">
                <div className="pm-stat"><b>{plan.P.len}</b><span>байт hello</span></div>
                <div className="pm-stat am"><b>{plan.cuts.length}</b><span>разрезов</span></div>
                <div className="pm-stat li"><b>{plan.emissions.filter(e => e.kind === "real").length}</b><span>реальных</span></div>
                <div className="pm-stat mg"><b>{plan.emissions.filter(e => e.kind === "fake").length}</b><span>фейков</span></div>
                <div className="pm-stat"><b>{plan.bytes}</b><span>байт в сеть</span></div>
                <div className="pm-stat"><b>{tune.disorder ? "обратный" : "прямой"}</b><span>порядок</span></div>
              </div>

              <div className="pm-transport">
                <button className="fg-btn sm pri" onClick={() => setPlaying(p => !p)}>{playing ? "❚❚" : "▶"}</button>
                <button className="fg-btn sm" onClick={() => { posRef.current = 0; setHead(0); setPlaying(true); }}>↺</button>
                <input className="pm-scrub" type="range" min={0} max={total} step={0.01} value={head}
                  onChange={e => { const v = parseFloat(e.target.value); posRef.current = v; setHead(v); setPlaying(false); }}
                  aria-label="Позиция проигрывания" />
                <span className="pm-time">{Math.min(total, Math.floor(head) + (playing ? 1 : 0))} / {total}</span>
                <span className="pm-time" style={{ minWidth: 92 }}>{cur ? `${cur.kind === "real" ? "real" : "fake"} @${cur.off}` : "—"}</span>
              </div>
            </div>
          </section>

          {/* ── РЕЙЛ ── */}
          <aside className="fg-rail" aria-label="Параметры сборки">
            <div className="rl-h"><b>Пульт</b><u>live</u></div>
            <div className="rl-body">

              <div className="rl-sec">
                <h3>Разрез</h3>
                <div className="rl-row"><label htmlFor="rl-mode">Режим</label></div>
                <select id="rl-mode" className="rl-sel" value={tune.mode} onChange={e => set("mode", e.target.value)}>
                  <option value="host">host — внутри SNI</option>
                  <option value="random">random — доля потока</option>
                  <option value="mid">mid — середина</option>
                  <option value="pos">pos — маркеры</option>
                </select>
                <div style={{ height: 10 }} />
                <div className="rl-row"><label htmlFor="rl-marker">Маркеры</label></div>
                <input id="rl-marker" className="rl-in" value={tune.marker} onChange={e => set("marker", e.target.value)}
                  placeholder="midsld / host,endhost / 1,midsld" />
                <div style={{ height: 12 }} />
                <div className="rl-row"><label>Сегментов</label>
                  <span className="rl-step">
                    <button onClick={() => set("parts", clamp(tune.parts - 1, 2, 8))} aria-label="Меньше">−</button>
                    <b>{tune.parts}</b>
                    <button onClick={() => set("parts", clamp(tune.parts + 1, 2, 8))} aria-label="Больше">+</button>
                  </span></div>
                <Sld k="seqovl" label="Перекрытие seq" min={0} max={48} />
                {tune.mode === "random" && <>
                  <Sld k="rmin" label="Нижняя доля" min={0.05} max={0.6} step={0.05} fmt={v => v.toFixed(2)} />
                  <Sld k="rmax" label="Верхняя доля" min={0.4} max={0.95} step={0.05} fmt={v => v.toFixed(2)} />
                </>}
                <Tg k="disorder" label="Обратный порядок" hint="disorder" />
                <Tg k="fakeBefore" label="Фейк до сегмента" hint="fake" />
                <Tg k="fakeAfter" label="Фейк после" hint="fake2" />
              </div>

              <div className="rl-sec">
                <h3>Фейк IP</h3>
                <Tg k="fakeIp" label="Подмена dst + TTL" hint="ядро" />
                <div style={{ height: 9 }} />
                <div className="rl-row"><label htmlFor="rl-dst">IPv4 dst</label></div>
                <input id="rl-dst" className="rl-in" value={tune.ipDst} onChange={e => set("ipDst", e.target.value)} />
                <div style={{ height: 12 }} />
                <Sld k="ttl" label="TTL фейка" min={1} max={64} />
                <Sld k="repeats" label="Повторов" min={1} max={5} />
                <div className="rl-row"><label>Фейков на поток</label>
                  <span className="rl-step">
                    <button onClick={() => set("maxFake", clamp(tune.maxFake - 1, 0, 8))} aria-label="Меньше">−</button>
                    <b>{tune.maxFake}</b>
                    <button onClick={() => set("maxFake", clamp(tune.maxFake + 1, 0, 8))} aria-label="Больше">+</button>
                  </span></div>
                <div className="rl-row"><label htmlFor="rl-ts">tcp_ts</label></div>
                <input id="rl-ts" className="rl-in" value={tune.tcpTs} onChange={e => set("tcpTs", e.target.value)} />
                <div style={{ height: 9 }} />
                <div className="rl-row"><label htmlFor="rl-tm">tls_mod</label></div>
                <input id="rl-tm" className="rl-in" value={tune.tlsMod} onChange={e => set("tlsMod", e.target.value)} placeholder="rndsni / sni=vk.com" />
                <div style={{ height: 10 }} />
                <Tg k="badsum" label="Битая контрольная сумма" hint="badsum" />
              </div>

              <div className="rl-sec">
                <h3>Нагрузка</h3>
                <div className="rl-row"><label htmlFor="rl-dom">Домен (SNI)</label></div>
                <input id="rl-dom" className="rl-in" value={tune.domain} onChange={e => set("domain", e.target.value)} />
                <div style={{ height: 12 }} />
                <Sld k="total" label="Длина ClientHello" min={160} max={1400} step={8} fmt={v => v + "B"} />
                <Tg k="dir" label="Фильтр направления" hint="dir" />
                <Tg k="payloadArg" label="payload-аргумент" hint="payload" />
                <Tg k="replay" label="Защита replay" hint="replay" />
                <Tg k="cutoff" label="Cutoff после успеха" hint="cutoff" />
                <Tg k="nodrop" label="Не дропать оригинал" hint="nodrop" />
              </div>

              <div className="rl-sec">
                <h3>Сцена</h3>
                <Sld k="speed" label="Скорость" min={0.25} max={3} step={0.25} fmt={v => v.toFixed(2) + "×"} />
                <Sld k="scale" label="Масштаб карты" min={0.7} max={1.6} step={0.1} fmt={v => v.toFixed(1) + "×"} />
                <Tg k="loop" label="Зациклить" hint="loop" />
                <Tg k="glow" label="Свечение" hint="glow" />
                <Tg k="grid" label="Сетка" hint="grid" />
                <div style={{ height: 9 }} />
                <div className="rl-row"><label htmlFor="rl-pal">Палитра</label></div>
                <select id="rl-pal" className="rl-sel" value={tune.pal} onChange={e => set("pal", e.target.value)}>
                  <option value="cyan">cyan · violet</option>
                  <option value="magenta">magenta · violet</option>
                  <option value="lime">lime · cyan</option>
                  <option value="amber">amber · red</option>
                </select>
              </div>

              <div className="rl-sec">
                <h3>Действия</h3>
                <div className="rl-acts">
                  <button className="fg-btn" onClick={randomize}>🎲 рандом</button>
                  <button className="fg-btn dgr" onClick={resetAll}>↺ сброс</button>
                  <button className="fg-btn" onClick={() => download(gen.code, gen.name + ".lua")}>.lua</button>
                  <button className="fg-btn" onClick={() => download(bat, gen.name + ".bat")}>.bat</button>
                  <button className="fg-btn" onClick={() => download(JSON.stringify({ name: gen.name, tune, extras, seed }, null, 2), gen.name + ".json", "application/json")}>.json</button>
                  <button className="fg-btn pri" onClick={toRun}>в прогон</button>
                </div>
                <div className="rl-seed">seed {seed} · Space — пуск/пауза · R — сначала</div>
              </div>

            </div>
          </aside>

          {/* ── СБОРКА ── */}
          <section className="fg-panel fg-build" id="build">
            <div className="fg-ph">
              <span className="sub">сборка</span>
              <h2>Палитра и цепочка</h2>
              <span className="sp">
                <select className="rl-sel" style={{ width: 150 }} value={where} onChange={e => setWhere(e.target.value)} aria-label="Куда добавлять">
                  <option value="pre">куда: до ядра</option>
                  <option value="post">куда: после ядра</option>
                </select>
                <select className="rl-sel" style={{ width: 140 }} value={sort} onChange={e => setSort(e.target.value)} aria-label="Сортировка">
                  <option value="cat">по категории</option>
                  <option value="alpha">по алфавиту</option>
                </select>
              </span>
            </div>

            <div className="bd-tools">
              <input className="bd-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск блока…" aria-label="Поиск блока" />
              <div className="bd-tabs">
                {cats.map(c => (
                  <button key={c} className={"bd-tab" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}<u>{cnt(c)}</u></button>
                ))}
              </div>
            </div>

            {palette.length === 0 ? (
              <div className="bd-zone"><div className="bd-empty">Ничего не найдено. Сбрось поиск или выбери другую категорию.</div></div>
            ) : (
              <div className="bd-pal">
                {palette.map(b => (
                  <article className="bd-card" key={b.id} style={{ "--tone": TONE[b.cat] }}>
                    <span className="bd-tag">{b.cat}</span>
                    <h4>{b.title}</h4>
                    <p>{b.desc}</p>
                    <div className="row">
                      <button className="fg-btn sm pri" onClick={() => addBlock(b.id)}>добавить</button>
                      <button className="fg-btn sm" onClick={() => setDrawer(b)}>инфо</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <Zone tag="pre" label="Пролог" />

            <div className="bd-zone">
              <h3>Ядро <u>{tune.fakeIp ? 2 : 1}</u></h3>
              {tune.fakeIp && (
                <div className="st core">
                  <div className="st-h">
                    <span className="bd-tag" style={{ "--tone": "#ff4fd8" }}>фейк</span>
                    <b>fake_ip_misdirection</b>
                    <span className="sp"><span className="fg-route">dst {tune.ipDst} · ttl {tune.ttl} · ×{tune.repeats}</span></span>
                  </div>
                  <p className="st-note">Параметры — в пульте справа, раздел «Фейк IP».</p>
                </div>
              )}
              <div className="st core">
                <div className="st-h">
                  <span className="bd-tag" style={{ "--tone": "#9ef01a" }}>разрез</span>
                  <b>outline_random_split</b>
                  <span className="sp"><span className="fg-route">{tune.mode} · {tune.parts} части · ov {tune.seqovl}</span></span>
                </div>
                <p className="st-note">Порядок вызова: {plan.emissions.map(e => e.kind === "real" ? "R" : "F").join(" → ")}</p>
              </div>
            </div>

            <Zone tag="post" label="Эпилог" />

            <div className="psv">
              <span className="sub" style={{ font: "600 10px/1 var(--mono)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--faint)" }}>Пресеты</span>
              {BUILTIN_PRESETS.map(p => (
                <button key={p.id} className="fg-btn sm" onClick={() => applyPreset(p)}>{p.name}</button>
              ))}
              {presets.map(p => (
                <span key={p.id} style={{ display: "inline-flex", gap: 3 }}>
                  <button className="fg-btn sm on" onClick={() => applyPreset(p)}>★ {p.name}</button>
                  <button className="fg-btn sm dgr" onClick={() => delPreset(p.id)} aria-label={"Удалить " + p.name}>×</button>
                </span>
              ))}
              <input className="bd-search" style={{ flex: "0 1 180px" }} value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="имя своей сборки" />
              <button className="fg-btn sm pri" onClick={savePreset}>сохранить</button>
            </div>
          </section>

          {/* ── КОД ── */}
          <section className="fg-panel fg-code" id="code">
            <div className="fg-ph">
              <span className="sub">вывод</span>
              <h2>{gen.name}.lua</h2>
              <span className="sp">
                <span className="fg-route">{gen.code.split("\n").length} строк</span>
                <span className="fg-route" style={{ color: issues.some(i => i.level === "crit") ? "var(--rd)" : issues.some(i => i.level === "warn") ? "var(--am)" : "var(--li)" }}>
                  {issues.filter(i => i.level === "crit").length} крит · {issues.filter(i => i.level === "warn").length} warn · {issues.filter(i => i.level === "info").length} инфо
                </span>
              </span>
            </div>

            <div className="bd-tools">
              <input className="bd-search" value={desc} onChange={e => setDesc(e.target.value)} placeholder="описание — попадёт в шапку файла" aria-label="Описание функции" />
              <button className="fg-btn sm" onClick={() => copy(gen.code, "Lua скопирована")}>копировать Lua</button>
              <button className="fg-btn sm" onClick={() => copy(bat, ".bat скопирован")}>копировать .bat</button>
            </div>

            <div className="cd-wrap">
              <pre className="cd-pre">
                {gen.code.split("\n").map((l, i) => (
                  <span className="ln" key={i}><i>{i + 1}</i>{highlight(l)}</span>
                ))}
              </pre>
            </div>

            {issues.length === 0 ? (
              <div className="cd-ok">Проверка пройдена: блоки сбалансированы, неизвестных вызовов нет, параметры ядра непротиворечивы.</div>
            ) : (
              <div className="cd-issues">
                {issues.map((x, i) => (
                  <article className={"iss " + x.level} key={i}>
                    <header><code>{x.code}</code><em>{x.level === "crit" ? "критично" : x.level === "warn" ? "warning" : "замечание"}</em></header>
                    <p>{x.msg}</p>
                    {x.fix && <small>→ {x.fix}</small>}
                  </article>
                ))}
              </div>
            )}

            <div className="cd-wrap" style={{ maxHeight: 260, borderTop: "1px solid var(--line)" }}>
              <pre className="cd-pre">
                {bat.split("\n").map((l, i) => <span className="ln" key={i}><i>{i + 1}</i>{highlight(l)}</span>)}
              </pre>
            </div>

            <div className="cd-acts">
              <button className="fg-btn pri" onClick={() => download(gen.code, gen.name + ".lua")}>скачать .lua</button>
              <button className="fg-btn" onClick={() => download(bat, gen.name + ".bat")}>скачать .bat</button>
              <button className="fg-btn" onClick={() => download(JSON.stringify({ name: gen.name, desc, tune, extras, seed }, null, 2), gen.name + ".json", "application/json")}>экспорт сборки .json</button>
              <button className="fg-btn" onClick={toRun}>в прогон конфига</button>
              <button className="fg-btn" onClick={() => onNav?.("strategytest")}>в тест стратегий</button>
              <button className="fg-btn" onClick={() => onNav?.("audit")}>в разбор всех BAT</button>
            </div>
          </section>

        </div>
      </div>

      {drawer && (
        <>
          <div className="dw-scrim" onClick={() => setDrawer(null)} />
          <aside className="dw" style={{ "--tone": TONE[drawer.cat] }} role="dialog" aria-modal="true" aria-label={drawer.title}>
            <div className="dw-h">
              <button className="dw-x" onClick={() => setDrawer(null)} aria-label="Закрыть">✕</button>
              <span className="bd-tag">{drawer.cat}</span>
              <h3>{drawer.title}</h3>
              <span className="fg-route">{drawer.id}</span>
            </div>
            <div className="dw-b">
              <div className="dw-f"><b>Что делает</b><p>{drawer.desc}</p></div>
              <div className="dw-f"><b>Как применять</b><p>{drawer.docs}</p></div>
              {(drawer.params || []).length > 0 && (
                <div className="dw-f"><b>Параметры</b>
                  <table className="dw-tbl"><tbody>
                    {drawer.params.map(p => <tr key={p.k}><td>{p.k}</td><td>{p.label} · по умолчанию {p.def}</td></tr>)}
                  </tbody></table>
                </div>
              )}
              <div className="dw-f"><b>Фрагмент Lua</b>
                <div className="dw-code">{fill(drawer.code, Object.fromEntries((drawer.params || []).map(p => [p.k, p.def])), { name: gen.name, uid: gen.name + "_x" })}</div>
              </div>
              <button className="fg-btn pri" onClick={() => addBlock(drawer.id)}>добавить {where === "pre" ? "в пролог" : "в эпилог"}</button>
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