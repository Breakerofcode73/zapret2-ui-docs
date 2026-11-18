const KEY = "z2vault:v2";
const OLD = "z2vault:v1";
const subs = new Set();
let cache = null;
const MAXV = 25;

const SEED = [
  { file: "fake_ip_misdirection.lua", tags: ["fake", "L3"], note: "Фейк с подменённым IPv4 dst и низким TTL. Сверить apply_fooling с третьим аргументом.",
    text: `-- fake_ip_misdirection.lua\nlocal DEFAULT_IP_DST = "192.0.2.1"\nlocal DEFAULT_IP_TTL = 1\nlocal function parse_ipv4(s)\n    if not s then return nil end\n    local a,b,c,d = s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")\n    if not a then return nil end\n    a,b,c,d = tonumber(a),tonumber(b),tonumber(c),tonumber(d)\n    if not a or a<0 or a>255 or b<0 or b>255 or c<0 or c>255 or d<0 or d>255 then return nil end\n    return bu8(a)..bu8(b)..bu8(c)..bu8(d)\nend\nfunction fake_ip_misdirection(ctx, desync)\n    if not desync.outgoing or not desync.dis.tcp then return VERDICT_PASS end\n    if #desync.dis.payload == 0 and not (desync.reasm_data and #desync.reasm_data > 0) then return VERDICT_PASS end\n    if not replay_first(desync) then return VERDICT_PASS end\n    local fake_dis = deepcopy(desync.dis)\n    if desync.reasm_data and #desync.reasm_data > 0 then fake_dis.payload = desync.reasm_data end\n    if fake_dis.ip then\n        local bin = parse_ipv4(desync.arg.ip_dst or DEFAULT_IP_DST)\n        if bin then fake_dis.ip.ip_dst = bin end\n    end\n    apply_fooling(desync, fake_dis, { ip_ttl = desync.arg.ip_ttl or DEFAULT_IP_TTL, tcp_ts = desync.arg.tcp_ts })\n    apply_ip_id(desync, fake_dis, nil, "rnd")\n    local opts = desync_opts(desync)\n    opts.reconstruct.badsum = true\n    if desync.arg.repeats then opts.rawsend.repeats = tonumber(desync.arg.repeats) end\n    rawsend_dissect(fake_dis, opts.rawsend, opts.reconstruct)\n    return VERDICT_PASS\nend` },
  { file: "random_split.lua", tags: ["split", "TLS"], note: "Случайный рез внутри SNI + fallback split=1 для неполного ClientHello.",
    text: `-- random_split.lua\nlocal function is_complete_client_hello(data)\n    if not data or #data < 6 then return false end\n    local b1, b2 = string.byte(data, 1, 2)\n    if b1 ~= 0x16 or b2 ~= 0x03 then return false end\n    local rlen = (string.byte(data, 4) or 0) * 256 + (string.byte(data, 5) or 0)\n    if rlen < 1 then return false end\n    return #data >= (5 + rlen)\nend\nlocal function find_split_pos(desync, data)\n    local len = #data\n    if len < 20 then return nil end\n    local ok, host_range = pcall(resolve_range, data, desync.l7payload, "host,endhost-1", true)\n    if ok and host_range and host_range[1] and host_range[2] and host_range[1] >= 1\n        and host_range[2] >= host_range[1] and host_range[2] <= len then\n        local sp = (host_range[2] > host_range[1]) and math.random(host_range[1], host_range[2] - 1) or host_range[1]\n        return sp\n    end\n    return math.random(math.floor(len * 0.25), math.floor(len * 0.75))\nend\nfunction outline_random_split(ctx, desync)\n    if not desync.dis.tcp then instance_cutoff_shim(ctx, desync) return end\n    direction_cutoff_opposite(ctx, desync)\n    local data\n    if desync.reasm_data and #desync.reasm_data > 0 then data = desync.reasm_data\n    elseif desync.arg.blob then data = blob(desync, desync.arg.blob)\n    else data = desync.dis.payload end\n    if not data or #data == 0 then return VERDICT_PASS end\n    if not replay_first(desync) then replay_drop_set(desync) return VERDICT_DROP end\n    if not is_complete_client_hello(data) then\n        local p1 = string.sub(data, 1, 1)\n        local p2 = string.sub(data, 2)\n        if not rawsend_payload_segmented(desync, p1, 0) then return VERDICT_PASS end\n        if not rawsend_payload_segmented(desync, p2, 1) then return VERDICT_PASS end\n        replay_drop_set(desync)\n        return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP\n    end\n    local len = #data\n    if len < 20 then return VERDICT_PASS end\n    local split_pos = find_split_pos(desync, data)\n    if not split_pos or split_pos < 1 or split_pos >= len then return VERDICT_PASS end\n    local seqovl = 0\n    if desync.arg.seqovl and tonumber(desync.arg.seqovl) > 0 then seqovl = tonumber(desync.arg.seqovl) end\n    local part1 = string.sub(data, 1, split_pos)\n    if not rawsend_payload_segmented(desync, part1, 0) then return VERDICT_PASS end\n    local part2_offset = split_pos\n    local part2 = string.sub(data, split_pos + 1)\n    if seqovl > 0 and split_pos >= seqovl then\n        part2_offset = split_pos - seqovl\n        part2 = string.sub(data, split_pos - seqovl + 1, split_pos) .. part2\n    end\n    if not rawsend_payload_segmented(desync, part2, part2_offset) then return VERDICT_PASS end\n    replay_drop_set(desync)\n    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP\nend` }
];

function persist() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} subs.forEach(f => f(cache)); }
const uid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = it => ({ ...it, versions: Array.isArray(it.versions) ? it.versions : [], tags: it.tags || [], note: it.note || "" });

export function loadVault() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { cache = null; }
  if (!Array.isArray(cache) || !cache.length) {
    try { const old = JSON.parse(localStorage.getItem(OLD) || "null"); if (Array.isArray(old) && old.length) cache = old; } catch {}
  }
  if (!Array.isArray(cache) || !cache.length) cache = SEED.map(s => ({ id: uid(), ...s, created: Date.now(), updated: Date.now() }));
  cache = cache.map(norm);
  persist();
  return cache;
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function addItem({ file, text, tags = [], note = "" }) {
  loadVault();
  const it = { id: uid(), file, text, tags, note, versions: [], created: Date.now(), updated: Date.now() };
  cache = [it, ...cache]; persist(); return it;
}
export function updateItem(id, patch) {
  loadVault();
  cache = cache.map(x => {
    if (x.id !== id) return x;
    const versions = patch.text && patch.text !== x.text
      ? [{ text: x.text, at: x.updated || Date.now(), label: "до правки" }, ...x.versions].slice(0, MAXV)
      : x.versions;
    return { ...x, ...patch, versions, updated: Date.now() };
  });
  persist();
}
export function removeItem(id) {
  loadVault();
  const index = cache.findIndex(x => x.id === id);
  if (index < 0) return null;
  const item = cache[index];
  cache = cache.filter(x => x.id !== id); persist();
  return { item, index };
}
export function restoreItem(item, index) {
  loadVault(); const arr = cache.slice(); arr.splice(Math.min(index, arr.length), 0, norm(item)); cache = arr; persist();
}
export function replaceAll(items) { cache = items.map(norm); persist(); }
export function rollback(id, vi) {
  loadVault();
  const it = cache.find(x => x.id === id);
  if (!it || !it.versions[vi]) return false;
  const target = it.versions[vi];
  updateItem(id, { text: target.text, tags: [...new Set([...(it.tags || []), "откат"])] });
  return true;
}
export function labelVersion(id, vi, label) {
  loadVault();
  cache = cache.map(x => x.id === id ? { ...x, versions: x.versions.map((v, k) => k === vi ? { ...v, label } : v) } : x);
  persist();
}
export function dropVersion(id, vi) {
  loadVault();
  cache = cache.map(x => x.id === id ? { ...x, versions: x.versions.filter((_, k) => k !== vi) } : x);
  persist();
}