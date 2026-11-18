import { checkLua } from "./checkLua";
import { diffLines, hunks } from "./diff";
import { FIX_WHY } from "../data/fixWhy";

const indentOf = l => (l.match(/^\s*/) || [""])[0];

function fixReconstruct(code) {
  const lines = code.split("\n");
  const moved = [], keep = [];
  for (const l of lines) {
    const m = l.match(/(\w+)\.reconstruct\.(\w+)\s*=\s*(.+?)\s*$/);
    if (m && m[2] !== "badsum") { moved.push([m[2], m[3]]); continue; }
    keep.push(l);
  }
  if (!moved.length) return { code, changed: false };
  const di = keep.findIndex(l => /local\s+(\w+)\s*=\s*deepcopy\(/.test(l));
  if (di < 0) return { code, changed: false, manual: "Нет deepcopy — некуда перенести искажения. Создай копию диссекта вручную." };
  const v = keep[di].match(/local\s+(\w+)\s*=\s*deepcopy\(/)[1];
  const ins = [];
  for (const [field, val] of moved) {
    if (field === "ip_ttl") ins.push(`    if ${v}.ip then ${v}.ip.ip_ttl = ${val} elseif ${v}.ip6 then ${v}.ip6.ip6_hlim = ${val} end`);
    else if (field === "ip6_ttl") ins.push(`    if ${v}.ip6 then ${v}.ip6.ip6_hlim = ${val} end`);
    else if (field === "ip_dst") ins.push(`    if ${v}.ip then ${v}.ip.ip_dst = pton(${val}) elseif ${v}.ip6 then ${v}.ip6.ip6_dst = pton(${val}) end`);
    else if (field === "ip_src") ins.push(`    if ${v}.ip then ${v}.ip.ip_src = pton(${val}) end`);
    else if (field === "tcp_seq") ins.push(`    if ${v}.tcp then ${v}.tcp.th_seq = u32add(${v}.tcp.th_seq, ${val}) end`);
    else if (field === "tcp_ack") ins.push(`    if ${v}.tcp then ${v}.tcp.th_ack = u32add(${v}.tcp.th_ack, ${val}) end`);
    else if (field === "ip_id") ins.push(`    apply_ip_id(desync, ${v}, nil, ${val})`);
    else ins.push(`    apply_fooling(desync, ${v})   -- ${field}: используй стандартный аргумент ${field}`);
  }
  keep.splice(di + 1, 0, "    -- искажения перенесены из reconstruct в поля диссекта/хелперы", ...ins);
  return { code: keep.join("\n"), changed: true };
}

function fixSeqArith(code) {
  let changed = false;
  const out = code.split("\n").map(l => {
    const m = l.match(/^(\s*)(.*?)(\.th_(seq|ack))\s*=\s*(.+)$/);
    if (!m) return l;
    const [, ind, pre, field, , rhs] = m;
    if (/u32add/.test(rhs)) return l;
    const ar = rhs.match(/^(.+?)\s*([+\-])\s*(\d+)\s*$/);
    if (!ar) return l;
    changed = true;
    return `${ind}${pre}${field} = u32add(${ar[1].trim()}, ${ar[2] === "-" ? "-" + ar[3] : ar[3]})`;
  }).join("\n");
  return { code: out, changed };
}

function fixIpString(code) {
  let changed = false;
  const out = code.replace(/(\.ip6?_(?:dst|src)\s*=\s*)("[^"]*"|'[^']*')/g,
    (m, a, b) => { changed = true; return `${a}pton(${b})`; });
  return { code: out, changed };
}

function fixRandom(code) {
  let changed = false;
  const out = code.replace(/math\.random\(\s*0\s*,\s*(?:0x[Ff]{8}|4294967295)\s*\)/g,
    () => { changed = true; return "u32(brandom(4))"; });
  return { code: out, changed };
}

function fixReplaySet(code) {
  const lines = code.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (!/if\s+not\s+replay_first/.test(lines[i])) continue;
    let d = 0, end = i;
    for (let j = i; j < lines.length; j++) {
      for (const m of lines[j].matchAll(/\b(function|if|repeat|do|end|until)\b/g)) d += (m[1] === "end" || m[1] === "until") ? -1 : 1;
      end = j; if (d <= 0) break;
    }
    for (let j = i; j <= end; j++) {
      const m = lines[j].match(/^(\s*)replay_drop_set\((\w+)\)\s*$/);
      if (m) { lines[j] = `${m[1]}if replay_drop(${m[2]}) then return VERDICT_DROP end`; changed = true; }
    }
    i = end;
  }
  return { code: lines.join("\n"), changed };
}

function fixSeqovlEq(code) {
  let changed = false;
  const out = code.replace(/if\s+seqovl\s*>\s*0\s+and\s+split_pos\s*>=\s*seqovl\s+then/g,
    () => { changed = true; return "if seqovl > 0 and seqovl < split_pos then"; });
  return { code: out, changed };
}

function fixRawsendDissect(code) {
  let changed = false;
  const out = code.replace(/rawsend_dissect\(\s*(\w+)\s*,\s*([\w.]+)\s*,\s*([\w.]+)\s*\)/g,
    (m, dis) => { changed = true; return `rawsend_dissect_ipfrag(${dis}, desync_opts(desync))`; });
  return { code: out, changed };
}

function fixFilters(code) {
  if (!/rawsend_/.test(code)) return { code, changed: false };
  const lines = code.split("\n");
  const ins = [];
  if (!/direction_check/.test(code)) ins.push("    if not direction_check(desync) then return end");
  if (!/payload_check/.test(code)) ins.push("    if not payload_check(desync) then return end");
  if (!ins.length) return { code, changed: false };
  let at = lines.findIndex(l => /direction_cutoff_opposite/.test(l));
  if (at < 0) at = lines.findIndex(l => /^function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)/.test(l));
  if (at < 0) return { code, changed: false };
  lines.splice(at + 1, 0, ...ins);
  return { code: lines.join("\n"), changed: true };
}

function fixIcmp(code) {
  const lines = code.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/if\s+not\s+desync\.dis\.(tcp|udp)\s+then\s*$/.test(lines[i]) && /instance_cutoff_shim/.test(lines[i + 1]) && !/icmp/.test(lines[i + 1])) {
      lines[i + 1] = `${indentOf(lines[i + 1])}if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end`;
      changed = true;
    }
  }
  return { code: lines.join("\n"), changed };
}

function fixDebugGate(code) {
  const lines = code.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (!/\bDLOG\s*\(/.test(lines[i]) || /b_debug/.test(lines[i])) continue;
    if (i > 0 && /b_debug/.test(lines[i - 1])) continue;
    lines[i] = `${indentOf(lines[i])}if b_debug then ${lines[i].trim()} end`;
    changed = true;
  }
  return { code: lines.join("\n"), changed };
}

function fixTlsGate(code) {
  if (!/0x16/.test(code) || !/0x03/.test(code)) return { code, changed: false };
  if (/l7payload\s*==\s*["']tls_client_hello/.test(code)) return { code, changed: false };
  let changed = false;
  const out = code.replace(/if\s+not\s+(is_complete_client_hello|tls_record_complete)\((\w+)\)\s+then/g, (m, fn, d) => {
    changed = true; return `if desync.l7payload == "tls_client_hello" and not ${fn}(${d}) then`;
  });
  return { code: out, changed, manual: changed ? null : "TLS-логика без гейта: добавь desync.l7payload == 'tls_client_hello' вручную." };
}

function fixArgNumber(code) {
  let changed = false;
  const out = code.replace(/desync\.arg\.(\w+)(\s*(?:>=|<=|>|<|\+|-|\*|\/))/g,
    (m, n, op) => { changed = true; return `(tonumber(desync.arg.${n}) or 0)${op}`; });
  return { code: out, changed };
}

function fixDataOrder(code) {
  if (!/if\s+desync\.reasm_data/.test(code) || !/elseif\s+desync\.arg\.blob/.test(code)) return { code, changed: false };
  const re = /local\s+data\s*\n\s*if\s+desync\.reasm_data[\s\S]*?else\s*\n\s*data\s*=\s*desync\.dis\.payload\s*\n\s*end/;
  if (!re.test(code)) return { code, changed: false, manual: "Порядок источника данных нестандартный — перепиши на blob_or_def → reasm → payload вручную." };
  return { code: code.replace(re, "local data = blob_or_def(desync, desync.arg.blob) or desync.reasm_data or desync.dis.payload"), changed: true };
}

function fixReplayGuard(code) {
  if (!/rawsend_/.test(code) || /replay_first/.test(code)) return { code, changed: false };
  const lines = code.split("\n");
  const at = lines.findIndex(l => /^function\s+\w+\s*\(\s*ctx\s*,\s*desync\s*\)/.test(l));
  if (at < 0) return { code, changed: false };
  let ins = at + 1;
  while (ins < lines.length && /^\s*(--|if not desync\.dis|direction_|if not direction_check|if not payload_check|end\s*$)/.test(lines[ins])) ins++;
  lines.splice(ins, 0,
    "    -- защита многопакетного пейлоада",
    "    if not replay_first(desync) then",
    "        if replay_drop(desync) then return VERDICT_DROP end",
    "        return",
    "    end");
  return { code: lines.join("\n"), changed: true };
}

function fixLocalDesync(code) {
  let changed = false;
  const out = code.replace(/^([ \t]*)local\s+(function\s+[A-Za-z_]\w*\s*\(\s*ctx\s*,\s*desync\s*\))/gm,
    (m, ind, fn) => { changed = true; return ind + fn; });
  return { code: out, changed };
}

function fixBlobOptional(code) {
  if (!/blob\(\s*desync\s*,\s*desync\.arg\.blob\s*\)/.test(code)) return { code, changed: false };
  if (/blob_exist|arg\.optional/.test(code)) return { code, changed: false };
  const lines = code.split("\n");
  const at = lines.findIndex(l => /blob\(\s*desync\s*,\s*desync\.arg\.blob\s*\)/.test(l));
  if (at < 0) return { code, changed: false };
  const ind = indentOf(lines[at]);
  lines.splice(at, 0,
    ind + "if desync.arg.optional and desync.arg.blob and not blob_exist(desync, desync.arg.blob) then",
    ind + "    return",
    ind + "end");
  return { code: lines.join("\n"), changed: true };
}

function fixCutoff(code) {
  if (!/rawsend_/.test(code) || /instance_cutoff/.test(code)) return { code, changed: false };
  const lines = code.split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*return\s+(VERDICT_|desync\.arg\.nodrop)/.test(lines[i])) { at = i; break; }
  }
  if (at < 0) return { code, changed: false, manual: "Не найден финальный return — cutoff добавь вручную." };
  lines.splice(at, 0, indentOf(lines[at]) + "instance_cutoff_shim(ctx, desync)   -- одноразовая миссия завершена");
  return { code: lines.join("\n"), changed: true };
}

function fixBalance(code) {
  const lines = code.split("\n");
  const masked = lines.map(l => l.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--.*$/, "")
    .replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''"));
  let d = 0; const extra = new Set();
  masked.forEach((l, i) => {
    for (const m of l.matchAll(/\b(function|if|repeat|do|end|until)\b/g)) {
      d += (m[1] === "end" || m[1] === "until") ? -1 : 1;
      if (d < 0) { extra.add(i); d = 0; }
    }
  });
  if (!extra.size && d === 0) return { code, changed: false };
  const out = lines.filter((_, i) => !extra.has(i));
  for (let k = 0; k < d; k++) out.push("end");
  return { code: out.join("\n"), changed: true };
}

export const FIX_RULES = [
  { id: "R01", title: "reconstruct.* → поля диссекта и хелперы", level: "crit", run: fixReconstruct },
  { id: "R02", title: "арифметика seq/ack → u32add", level: "crit", run: fixSeqArith },
  { id: "R03", title: "IP-адрес строкой → pton()", level: "crit", run: fixIpString },
  { id: "R04", title: "math.random 2^32 → u32(brandom(4))", level: "warn", run: fixRandom },
  { id: "R05", title: "replay_drop_set на поздних частях → replay_drop", level: "crit", run: fixReplaySet },
  { id: "R06", title: "seqovl == split_pos → отмена перекрытия", level: "crit", run: fixSeqovlEq },
  { id: "R07", title: "rawsend_dissect(3 арг.) → rawsend_dissect_ipfrag", level: "warn", run: fixRawsendDissect },
  { id: "R08", title: "добавить direction_check / payload_check", level: "info", run: fixFilters },
  { id: "R09", title: "cutoff на не-TCP → оговорка про icmp", level: "warn", run: fixIcmp },
  { id: "R10", title: "DLOG → гейт b_debug", level: "info", run: fixDebugGate },
  { id: "R11", title: "TLS-ветка → гейт l7payload", level: "warn", run: fixTlsGate },
  { id: "R12", title: "аргумент как число → tonumber", level: "warn", run: fixArgNumber },
  { id: "R13", title: "порядок источника данных → блоб первым", level: "info", run: fixDataOrder },
  { id: "R14", title: "добавить защиту replay", level: "warn", run: fixReplayGuard },
  { id: "R15", title: "local function(ctx, desync) → глобальная", level: "warn", run: fixLocalDesync },
  { id: "R16", title: "blob() → guard optional + blob_exist", level: "warn", run: fixBlobOptional },
  { id: "R17", title: "добавить instance cutoff", level: "info", run: fixCutoff },
  { id: "R18", title: "баланс блоков: лишние/недостающие end", level: "crit", run: fixBalance }
];

export const RULE_FOR = {
  L001: "R18", L003: "R15", L004: "R01", L006: "R12", L007: "R04", L008: "R02", L009: "R03",
  L010: "R14", L011: "R05", L012: "R17", L013: "R09", L014: "R16",
  L015: "R10", L019: "R11", L020: "R06", L021: "R08", L022: "R13", L024: "R07"
};

export function fixLua(source, enabled = null, known = new Set()) {
  let code = source;
  const applied = new Map();
  const manual = [];
  const passes = [];
  const changes = [];
  const seen = new Set([code]);
  let cycle = false;

  for (let p = 1; ; p++) {
    const passApplied = [];
    for (const r of FIX_RULES) {
      if (enabled && !enabled.has(r.id)) continue;
      const prev = code;
      const res = r.run(code);
      if (res.changed) {
        code = res.code;
        passApplied.push(r.id);
        const a = applied.get(r.id) || { id: r.id, title: r.title, level: r.level, count: 0 };
        a.count++; applied.set(r.id, a);
        const w = FIX_WHY[r.id] || {};
        changes.push({
          rule: r.id, title: r.title, level: r.level, pass: p,
          problem: w.problem || "", action: w.action || "", why: w.why || "", refs: w.refs || [],
          hunks: hunks(diffLines(prev, code))
        });
      }
      if (res.manual && !manual.some(m => m.id === r.id)) manual.push({ id: r.id, title: r.title, note: res.manual });
    }
    passes.push({ n: p, applied: passApplied, issues: checkLua(code, known).issues.length });
    if (!passApplied.length) break;
    if (seen.has(code)) { cycle = true; break; }
    seen.add(code);
  }

  const before = checkLua(source, known).issues;
  const after = checkLua(code, known).issues;
  const uncovered = after.filter(i => !RULE_FOR[i.id]);
  const blocked = after.filter(i => { const r = RULE_FOR[i.id]; return r && (!enabled || enabled.has(r)); }).map(i => ({ ...i, rule: RULE_FOR[i.id] }));
  const disabled = after.filter(i => { const r = RULE_FOR[i.id]; return r && enabled && !enabled.has(r); }).map(i => ({ ...i, rule: RULE_FOR[i.id] }));

  return { code, applied: [...applied.values()], manual, before, after, passes, changes, cycle, uncovered, blocked, disabled };
}