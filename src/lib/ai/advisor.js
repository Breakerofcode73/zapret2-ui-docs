// Критикует замысел и код, для каждой проблемы даёт готовую альтернативу.
import { assess } from "../intent";
import { synthesize } from "../synth";
import { checkLua } from "../checkLua";
import { fixLua } from "../fixLua";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SEV_W = { crit: 30, warn: 12, info: 4 };

export const LADDER = [
  { n: 0, label: "только разрез", ops: ["split"], args: "pos=1,midsld", traffic: 1.0 },
  { n: 1, label: "разрез + случайность", ops: ["split", "random"], args: "mode=host", traffic: 1.0 },
  { n: 2, label: "обратный порядок + перекрытие", ops: ["disorder", "seqovl"], args: "pos=midsld:seqovl=2", traffic: 1.05 },
  { n: 3, label: "приманка + разрез", ops: ["fake", "ttl", "badsum", "split"], args: "ip_ttl=8:badsum", traffic: 2.0 },
  { n: 4, label: "приманка вокруг каждого куска", ops: ["fake", "ttl", "badsum", "split", "repeat"], args: "fake:fake2:ip_ttl=8:badsum", traffic: 3.0 },
  { n: 5, label: "подмена имени целиком", ops: ["host", "fake", "ttl", "badsum"], args: "host=e8nzn.vk.com:midhost=midsld", traffic: 1.1 }
];
export function rungOf(ops) {
  const s = new Set(ops);
  if (s.has("host")) return 5;
  if (s.has("repeat") && s.has("fake")) return 4;
  if (s.has("fake") && (s.has("split") || s.has("disorder"))) return 3;
  if (s.has("disorder") || s.has("seqovl")) return 2;
  if (s.has("random")) return 1;
  if (s.has("split")) return 0;
  return -1;
}

const ANTI = [
  { id: "V01", sev: "crit", when: o => o.includes("fake") && !o.includes("ttl") && !o.includes("badsum") && !o.includes("ipdst"),
    why: "Приманка без TTL/badsum дойдёт до сервера. Сервер примет подставные данные как настоящие — соединение сломается вместо обхода.",
    better: { ops: ["fake", "ttl", "badsum"], label: "приманка с TTL 8 и битой суммой", args: "ip_ttl=8:badsum" } },
  { id: "V02", sev: "crit", when: (o, c, p) => o.includes("fake") && (p.ip_ttl === undefined ? 8 : p.ip_ttl) >= 20 && !o.includes("badsum"),
    why: "TTL 20 и выше без битой суммы: копия доживёт до сервера. DPI обманется, но и сервер тоже — придёт мусор в реальное соединение.",
    better: { ops: ["fake", "ttl", "badsum"], label: "TTL 8 + badsum", args: "ip_ttl=8:badsum" } },
  { id: "V03", sev: "warn", when: (o, c, p) => o.includes("ttl") && (p.ip_ttl === undefined ? 8 : p.ip_ttl) <= 2,
    why: "TTL 1-2: копия умирает на домашнем роутере. Внешний DPI её не увидит — приём работает вхолостую.",
    better: { ops: o, label: "TTL 8 или авто-подбор", args: "ip_autottl=-2,3-12" } },
  { id: "V04", sev: "crit", when: o => o.includes("split") && o.includes("disorder"),
    why: "Разрез и обратный порядок одновременно — конфликт из графа знаний. Второй приём перекрывает работу первого, порядок кусков неопределён.",
    better: { ops: ["disorder", "seqovl"], label: "только обратный порядок с перекрытием", args: "pos=midsld:seqovl=2" } },
  { id: "V05", sev: "crit", when: o => o.includes("oob") && (o.includes("fake") || o.includes("split") || o.includes("disorder")),
    why: "OOB требует видеть соединение с SYN и работать первым. Приманка или разрез до него ломают нумерацию.",
    better: { ops: ["oob"], label: "OOB отдельно, без приманки и разреза", args: "" } },
  { id: "V06", sev: "crit", when: (o, c) => o.includes("pad") && (o.includes("split") || o.includes("disorder")) && c.transport !== "udp",
    why: "Изменение длины работает только для UDP. Для TCP паддинг сдвигает sequence — сервер получит несогласованный поток.",
    better: { ops: ["split"], label: "для TCP — разрез вместо паддинга", args: "pos=1,midsld" } },
  { id: "V07", sev: "crit", when: (o, c) => o.includes("invert") && c.target !== "copy",
    why: "Инверсия байтов на оригинале делает запрос нечитаемым и для сервера. Сайт перестанет открываться.",
    better: { ops: ["invert", "fake", "ttl", "badsum"], label: "инверсия только в копии, которая умрёт", args: "ip_ttl=6:badsum", ctx: { target: "copy" } } },
  { id: "V08", sev: "warn", when: (o, c, p) => (p.seqovl || 0) > 0 && (p.firstCut === undefined ? 99 : p.firstCut) < (p.seqovl || 0),
    why: "Перекрытие больше первой точки реза: второй кусок начнётся с нуля и продублирует первый целиком.",
    better: { ops: o, label: "перекрытие 2 байта", args: "seqovl=2" } },
  { id: "V09", sev: "warn", when: (o, c) => o.includes("fake") && (c.maxfake === undefined ? 1 : c.maxfake) === 0,
    why: "Без лимита приманка отправляется на каждом исходящем пакете с нагрузкой — десятки лишних пакетов на сессию.",
    better: { ops: o, label: "не больше 1-2 приманок на соединение", args: "maxfake=1" } },
  { id: "V10", sev: "warn", when: o => o.length >= 5,
    why: "Пять и больше приёмов в одной функции: каждый следующий работает по уже изменённым данным. Отладить невозможно.",
    better: { ops: o.slice(0, 3), label: "оставить 2-3 приёма, остальное отдельным профилем", args: "" } },
  { id: "V11", sev: "warn", when: (o, c) => !c.payload && o.length > 0,
    why: "Без фильтра нагрузки Lua вызывается на всех пакетах профиля — лишняя нагрузка на CPU при том же результате.",
    better: { ops: o, label: "добавить фильтр нагрузки", args: "" } },
  { id: "V12", sev: "info", when: (o, c) => rungOf(o) >= 4 && !c.triedLower,
    why: "Сразу максимальная ступень: трафик вырастает втрое. Если лёгкие приёмы не пробовались — преждевременно.",
    better: { ops: LADDER[0].ops, label: "начать с простого разреза", args: LADDER[0].args } },
  { id: "V13", sev: "info", when: (o, c) => o.includes("drop") && c.target !== "original",
    why: "Запрет пакета на копии бессмысленен: копия и так не должна дойти.",
    better: { ops: ["drop"], label: "запрет на оригинале", args: "", ctx: { target: "original" } } }
];

const CODE_RULES = [
  { id: "C01", sev: "crit", title: "Проверка ClientHello применяется к любой нагрузке",
    re: /if not is_complete_client_hello\(data\) then/,
    guard: t => !/l7payload\s*==\s*"tls_client_hello"\s+and\s+not\s+is_complete/.test(t),
    why: "Для HTTP байты 0x16 0x03 не совпадут — функция всегда уйдёт в fallback split=1 вместо случайного разреза внутри имени.",
    fix: t => t.replace(/if not is_complete_client_hello\(data\) then/g, 'if desync.l7payload == "tls_client_hello" and not is_complete_client_hello(data) then') },
  { id: "C02", sev: "crit", title: "Cutoff на related ICMP ломает PMTU",
    re: /if not desync\.dis\.tcp then\s*\n([ \t]*)instance_cutoff_shim\(ctx,\s*desync\)/,
    why: "Related ICMP приходит вне TCP-потока. Инстанс отключится и перестанет обслуживать соединение целиком.",
    fix: t => t.replace(/if not desync\.dis\.tcp then\s*\n([ \t]*)instance_cutoff_shim\(ctx,\s*desync\)/g,
      (m, i) => "if not desync.dis.tcp then\n" + i + "if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end") },
  { id: "C03", sev: "crit", title: "apply_fooling вызван с третьим аргументом",
    re: /apply_fooling\(\s*desync\s*,\s*(\w+)\s*,\s*\{[\s\S]*?\}\s*\)/,
    why: "Сигнатура — apply_fooling(desync, dis). Третья таблица игнорируется: ip_ttl и tcp_ts не применяются.",
    fix: t => t.replace(/([ \t]*)apply_fooling\(\s*desync\s*,\s*(\w+)\s*,\s*\{([\s\S]*?)\}\s*\)/g, (m, ind, dis, body) => {
      const inner = body.split("\n").map(s => s.trim()).filter(Boolean).join("\n" + ind + "    ");
      return ind + "local __over = {\n" + ind + "    " + inner + "\n" + ind + "}\n" + ind + "local __saved = {}\n" +
        ind + "for k, v in pairs(__over) do __saved[k] = desync.arg[k]; desync.arg[k] = v end\n" +
        ind + "pcall(apply_fooling, desync, " + dis + ")\n" +
        ind + "for k in pairs(__over) do desync.arg[k] = __saved[k] end"; }) },
  { id: "C04", sev: "crit", title: "Реальные сегменты уходят с fooling",
    re: /rawsend_payload_segmented\(([^()]*)\)/,
    guard: t => Array.from(t.matchAll(/rawsend_payload_segmented\(([^()]*)\)/g)).some(m => m[1].split(",").filter(s => s.trim()).length === 3),
    why: "Без таблицы опций TTL и badsum применятся к настоящим данным — сервер их отбросит.",
    fix: t => {
      let o = t.replace(/rawsend_payload_segmented\(([^()]*)\)/g, (m, a) =>
        a.split(",").filter(s => s.trim()).length === 3 ? "rawsend_payload_segmented(" + a + ", opts_orig)" : m);
      if (!/local opts_orig\s*=/.test(o)) o = o.replace(/(function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/,
        x => x + "    local opts_orig = { rawsend = rawsend_opts_base(desync), reconstruct = {}, ipfrag = {},\n                        ipid = desync.arg, fooling = { tcp_ts_up = desync.arg.tcp_ts_up } }\n");
      return o; } },
  { id: "C05", sev: "warn", title: "TTL по умолчанию слишком мал",
    re: /local\s+DEFAULT_IP_TTL\s*=\s*[0-2]\b/,
    why: "TTL 1 умирает на первом хопе — внешний DPI приманку не увидит.",
    fix: t => t.replace(/local\s+DEFAULT_IP_TTL\s*=\s*[0-2]\b/g, "local DEFAULT_IP_TTL = 8") },
  { id: "C06", sev: "warn", title: "math.random не сеялся",
    re: /math\.random\s*\(/, guard: t => !/math\.randomseed/.test(t),
    why: "Без randomseed последовательность одинакова после каждого старта — случайный разрез предсказуем.",
    fix: t => {
      const h = "local __SEEDED = false\nlocal function __seed()\n    if __SEEDED then return end\n    __SEEDED = true\n    local s = os.time()\n    local ok, tt = pcall(clock_gettime)\n    if ok and tonumber(tt) then s = s + math.floor(tonumber(tt) * 1000) end\n    local okp, pid = pcall(getpid)\n    if okp and tonumber(pid) then s = s + tonumber(pid) * 7919 end\n    math.randomseed(s % 2147483647)\n    math.random(); math.random(); math.random()\nend\n\n";
      return (h + t).replace(/(function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/, m => m + "    __seed()\n"); } },
  { id: "C07", sev: "warn", title: "Приманка на каждом пакете соединения",
    re: /function\s+fake_ip_misdirection/, guard: t => !/lua_state/.test(t),
    why: "Нет счётчика: каждый исходящий пакет с нагрузкой порождает копию.",
    fix: t => t.replace(/(function\s+fake_ip_misdirection\s*\(\s*ctx\s*,\s*desync\s*\)\s*\n)/, m => m +
      "    do\n        local st = desync.track and desync.track.lua_state\n        if st then\n            local key = \"fim_\" .. tostring(desync.func_instance or 0)\n            local n = st[key] or 0\n            local maxn = tonumber(desync.arg.maxfake) or 1\n            if maxn > 0 and n >= maxn then instance_cutoff_shim(ctx, desync); return VERDICT_PASS end\n            st[key] = n + 1\n        end\n    end\n") },
  { id: "C08", sev: "warn", title: "Аргументы dir и payload игнорируются",
    re: /if not desync\.outgoing or not desync\.dis\.tcp then/,
    why: "Проверяется только desync.outgoing. Стандартные dir и payload не работают.",
    fix: t => t.replace(/([ \t]*)if not desync\.outgoing or not desync\.dis\.tcp then/g, (m, i) =>
      i + "if not desync.dis.tcp then\n" + i + "    if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end\n" + i + "    return VERDICT_PASS\n" + i + "end\n" +
      i + "direction_cutoff_opposite(ctx, desync)\n" + i + "if not direction_check(desync) then return VERDICT_PASS end\n" +
      i + "if desync.arg.payload and not payload_check(desync) then") },
  { id: "C09", sev: "info", title: "Перекрытие может продублировать весь первый кусок",
    re: /split_pos\s*>=\s*seqovl/,
    why: "Условие >= допускает равенство: второй кусок начнётся с нуля и повторит первый целиком.",
    fix: t => t.replace(/split_pos\s*>=\s*seqovl/g, "split_pos > seqovl") },
  { id: "C10", sev: "warn", title: "blob берётся без optional-защиты",
    re: /data\s*=\s*blob\(desync,\s*desync\.arg\.blob\)/, guard: t => !/blob_exist/.test(t),
    why: "blob() бросает ошибку, если блоба нет. Штатно — через blob_exist + optional.",
    fix: t => t.replace(/([ \t]*)data\s*=\s*blob\(desync,\s*desync\.arg\.blob\)/g, (m, i) =>
      i + "if desync.arg.optional and not blob_exist(desync, desync.arg.blob) then return VERDICT_PASS end\n" + i + "data = blob_or_def(desync, desync.arg.blob)") }
];

let _known = null;
function KNOWN_SET() {
  if (_known) return _known;
  _known = new Set(["fake","multisplit","multidisorder","fakedsplit","fakeddisorder","hostfakesplit","tcpseg","oob",
    "syndata","udplen","dht_dn","http_hostcase","http_domcase","http_methodeol","tls_client_hello_clone","wsize","wssize",
    "drop","send","pktmod","outline_random_split","fake_ip_misdirection"]);
  return _known;
}

export function alternatives(ops, ctx, issues) {
  const list = issues || [], out = [], seen = new Set();
  const add = (label, o, args, why, tag, extraCtx) => {
    const key = o.slice().sort().join() + "|" + (args || "");
    if (seen.has(key) || !o.length) return;
    seen.add(key);
    let build = null, chk = null;
    try { build = synthesize(o, { ...ctx, ...(extraCtx || {}) }, ctx.name || "my_ai"); chk = build ? checkLua(build.code, KNOWN_SET()) : null; } catch { build = null; }
    out.push({ label, ops: o, args, why, tag, ctx: extraCtx, code: (build && build.code) || null, issues: (chk && chk.issues && chk.issues.length) || 0 });
  };
  list.filter(i => i.better && i.better.ops && i.better.ops.length).forEach(i =>
    add(i.better.label, Array.from(new Set(i.better.ops)), i.better.args, "исправляет " + i.id, "fix", i.better.ctx));
  const r = rungOf(ops);
  if (r > 0) add("мягче: " + LADDER[r - 1].label, LADDER[r - 1].ops, LADDER[r - 1].args,
    "меньше трафика (x" + LADDER[r - 1].traffic + " против x" + LADDER[r].traffic + ")", "softer");
  if (r >= 0 && r < LADDER.length - 1) add("сильнее: " + LADDER[r + 1].label, LADDER[r + 1].ops, LADDER[r + 1].args,
    "если текущая ступень не проходит на доменах", "stronger");
  if (r < 0) add("базовый разрез", LADDER[0].ops, LADDER[0].args, "самая дешёвая рабочая отправная точка", "softer");
  return out.slice(0, 5);
}

export function review(arg) {
  const ops = arg.ops || [], ctx = arg.ctx || {}, params = arg.params || {}, code = arg.code || "";
  const strict = arg.strict === undefined ? 1 : arg.strict;
  const issues = [];
  ANTI.forEach(r => {
    let hit = false;
    try { hit = r.when(ops, ctx, params); } catch { hit = false; }
    if (!hit) return;
    if (strict < 1 && r.sev === "info") return;
    if (strict < 0.5 && r.sev === "warn") return;
    issues.push({ id: r.id, sev: r.sev, kind: "замысел", title: r.why.split(".")[0], why: r.why, better: r.better });
  });
  if (code.trim()) CODE_RULES.forEach(r => {
    if (!r.re.test(code)) return;
    if (r.guard && !r.guard(code)) return;
    if (strict < 1 && r.sev === "info") return;
    issues.push({ id: r.id, sev: r.sev, kind: "код", title: r.title, why: r.why, fixable: true });
  });
  let verdict = { verdict: "ok", blocking: [], items: [] };
  try { verdict = assess(ops, ctx); } catch { /* assess недоступен */ }
  if (verdict.verdict === "no") (verdict.blocking || []).forEach(b => issues.push({
    id: "V00", sev: "crit", kind: "реализуемость",
    title: typeof b === "string" ? b : (b.op ? "приём " + b.op + " нереализуем" : "нереализуемо"),
    why: typeof b === "string" ? b : (b.why || "Операция не поддерживается движком в этом контексте."),
    better: { ops: ops.filter(o => o !== b.op), label: "убрать нереализуемый приём", args: "" } }));
  const health = clamp(100 - issues.reduce((s, i) => s + SEV_W[i.sev], 0), 0, 100);
  return { issues, health, verdict, rung: rungOf(ops), alternatives: alternatives(ops, ctx, issues) };
}

export function repair(code, strict) {
  const st = strict === undefined ? 1 : strict;
  const applied = []; let text = code;
  CODE_RULES.forEach(r => {
    if (!r.re.test(text)) return;
    if (r.guard && !r.guard(text)) return;
    if (st < 1 && r.sev === "info") return;
    const next = r.fix(text);
    if (next !== text) { text = next; applied.push({ id: r.id, title: r.title, sev: r.sev }); }
  });
  let luaApplied = [];
  try {
    const r = fixLua(text, null, KNOWN_SET());
    const fixed = (r && (r.text || r.fixed || r.code || r.result)) || null;
    if (typeof fixed === "string" && fixed !== text) { text = fixed; luaApplied = r.applied || []; }
  } catch { /* fixLua недоступен */ }
  let issues = [];
  try { issues = checkLua(text, KNOWN_SET()).issues || []; } catch { /* ignore */ }
  return { text, applied, luaApplied, changed: text !== code, issues };
}
