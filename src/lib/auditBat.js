import { checkBat } from "./checkBat";
import { fixBat } from "./fixBat";
import { parseProfiles, toStrategies } from "./strategyTest";

const SEG = /^(multisplit|multidisorder|multidisorder_legacy|fakedsplit|fakeddisorder|hostfakesplit|tcpseg)$/;
const FAKE = /^(fake|syndata)$/;
const FOOL = /(^|:)(ip_ttl|ip6_ttl|ip_autottl|ip6_autottl|badsum)(=|:|$)/i;
const D = "--lua-desync=";

export const LADDER = [
  { label: "сплит", cmd: D + "multisplit:pos=1,midsld" },
  { label: "disorder", cmd: D + "multidisorder:pos=midsld:seqovl=2" },
  { label: "фейк + сплит", cmd: D + "fake:blob=fake_default_tls:ip_ttl=8:badsum " + D + "multisplit:pos=1,midsld" },
  { label: "fakedsplit", cmd: D + "fakedsplit:pos=midsld:ip_ttl=8:badsum" },
  { label: "fakeddisorder", cmd: D + "fakeddisorder:pos=midsld:ip_ttl=8:badsum" },
  { label: "маскировка хоста", cmd: D + "hostfakesplit:host=e8nzn.vk.com:midhost=midsld:ip_ttl=8:badsum" }
];

const instOf = s => s.args.filter(a => a.toLowerCase().startsWith(D)).map(a => a.slice(D.length));
const fnsOf = s => instOf(s).map(v => v.split(":")[0].toLowerCase());

export function stageOf(s) {
  const f = fnsOf(s);
  if (f.includes("hostfakesplit")) return 5;
  if (f.includes("fakeddisorder")) return 4;
  if (f.includes("fakedsplit")) return 3;
  if (f.includes("fake") && f.some(x => SEG.test(x))) return 2;
  if (f.includes("multidisorder")) return 1;
  if (f.includes("multisplit")) return 0;
  return -1;
}

export function signature(s) {
  return s.args.filter(a => /^--(lua-desync|filter-|payload|out-range|in-range)/i.test(a)).join("|").toLowerCase().replace(/"/g, "");
}

export function advise(s, parsed) {
  const out = [];
  const add = (code, level, msg, fix) => out.push({ code, level, msg, fix });
  const inst = instOf(s), fns = fnsOf(s);
  const low = s.args.map(a => a.toLowerCase());
  const hasFlag = n => low.some(a => a.startsWith(n + "="));
  const segIdx = fns.findIndex(f => SEG.test(f));
  const fakeIdx = fns.findIndex(f => FAKE.test(f));

  inst.forEach((v, i) => {
    const fn = fns[i];
    if (FAKE.test(fn) && !FOOL.test(v)) add("A001", "crit", `${fn} без badsum/ip_ttl — фейк дойдёт до сервера и может сломать соединение.`, D + v + ":ip_ttl=8:badsum");
    if (/^(fakedsplit|fakeddisorder|hostfakesplit)$/.test(fn) && !FOOL.test(v)) add("A005", "warn", `${fn}: fooling применяется только к фейкам, но не задан — фейки уйдут серверу.`, D + v + ":ip_ttl=8:badsum");
    if (SEG.test(fn) && !/(^|:)pos=/.test(v)) add("A004", "info", `${fn} без pos — разрез по умолчанию на 2-м байте.`, D + fn + ":pos=1,midsld");
    if (/^(multidisorder|fakeddisorder)$/.test(fn) && !/(^|:)seqovl=/.test(v)) add("A010", "info", `${fn} без seqovl — попробуй перекрытие seq.`, D + v + ":seqovl=2");
    if (fn === "hostfakesplit" && !/(^|:)midhost=/.test(v)) add("A006", "info", "hostfakesplit без midhost — реальный хост уходит одним куском.", D + v + ":midhost=midsld");
    if (fn === "hostfakesplit" && !/(^|:)host=/.test(v)) add("A007", "info", "hostfakesplit без шаблона host — фейковый хост случайный.", D + v + ":host=e8nzn.vk.com");
  });

  if (fakeIdx > -1 && segIdx > -1 && fakeIdx > segIdx) add("A003", "warn", "Фейк стоит после сегментации — реальные сегменты уйдут раньше фейка.", "Поставь fake/syndata перед сегментирующей функцией.");
  if (fns.indexOf("oob") > 0) add("A013", "info", "oob не первый — он должен видеть соединение с SYN.", "Перенеси " + D + "oob в начало профиля.");
  const me = fns.indexOf("http_methodeol");
  if (me > -1 && fns.some((f, i) => i > me && f.startsWith("http_"))) add("A014", "warn", "http_methodeol должен быть последним среди http-правок.", "Перенеси http_methodeol в конец http-блока.");

  const clone = inst.find(v => /^tls_client_hello_clone:/i.test(v));
  if (clone) {
    const m = clone.match(/(^|:)blob=([^:]+)/);
    const name = m && m[2];
    if (name && !inst.some(v => !/^tls_client_hello_clone/i.test(v) && new RegExp("(^|:)blob=" + name + "(:|$)").test(v)))
      add("A012", "warn", `Клон ${name} создаётся, но дальше не используется.`, D + "fake:blob=" + name + ":ip_ttl=8:badsum");
  }

  if (inst.length && !hasFlag("--payload")) add("A008", "warn", "Нет --payload — Lua вызывается на всех пакетах профиля.", "--payload=tls_client_hello (или http_req / quic_initial)");
  if (inst.length && !hasFlag("--out-range")) add("A009", "info", "Нет --out-range — инстансы работают по всему потоку.", "--out-range=-n30");
  if (inst.length && !hasFlag("--filter-l7")) add("A016", "info", "Нет --filter-l7 — профиль ловит все протоколы на порту.", "--filter-l7=tls (или http / quic)");
  if (!hasFlag("--hostlist")) add("A020", "info", "Нет --hostlist — стратегия бьёт по всему трафику порта.", 'Добавь --hostlist="%~dp0list.txt" из «Списков доменов».');
  if ((s.udp || fns.some(f => /^(udplen|dht_dn)$/.test(f))) && !hasFlag("--filter-udp")) add("A011", "warn", "UDP-функции без --filter-udp — не сработают.", "--filter-udp=443 и --wf-udp-out=443");
  if (fns.some(f => /^(wsize|wssize)$/.test(f)) && !parsed.global.some(a => /^--wf-tcp-in=/i.test(a))) add("A017", "warn", "wsize/wssize меняет окно в SYN+ACK — нужен входящий перехват.", "--wf-tcp-in=80,443 и dir=in");

  const seen = new Set();
  inst.forEach(v => { const k = v.toLowerCase(); if (seen.has(k)) add("A015", "info", `Повтор инстанса ${v.split(":")[0]} — лишний вызов.`, "Убери дубликат " + D); else seen.add(k); });
  return out;
}

export function auditFiles(files, { registry = new Map(), rows = [] } = {}) {
  const reports = files.map(f => {
    const chk = checkBat(f.text, { registry, knownFns: new Set(), profile: [] });
    const fix = fixBat(f.text, { registry });
    const parsed = parseProfiles(f.text);
    const strategies = toStrategies(parsed).map(s => {
      const mine = rows.filter(r => r.strategy === s.name);
      const ok = [...new Set(mine.filter(r => r.ok).map(r => r.domain))];
      const bad = [...new Set(mine.filter(r => !r.ok).map(r => r.domain))];
      const stage = stageOf(s);
      const advice = advise(s, parsed);
      if (mine.length) {
        if (!ok.length) advice.unshift({ code: "T001", level: "crit", msg: `По прогону не прошла ни на одном домене (${bad.length}). Ступень ${stage}.`, fix: stage >= 0 && stage < 5 ? "Подними ступень: " + LADDER[stage + 1].cmd : "Смени семейство: маскировка хоста или UDP-путь." });
        else if (bad.length) advice.unshift({ code: "T002", level: "warn", msg: `Работает не везде: ${ok.length} ок / ${bad.length} нет.`, fix: "Раздели на профили с hostlist: рабочие домены оставь, для остальных подними ступень." });
        else advice.unshift({ code: "T003", level: "info", msg: `Прошла на всех ${ok.length} доменах.`, fix: stage > 0 ? "Можно ослабить ради скорости: " + LADDER[stage - 1].cmd : "Оставь как есть." });
      }
      return { ...s, advice, stage, sig: signature(s), perf: { ok, bad, tested: mine.length > 0 } };
    });
    const n = { crit: 0, warn: 0, info: 0 };
    chk.issues.forEach(i => n[i.level]++);
    return { file: f.file, text: f.text, chk, fix, parsed, strategies, n, adviceCount: strategies.reduce((a, s) => a + s.advice.length, 0) };
  });

  const bySig = new Map();
  reports.forEach(r => r.strategies.forEach(s => {
    if (!bySig.has(s.sig)) bySig.set(s.sig, []);
    bySig.get(s.sig).push({ file: r.file, name: s.name });
  }));
  const dupes = [...bySig.values()].filter(v => v.length > 1);
  const proto = new Set();
  reports.forEach(r => r.strategies.forEach(s => (s.proto.length ? s.proto : [s.udp ? "quic" : "tls"]).forEach(p => proto.add(p))));
  const missing = ["tls", "http", "quic"].filter(p => !proto.has(p));
  const totals = {
    files: reports.length,
    profiles: reports.reduce((a, r) => a + r.strategies.length, 0),
    crit: reports.reduce((a, r) => a + r.n.crit, 0),
    warn: reports.reduce((a, r) => a + r.n.warn, 0),
    info: reports.reduce((a, r) => a + r.n.info, 0),
    autofix: reports.reduce((a, r) => a + r.fix.applied.length, 0),
    advice: reports.reduce((a, r) => a + r.adviceCount, 0),
    dupes: dupes.length, missing
  };
  return { reports, dupes, totals };
}

export function reportMd(audit) {
  const t = audit.totals, L = ["# Разбор всех BAT", "",
    `Файлов: ${t.files} · профилей: ${t.profiles} · дефектов: ${t.crit} крит / ${t.warn} warn / ${t.info} зам · автофиксов: ${t.autofix} · советов: ${t.advice}`, ""];
  if (t.missing.length) L.push(`Не покрыты протоколы: ${t.missing.join(", ")}`, "");
  audit.reports.forEach(r => {
    L.push(`## ${r.file}`, `Дефекты: ${r.n.crit}/${r.n.warn}/${r.n.info}. Автоисправлений: ${r.fix.applied.length}.`, "");
    r.fix.applied.forEach(a => L.push(`- [авто ${a.id}] ${a.title} ×${a.count}`));
    r.strategies.forEach(s => {
      L.push("", `### Профиль ${s.name} — ступень ${s.stage}${s.perf.tested ? ` · прогон: ${s.perf.ok.length} ок / ${s.perf.bad.length} нет` : ""}`);
      L.push("Цепочка: " + instOf(s).join(" → "));
      s.advice.forEach(a => L.push(`- [${a.code}/${a.level}] ${a.msg}${a.fix ? "\n  → " + a.fix : ""}`));
    });
    L.push("");
  });
  if (audit.dupes.length) {
    L.push("## Дубликаты стратегий");
    audit.dupes.forEach(d => L.push("- " + d.map(x => `${x.file}:${x.name}`).join(" = ")));
  }
  return L.join("\n");
}