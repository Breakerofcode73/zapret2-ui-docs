import { OPS } from "./intent";
import { loadVault } from "./vault";
import { docLua } from "./luadoc";
import { fns as capi } from "../pages/CApi";
import { fns as lib } from "../pages/Lib";
import { fns as antidpi } from "../pages/Antidpi";
import { fns as auto } from "../pages/Auto";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));

// какие операции покрывает штатная стратегия
const STRAT = {
  fake: ["fake", "ttl", "badsum", "md5", "ipid", "repeat", "ts"],
  syndata: ["fake", "ttl", "badsum", "md5"],
  rst: ["fake", "ttl", "badsum", "md5", "repeat"],
  send: ["dup", "ttl", "badsum", "md5", "repeat", "ts", "ipid"],
  pktmod: ["ts", "ipid", "ttl"],
  drop: ["drop"],
  multisplit: ["split", "seqovl", "pos", "repeat"],
  multidisorder: ["disorder", "seqovl", "pos"],
  multidisorder_legacy: ["disorder", "seqovl", "pos"],
  fakedsplit: ["fake", "split", "seqovl", "ttl", "badsum", "md5", "pos"],
  fakeddisorder: ["fake", "disorder", "seqovl", "ttl", "badsum", "md5", "pos"],
  hostfakesplit: ["fake", "host", "split", "pos", "ttl", "ts", "ipid", "repeat"],
  tcpseg: ["split", "seqovl", "pos"],
  oob: ["oob"],
  udplen: ["pad"],
  dht_dn: ["pad"],
  wsize: ["ipid"], wssize: ["ipid"],
  synack: ["fake"], synack_split: ["fake"],
  tls_client_hello_clone: ["fake", "host"],
  http_domcase: ["host"], http_hostcase: ["host"], http_methodeol: ["host"], http_unixeol: ["host"]
};

export function matchStrategies(ops, ctx) {
  if (!ops.length) return [];
  const want = new Set(ops);
  const rows = [];
  for (const [name, provides] of Object.entries(STRAT)) {
    const p = new Set(provides);
    const covered = [...want].filter(o => p.has(o));
    if (!covered.length) continue;
    const missing = [...want].filter(o => !p.has(o));
    const extra = provides.filter(o => !want.has(o) && ["fake", "split", "disorder", "drop", "oob", "pad"].includes(o));
    const score = covered.length / want.size - extra.length * 0.12;
    rows.push({ name, source: "antidpi", covered, missing, extra, score, provides });
  }
  const docs = loadVault().map(i => docLua(i.text, i.file, KNOWN));
  docs.forEach(d => d.funcs.filter(f => f.isDesync && !f.local).forEach(f => {
    const provides = [];
    if (f.kind === "fake") provides.push("fake", "ttl", "badsum", "ipdst", "ipid", "repeat", "ts");
    if (f.kind === "split") provides.push("split", "seqovl", "pos", "random");
    if (f.kind === "disorder") provides.push("disorder", "seqovl", "pos");
    if (f.kind === "dup") provides.push("dup", "repeat", "ttl", "badsum");
    if (f.kind === "modify") provides.push("ts", "ttl", "ipid");
    if (f.kind === "drop") provides.push("drop");
    if (f.sends && /\.ip6?_dst/.test(f.body)) provides.push("ipdst");
    if (/bxor|string\.char\(255\)/.test(f.body)) provides.push("invert");
    const p = new Set(provides);
    const covered = [...want].filter(o => p.has(o));
    if (!covered.length) return;
    rows.push({ name: f.name, source: d.file, covered, missing: [...want].filter(o => !p.has(o)), extra: [], score: covered.length / want.size + 0.05, provides: [...p] });
  }));
  return rows.sort((a, b) => b.score - a.score).slice(0, 6);
}

const q = s => String(s).replace(/[^\w]/g, "");

export function synthesize(ops, ctx, name) {
  const nm = q(name || "my_idea") || "my_idea";
  const has = o => ops.includes(o);
  const L = [];
  const push = (...s) => L.push(...s);
  const split = has("split") || has("disorder");
  const fakePhase = has("fake") || has("ipdst") || has("invert") || has("reverse") || (has("ttl") && !has("dup"));
  const transport = split || has("oob") || has("md5") ? "tcp" : has("pad") ? "udp" : ctx.transport;

  push(`-- ${nm}.lua — собрано из замысла: ${ops.map(o => OPS[o]?.label || o).join(", ")}`,
    `-- подключение: --lua-init=@zapret-lib.lua --lua-init=@zapret-antidpi.lua --lua-init=@${nm}.lua`, "");
  push(`function ${nm}(ctx, desync)`);
  if (transport === "tcp") push("    if not desync.dis.tcp then", "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end", "        return", "    end");
  else if (transport === "udp") push("    if not desync.dis.udp then", "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end", "        return", "    end");
  else push("    if not (desync.dis.tcp or desync.dis.udp) then", "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end", "        return", "    end");
  push("    direction_cutoff_opposite(ctx, desync)",
    "    if not direction_check(desync) then return end",
    "    if not payload_check(desync) then return end");

  if (has("drop") && !fakePhase && !split && !has("dup")) {
    push("", "    if not replay_first(desync) then return end", `    DLOG("${nm}: drop")`, "    instance_cutoff_shim(ctx, desync)", "    return VERDICT_DROP", "end");
    return finish(L, nm, ops, ctx);
  }

  push("", "    local data = blob_or_def(desync, desync.arg.blob) or desync.reasm_data or desync.dis.payload",
    "    if not data or #data == 0 then return end",
    "", "    if not replay_first(desync) then",
    "        if replay_drop(desync) then return VERDICT_DROP end", "        return", "    end");

  if (fakePhase) {
    push("", "    -- приманка: копия, оригинал не трогаем", "    local dis = deepcopy(desync.dis)",
      `    dis.payload = blob(desync, desync.arg.blob or "${ctx.blob || "fake_default_tls"}")`);
    if (has("invert")) push("    dis.payload = bxor(dis.payload, string.rep(string.char(255), #dis.payload))");
    if (has("reverse")) push("    dis.payload = string.reverse(dis.payload)");
    if (has("ipdst")) push("", `    local dst = desync.arg.ip_dst or "${ctx.ipdst || "192.0.2.1"}"`,
      "    if dis.ip then dis.ip.ip_dst = pton(dst)", "    elseif dis.ip6 then dis.ip6.ip6_dst = pton(dst) end");
    if (has("ttl")) push("", "    local ttl = tonumber(desync.arg.ip_ttl) or " + (ctx.ttl || 4),
      "    if dis.ip then dis.ip.ip_ttl = ttl", "    elseif dis.ip6 then dis.ip6.ip6_hlim = ttl end");
    push("    apply_fooling(desync, dis)");
    if (has("ipid")) push('    apply_ip_id(desync, dis, nil, "rnd")');
    push("    local opts = desync_opts(desync)");
    if (has("badsum") || !has("ttl")) push("    opts.reconstruct.badsum = true");
    if (has("repeat")) push("    opts.rawsend.repeats = tonumber(desync.arg.repeats) or 2");
    push(`    if b_debug then DLOG("${nm}: fake len=" .. #dis.payload) end`,
      "    rawsend_dissect_ipfrag(dis, opts)");
  }

  if (has("dup") && !fakePhase) {
    push("", "    -- дубль пакета", "    local dis = deepcopy(desync.dis)", "    apply_fooling(desync, dis)",
      '    apply_ip_id(desync, dis, nil, "none")', "    rawsend_dissect_ipfrag(dis, desync_opts(desync))");
  }

  if (has("pad")) {
    push("", "    -- изменение длины UDP", "    local inc = tonumber(desync.arg.increment) or 2",
      '    local pat = blob(desync, desync.arg.pattern or "0x00")',
      "    if inc > 0 then desync.dis.payload = desync.dis.payload .. pattern(pat, 1, inc)",
      "    elseif inc < 0 and (#desync.dis.payload + inc) >= 1 then",
      "        desync.dis.payload = string.sub(desync.dis.payload, 1, #desync.dis.payload + inc) end",
      "    return VERDICT_MODIFY", "end");
    return finish(L, nm, ops, ctx);
  }

  if (split) {
    const rev = has("disorder");
    push("", "    -- разрез", `    local spos = desync.arg.pos or "${ctx.pos || "1,host,midsld+1"}"`,
      "    local pos = resolve_multi_pos(data, desync.l7payload, spos)", "    delete_pos_1(pos)",
      "    if #pos == 0 then return end");
    if (has("random")) push("", "    local ok, r = pcall(resolve_range, data, desync.l7payload, \"host,endhost-1\", true)",
      "    if ok and r and r[1] and r[2] and r[2] > r[1] and r[2] <= #data then",
      "        pos = { math.random(r[1], r[2] - 1) }", "    end");
    push(`    local seqovl = tonumber(desync.arg.seqovl) or ${has("seqovl") ? (ctx.seqovl || 5) : 0}`,
      "    if seqovl < 0 then seqovl = 0 end",
      "    if seqovl >= (pos[1] or #data) then seqovl = 0 end",
      '    local pat = blob(desync, desync.arg.seqovl_pattern or "0x00")',
      "", rev ? "    for i = #pos, 0, -1 do" : "    for i = 0, #pos do",
      "        local a = pos[i] or 1", "        local b = (i < #pos) and (pos[i + 1] - 1) or #data",
      "        local part = string.sub(data, a, b)", "        local off = a - 1",
      `        if i == ${rev ? 1 : 0} and seqovl > 0 then`,
      "            part = pattern(pat, 1, seqovl) .. part", "            off = off - seqovl", "        end",
      `        if b_debug then DLOG("${nm}: part off=" .. off .. " len=" .. #part) end`,
      "        if not rawsend_payload_segmented(desync, part, off) then return VERDICT_PASS end", "    end",
      "", "    replay_drop_set(desync)");
    if (!fakePhase) push("    instance_cutoff_shim(ctx, desync)");
    push("    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP", "end");
    return finish(L, nm, ops, ctx);
  }

  if (has("ts") && !fakePhase && !has("dup")) {
    push("", "    -- правка оригинала", "    apply_fooling(desync)", "    return VERDICT_MODIFY", "end");
    return finish(L, nm, ops, ctx);
  }

  push("", "    instance_cutoff_shim(ctx, desync)", "    return VERDICT_PASS", "end");
  return finish(L, nm, ops, ctx);
}

function finish(L, name, ops, ctx) {
  const code = L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  const args = [];
  const has = o => ops.includes(o);
  if (has("fake") || has("invert") || has("reverse")) args.push(`blob=${ctx.blob || "fake_default_tls"}`);
  if (has("ipdst")) args.push(`ip_dst=${ctx.ipdst || "192.0.2.1"}`);
  if (has("ttl")) args.push(`ip_ttl=${ctx.ttl || 4}`);
  if (has("badsum")) args.push("badsum");
  if (has("md5")) args.push("tcp_md5");
  if (has("ts")) args.push("tcp_ts=-600000");
  if (has("repeat")) args.push("repeats=2");
  if (has("split") || has("disorder")) args.push(`pos=${ctx.pos || "1,host,midsld+1"}`);
  if (has("seqovl")) args.push(`seqovl=${ctx.seqovl || 5}`);
  if (has("pad")) args.push("increment=2");
  const payload = ctx.transport === "udp" ? "quic_initial" : "tls_client_hello";
  return { name, code, cli: `--payload=${payload} --lua-desync=${name}${args.length ? ":" + args.join(":") : ""}`,
    init: `--lua-init=@"%~dp0lua\\${name}.lua"` };
}