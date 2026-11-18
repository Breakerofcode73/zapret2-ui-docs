import { parseConfig } from "../configRun";
import { getConfig } from "../store";
import { loadVault } from "../vault";
import { docLua } from "../luadoc";
import { FIX_WHY } from "../../data/fixWhy";
import { LORE } from "../../data/lore";
import { MARKERS, RULES as MARKER_RULES } from "../../data/markers";
import { DEEP } from "../../data/deep";
import { C_FUNCS } from "../../data/capi";
import { baseRegistry } from "../../data/flags";
import { findClusters } from "../dedup";
import { fns as lib } from "../../pages/Lib";
import { fns as antidpi } from "../../pages/Antidpi";
import { fns as auto } from "../../pages/Auto";

const KNOWN = new Set([...C_FUNCS.map(f => f.name), ...lib.map(f => f.name), ...antidpi.map(f => f.name), ...auto.map(f => f.name)]);

export const KIND_OF = {
  fake: "fake", syndata: "fake", rst: "fake", send: "dup", pktmod: "ts", drop: "drop",
  multisplit: "split", multidisorder: "disorder", multidisorder_legacy: "disorder",
  fakedsplit: "split", fakeddisorder: "disorder", hostfakesplit: "host", tcpseg: "split",
  oob: "oob", udplen: "pad", dht_dn: "pad", tls_client_hello_clone: "prep",
  http_domcase: "host", http_hostcase: "host", http_methodeol: "host", http_unixeol: "host",
  wsize: "ipid", wssize: "ipid", synack: "fake", synack_split: "fake"
};

export const SEED_CONFIG = `@echo off
chcp 65001 > nul
cd /d "%~dp0bin"
"%~dp0bin\\winws2.exe" --debug=0 --wf-tcp-out=80,443,8443 --wf-udp-out=443,19294-19344,50000-65535 --wf-udp-in=19294-19344,50000-65535 --lua-init=@"%~dp0lua\\blobs.lua" --lua-init=@"%~dp0lua\\zapret-lib.lua" --lua-init=@"%~dp0lua\\zapret-antidpi.lua" --lua-init=@"%~dp0lua\\random_split.lua" --lua-init=@"%~dp0lua\\fake_ip_misdirection.lua" --lua-init="zero256=string.rep(string.char(0),256)" ^
--name="Discord CDN (Images & Media)" ^
--filter-tcp=443 --filter-l7=tls --payload=tls_client_hello ^
--lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ip_ttl=2 ^
--lua-desync=hostfakesplit:host=www.google.com:tcp_ts=-600000:repeats=2:optional ^
--new ^
--name="Discord UDP (QUIC & Voice)" ^
--filter-udp=443,19294-19344 --filter-l7=quic,discord,stun --payload=quic_initial,discord_ip_discovery,stun --out-range=-n8 ^
--lua-desync=fake:blob=stun2:repeats=2:optional ^
--lua-desync=fake:blob=quic_google:repeats=2:optional ^
--new ^
--name="TCP 443 AI+Social (Strong Discord)" ^
--filter-tcp=443 --filter-l7=tls --payload=tls_client_hello ^
--lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ip_ttl=2 ^
--lua-desync=hostfakesplit:host=www.google.com:tcp_ts=-600000:repeats=2:optional ^
--lua-desync=multidisorder:pos=1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1 ^
--new ^
--name="TCP 443 X.com (FakeIP + Split)" ^
--filter-tcp=443 --filter-l7=tls --payload=tls_client_hello ^
--lua-desync=fake_ip_misdirection:ip_dst=192.0.2.1:ip_ttl=2 ^
--lua-desync=outline_random_split:dummy=1 ^
--new ^
--name="UDP 443 QUIC (YouTube Fallback)" ^
--filter-udp=443 --filter-l7=quic --payload=quic_initial --out-range=-n30 ^
--lua-desync=fake:blob=quic_google:repeats=6:optional ^
--lua-desync=udplen:increment=8:pattern=0x0F0F0E0F ^
--new
echo WINWS2 FINISHED. ERROR CODE: %errorlevel%
pause`;

export function study() {
  const docs = [], priors = new Map(), cooc = new Map(), templates = [];
  const bySource = {};
  const add = (id, kind, title, text, meta) => {
    docs.push({ id, kind, title, text: (title + " " + text).toLowerCase(), meta, trust: meta.trust });
    bySource[kind] = (bySource[kind] || 0) + 1;
  };

  LORE.forEach(l => add("lore:" + l.id, "lore", l.title, l.text,
    { src: "verified", trust: 0.92, note: "руководство: " + l.group, refs: l.refs, group: l.group }));

  C_FUNCS.forEach(f => {
    add("c:" + f.name, "c", f.name, f.mech + " " + f.args.map(a => a.join(" ")).join(" ") + " " + f.ret,
      { src: f.v ? "verified" : "manual", trust: f.v ? 0.95 : 0.7, note: "C-функция для Lua", fn: f.name, refs: ["capi"] });
    f.pit.forEach((p, i) => add(`cp:${f.name}:${i}`, "pitfall", f.name + " — подводный камень", p,
      { src: "verified", trust: 0.9, note: "ограничение C-функции " + f.name, fn: f.name, refs: ["capi"] }));
  });

  antidpi.forEach(f => add("s:" + f.name, "strategy", f.name, f.ru + " " + (f.std || "") + " " + (f.args || []).map(a => a.join(" ")).join(" "),
    { src: "verified", trust: 0.95, note: "штатная стратегия", fn: f.name, refs: ["antidpi"] }));
  lib.forEach(f => add("l:" + f.name, "helper", f.name, f.ru, { src: "verified", trust: 0.95, note: "хелпер", fn: f.name, refs: ["lib"] }));
  auto.forEach(f => add("a:" + f.name, "orch", f.name, f.ru, { src: "verified", trust: 0.95, note: "оркестратор", fn: f.name, refs: ["auto"] }));

  MARKERS.forEach(m => add("m:" + m.name, "marker", m.name, m.meaning + " " + m.ex,
    { src: m.certainty === "verified" ? "verified" : "config", trust: m.certainty === "verified" ? 0.95 : 0.8, note: "маркер позиции", refs: ["markers"] }));
  MARKER_RULES.forEach(([k, v], i) => add("mr:" + i, "lore", k, v, { src: "verified", trust: 0.9, note: "правило позиций", refs: ["markers"] }));

  Object.entries(FIX_WHY).forEach(([id, w]) => add("lesson:" + id, "lesson", id,
    `${w.problem} ${w.action} ${w.why} ${(w.refs || []).join(" ")}`,
    { src: "verified", trust: 0.9, note: "урок исправления", refs: ["fixer"] }));

  baseRegistry().forEach(f => add("flag:" + f.flag, "flag", f.flag, f.note + " " + f.kind + " " + f.platform,
    { src: f.src === "verified" ? "verified" : f.src === "config" ? "config" : "manual", trust: f.src === "verified" ? 0.9 : 0.7, note: "флаг командной строки", refs: ["update"] }));

  DEEP.forEach(d => {
    const parts = [d.lead, ...(d.idea || []), (d.ideaTable || []).flat(), (d.wire || []).map(w => (w.caption || "") + " " + w.diagram).join(" "),
      (d.api || []).map(a => a.name + " " + (a.text || "")).join(" "), (d.bugs || []).map(b => b.title + " " + (b.breaks || "") + " " + (b.fix || "")).join(" "),
      (d.how || []).join(" "), d.test || "", d.fix || ""];
    add("d:" + d.id, "deep", d.id, parts.join(" "), { src: "verified", trust: 0.95, note: "полный разбор", refs: ["deep/" + d.id] });
    (d.bugs || []).forEach((b, i) => add(`db:${d.id}:${i}`, "pitfall", d.id + " — " + b.title,
      (b.text || "") + " " + (b.breaks || "") + " " + (b.fix || ""), { src: "verified", trust: 0.92, note: "дефект из разбора", refs: ["deep/" + d.id] }));
  });

  const cfgText = getConfig();
  let profiles = 0, instances = 0;
  if (cfgText.trim()) {
    const cfg = parseConfig(cfgText);
    if (cfg.found) {
      profiles = cfg.profiles.length;
      const seen = new Map();
      cfg.profiles.forEach((p, pi) => {
        instances += p.instances.length;
        const chain = p.instances.map(i => i.fn);
        add("profile:" + pi, "profile", p.name,
          `${p.name} tcp ${p.tcp} udp ${p.udp} l7 ${p.l7} payload ${p.payload} ${chain.join(" ")} ${p.hostlists.join(" ")}`,
          { src: "config", trust: 0.85, note: "рабочий профиль", profile: p.name, pi, refs: ["run"] });
        const ops = [];
        p.instances.forEach(i => {
          priors.set(i.fn, (priors.get(i.fn) || 0) + 1);
          const k = KIND_OF[i.fn] || (i.fn.includes("split") ? "split" : i.fn.includes("fake") ? "fake" : null);
          if (k) ops.push(k);
          if (i.args.ip_ttl || i.args.ip_dst) ops.push("ttl");
          if (i.args.badsum) ops.push("badsum");
          if (i.args.seqovl) ops.push("seqovl");
          if (i.args.tcp_ts) ops.push("ts");
        });
        const u = [...new Set(ops)];
        for (let a = 0; a < u.length; a++) for (let b = a + 1; b < u.length; b++) {
          const k = u[a] < u[b] ? u[a] + "|" + u[b] : u[b] + "|" + u[a];
          cooc.set(k, (cooc.get(k) || 0) + 1);
        }
        const key = chain.join(">");
        if (!chain.length) return;
        if (!seen.has(key)) {
          const t = { key, chain: p.instances.map(i => ({ fn: i.fn, args: i.args, kind: KIND_OF[i.fn] || "custom" })),
            kinds: u, count: 0, profiles: [], transport: p.udp && !p.tcp ? "udp" : "tcp", payload: p.payload, l7: p.l7, ops: u };
          seen.set(key, t); templates.push(t);
          add("tpl:" + templates.length, "template", chain.join(" → "),
            `${p.name} ${chain.join(" ")} ${u.join(" ")} ${p.payload} ${p.l7}`,
            { src: "config", trust: 0.88, note: "проверенная цепочка из конфига", refs: ["run"], tpl: key });
        }
        const t = seen.get(key); t.count++; t.profiles.push(p.name);
      });
    }
  }

  const items = loadVault();
  let fixed = 0;
  items.forEach(it => {
    const d = docLua(it.text, it.file, KNOWN);
    const clean = d.issues.length === 0;
    if ((it.tags || []).includes("исправлено")) fixed++;
    d.funcs.filter(f => f.isDesync).forEach(f => {
      add("state:" + f.name, "state", f.name,
        `${f.name} ${f.kind} ${clean ? "проверена без замечаний" : "имеет замечания"} версий ${it.versions.length} ${(it.tags || []).join(" ")} ${it.note || ""} ${f.args.map(a => a.name + " " + a.desc).join(" ")}`,
        { src: "custom", trust: clean ? 0.85 : 0.6, note: "твоя функция", fn: f.name, file: it.file, refs: ["myapi"] });
      f.deps.forEach(dep => cooc.set("fn:" + f.name + "|" + dep, (cooc.get("fn:" + f.name + "|" + dep) || 0) + 1));
    });
  });

  let dup = 0;
  try {
    const { clusters, near } = findClusters();
    dup = clusters.length;
    clusters.forEach((c, i) => add("dup:" + i, "duplicate", c.group.map(g => g.name).join(" / "),
      `дубликаты одинаковая логика разные значения ${c.varying.map(v => v.name).join(" ")} ${c.identical ? "полные копии" : "можно объединить"}`,
      { src: "custom", trust: 0.8, note: "кластер дубликатов", refs: ["dedup"] }));
    near.forEach((g, i) => add("near:" + i, "duplicate", g.map(x => x.name).join(" / "),
      "похожие вызовы разный порядок объединять нельзя автоматически", { src: "custom", trust: 0.8, note: "порядок различается", refs: ["dedup"] }));
  } catch {}

  return { docs, priors, cooc, templates, bySource,
    stats: { lore: LORE.length, cfuncs: C_FUNCS.length, lessons: Object.keys(FIX_WHY).length, deep: DEEP.length,
      markers: MARKERS.length, profiles, instances, templates: templates.length, vault: items.length, fixed, dup, harvested: docs.length } };
}

export function coocBoost(cooc, a, b) {
  const k = a < b ? a + "|" + b : b + "|" + a;
  return Math.min(0.6, (cooc.get(k) || 0) * 0.12);
}