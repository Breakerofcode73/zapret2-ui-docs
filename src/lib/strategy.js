import { STRATEGIES, FAMILIES } from "../data/strategies";

const NODES = [
  { id: "svc:youtube", cat: "Сервис", label: "YouTube", kw: ["ютуб", "youtube", "youtu.be"] },
  { id: "svc:discord", cat: "Сервис", label: "Discord", kw: ["дискорд", "discord"] },
  { id: "svc:site", cat: "Сервис", label: "Сайт / браузер", kw: ["сайт", "http", "браузер", "страниц", "веб"] },
  { id: "svc:torrent", cat: "Сервис", label: "Торренты", kw: ["торрент", "torrent", "dht"] },
  { id: "svc:any", cat: "Сервис", label: "Всё сразу", kw: ["всё", "все сайты", "универсальн", "любой сайт"] },
  { id: "sym:block", cat: "Симптом", label: "Блокировка", kw: ["не работает", "не открыва", "блок", "заблокир", "не грузит", "не подключ"] },
  { id: "sym:slow", cat: "Симптом", label: "Замедление", kw: ["тормоз", "медлен", "замедл", "буфер", "лаг", "долго груз", "скорост"] },
  { id: "sym:redirect", cat: "Симптом", label: "Редирект / заглушка", kw: ["редирект", "заглушк", "перекидыва"] },
  { id: "sym:voice", cat: "Симптом", label: "Голос", kw: ["голос", "войс", "не слыш", "созвон"] },
  { id: "proto:http", cat: "Протокол", label: "HTTP" },
  { id: "proto:tls", cat: "Протокол", label: "TLS/HTTPS" },
  { id: "proto:quic", cat: "Протокол", label: "QUIC" },
  { id: "proto:udp", cat: "Протокол", label: "UDP" },
  ...Object.keys(FAMILIES).map(f => ({ id: "fam:" + f, cat: "Семейство", label: FAMILIES[f] }))
];
const EDGES = [
  ["svc:youtube", "proto:tls", .9], ["svc:youtube", "proto:quic", .8],
  ["svc:discord", "proto:udp", .9],
  ["svc:site", "proto:http", .8], ["svc:site", "proto:tls", .8],
  ["svc:torrent", "proto:udp", .7],
  ["svc:any", "proto:tls", .6], ["svc:any", "proto:http", .5], ["svc:any", "proto:quic", .5],
  ["sym:block", "fam:fake", .9], ["sym:block", "fam:disorder", .8], ["sym:block", "fam:mask", .7], ["sym:block", "fam:tamper", .6],
  ["sym:slow", "fam:split", .9], ["sym:slow", "fam:win", .5], ["sym:slow", "fam:udp", .4],
  ["sym:redirect", "fam:tamper", .9], ["sym:redirect", "fam:split", .6],
  ["sym:voice", "fam:udp", .9],
  ["proto:tls", "fam:split", .8], ["proto:tls", "fam:disorder", .7], ["proto:tls", "fam:fake", .8], ["proto:tls", "fam:mask", .7],
  ["proto:http", "fam:tamper", .9], ["proto:http", "fam:split", .7], ["proto:http", "fam:fake", .5],
  ["proto:quic", "fam:udp", .9], ["proto:udp", "fam:udp", .9],
  ...STRATEGIES.map(s => ["fam:" + s.family, "s:" + s.id, 1])
];
const LABEL = Object.fromEntries([...NODES.map(n => [n.id, n.label]), ...STRATEGIES.map(s => ["s:" + s.id, s.title])]);
const ADJ = new Map();
EDGES.forEach(([a, b, w]) => { if (!ADJ.has(a)) ADJ.set(a, []); ADJ.get(a).push([b, w]); });

export function matchRequest(text) {
  const t = String(text || "").toLowerCase();
  const intents = NODES.filter(n => n.kw && n.kw.some(k => t.includes(k)));
  const scores = new Map(), best = new Map();
  const walk = (id, acc, path, depth) => {
    if (depth > 4) return;
    for (const [to, w] of ADJ.get(id) || []) {
      const na = acc * w;
      if (to.startsWith("s:")) {
        scores.set(to, (scores.get(to) || 0) + na);
        if (!best.has(to) || best.get(to).acc < na) best.set(to, { acc: na, path: [...path, to] });
      } else walk(to, na, [...path, to], depth + 1);
    }
  };
  intents.forEach(n => walk(n.id, 1, [n.id], 0));
  const hits = STRATEGIES.map(s => {
    const sid = "s:" + s.id;
    let score = scores.get(sid) || 0;
    if (!score) return null;
    intents.forEach(n => {
      if (n.id.startsWith("svc:") && s.targets.includes(n.id.slice(4))) score += .5;
      if (n.id.startsWith("sym:") && s.symptoms.includes(n.id.slice(4))) score += .3;
    });
    score -= s.risk * .05;
    return { s, score, path: (best.get(sid)?.path || []).map(id => LABEL[id] || id) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  const max = hits[0]?.score || 1;
  hits.forEach(h => h.pct = Math.max(5, Math.round(100 * h.score / max)));
  return { intents, hits: hits.slice(0, 6) };
}

const unionPorts = vals => [...new Set(vals.filter(Boolean).flatMap(v => v.split(",")))].join(",");

export function assembleBat(list, opts = {}) {
  const lua = opts.luaDir || "lua\\";
  const wfTcp = unionPorts(list.map(s => s.filters.tcp));
  const wfUdp = unionPorts(list.map(s => s.filters.udp));
  const wfTcpIn = unionPorts(list.map(s => s.filters.tcpIn));
  const cmd = ['start "zapret2" /min "%~dp0winws2.exe"'];
  if (wfTcp) cmd.push("--wf-tcp-out=" + wfTcp);
  if (wfUdp) cmd.push("--wf-udp-out=" + wfUdp);
  if (wfTcpIn) cmd.push("--wf-tcp-in=" + wfTcpIn);
  ["zapret-lib.lua", "zapret-antidpi.lua", "zapret-auto.lua"].forEach(f => cmd.push(`--lua-init=@"%~dp0${lua}${f}"`));
  list.forEach(s => {
    cmd.push("--new", "--name=" + s.id);
    const tcp = s.filters.tcp || s.filters.tcpIn;
    if (tcp) cmd.push("--filter-tcp=" + tcp);
    if (s.filters.udp) cmd.push("--filter-udp=" + s.filters.udp);
    if (s.filters.l7) cmd.push("--filter-l7=" + s.filters.l7);
    if (opts.hostlist) cmd.push(`--hostlist="%~dp0${opts.hostlist}"`);
    if (s.filters.payload) cmd.push("--payload=" + s.filters.payload);
    if (s.filters.out) cmd.push("--out-range=" + s.filters.out);
    s.chain.forEach(c => cmd.push("--lua-desync=" + c.fn + (c.args ? ":" + c.args : "")));
  });
  return ["@echo off", "chcp 65001 >nul",
    "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)",
    'cd /d "%~dp0"', cmd.join(" ^\n ")].join("\n") + "\n";
}