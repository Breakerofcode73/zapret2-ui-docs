const STD = new Set(("print pairs ipairs type tostring tonumber pcall xpcall error assert select next unpack " +
  "setmetatable getmetatable rawget rawset require load loadstring dofile collectgarbage string table math os io bit bit32 _G").split(" "));
// ключевые слова Lua — не функции, даже если за ними идёт скобка
const KEYWORDS = new Set(("not and or if then else elseif end do while for in repeat until return function local break goto nil true false").split(" "));
const EXTRA = new Set(("desync_opts rawsend_opts rawsend_opts_base reconstruct_opts ipfrag_opts tls_mod_shim hexdump_dlog " +
  "blob_or_def blob_exist zero_based_pos delete_pos_1 pos_array_normalize pos_normalize multidisorder_send " +
  "desync_timer_name direction_cutoff_opposite cutoff_shim_check apply_arg_prefix apply_execution_plan " +
  "verdict_aggregate plan_instance_execute plan_instance_pop plan_clear replay_execution_plan " +
  "automate_conn_record automate_host_record standard_hostkey automate_failure_check in_list array_field_search " +
  "http_dissect_req http_reconstruct_req tls_client_hello_mod wsize_rewrite find_tcp_options genhost host_ip " +
  "dissect_url dissect_nld packet_len ip6hdr ipfrag2 dis_reverse logical_xor find_next_line hex pattern").split(" "));
const RECON_OK = new Set(["badsum"]);

function maskLines(lines) {
  let long = null;
  return lines.map(line => {
    const a = line.split("");
    const blank = (f, t) => { for (let k = f; k < t && k < a.length; k++) a[k] = " "; };
    let i = 0;
    while (i < line.length) {
      if (long !== null) {
        const close = "]" + "=".repeat(long) + "]", k = line.indexOf(close, i);
        if (k < 0) { blank(i, line.length); return a.join(""); }
        blank(i, k + close.length); i = k + close.length; long = null; continue;
      }
      if (line[i] === "-" && line[i + 1] === "-") {
        const m = line.slice(i + 2).match(/^\[(=*)\[/);
        if (m) {
          const lvl = m[1].length, close = "]" + "=".repeat(lvl) + "]", k = line.indexOf(close, i + 2 + m[0].length);
          if (k < 0) { long = lvl; blank(i, line.length); return a.join(""); }
          blank(i, k + close.length); i = k + close.length; continue;
        }
        blank(i, line.length); return a.join("");
      }
      if (line[i] === "[") {
        const m = line.slice(i).match(/^\[(=*)\[/);
        if (m) {
          const lvl = m[1].length, close = "]" + "=".repeat(lvl) + "]", k = line.indexOf(close, i + m[0].length);
          if (k < 0) { long = lvl; blank(i, line.length); return a.join(""); }
          blank(i, k + close.length); i = k + close.length; continue;
        }
      }
      if (line[i] === '"' || line[i] === "'") {
        const q = line[i]; let j = i + 1;
        while (j < line.length) { if (line[j] === "\\") { j += 2; continue; } if (line[j] === q) { j++; break; } j++; }
        blank(i, j); i = j; continue;
      }
      i++;
    }
    return a.join("");
  });
}
const delta = s => { let d = 0; for (const m of s.matchAll(/\b(function|if|repeat|do|end|until)\b/g)) d += (m[1] === "end" || m[1] === "until") ? -1 : 1; return d; };
function blockEnd(masked, start) { let d = 0; for (let i = start; i < masked.length; i++) { d += delta(masked[i]); if (d <= 0) return i; } return masked.length - 1; }

export function checkLua(text, known = new Set()) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  const masked = maskLines(lines);
  const add = (id, level, i, msg, fix) => issues.push({ id, level, line: i + 1, msg, fix });
  const KNOWN = new Set([...STD, ...EXTRA, ...known]);
  const defined = new Set();
  for (const m of text.matchAll(/function\s+([A-Za-z_][\w.:]*)/g)) defined.add(m[1].split(/[.:]/)[0]);
  for (const m of text.matchAll(/local\s+([A-Za-z_][\w\s,]*)=/g)) m[1].split(",").forEach(s => defined.add(s.trim()));
  for (const m of text.matchAll(/function\s+[A-Za-z_][\w.:]*\s*\(([^)]*)\)/g)) m[1].split(",").forEach(s => defined.add(s.trim()));
  for (const m of text.matchAll(/for\s+([A-Za-z_][\w\s,]*?)\s*(?:=|in)/g)) m[1].split(",").forEach(s => defined.add(s.trim()));

  let depth = 0, firstNeg = null;
  masked.forEach((l, i) => { depth += delta(l); if (depth < 0 && firstNeg === null) firstNeg = i; });
  if (firstNeg !== null) add("L001", "crit", firstNeg, "Лишний end/until — блоки не сбалансированы.", "Убери закрывающий оператор или добавь открывающий.");
  else if (depth !== 0) add("L001", "crit", lines.length - 1, `Не закрыто блоков: ${depth}.`, "Добавь недостающие end.");

  const desyncFns = [...text.matchAll(/^\s*(local\s+)?function\s+([A-Za-z_]\w*)\s*\(\s*ctx\s*,\s*desync\s*\)/gm)];
  const anyFn = /\bfunction\b/.test(masked.join("\n"));
  if (anyFn && !desyncFns.length) add("L002", "warn", 0, "Нет глобальной функции f(ctx, desync).", "Инстансом --lua-desync вызывается только глобальная функция с такой сигнатурой. Если это файл хелперов — замечание не применимо.");
  desyncFns.filter(m => m[1]).forEach(m => add("L003", "warn", lines.findIndex(l => l.includes(m[0])), `local function ${m[2]}(ctx, desync) не видна из --lua-desync.`, "Убери local."));

  lines.forEach((l, i) => {
    for (const m of l.matchAll(/\.reconstruct\.(\w+)\s*=/g))
      if (!RECON_OK.has(m[1])) add("L004", "crit", i, `reconstruct.${m[1]} не существует — поле будет проигнорировано.`,
        m[1] === "ip_id" ? "apply_ip_id(desync, dis, nil, 'rnd')." :
        ["ip_ttl", "ip6_ttl", "tcp_seq", "tcp_ack", "tcp_ts", "tcp_md5"].includes(m[1]) ? "Это fooling: apply_fooling(desync, dis)." :
        "Адрес меняется в диссекте: dis.ip.ip_dst = pton('...'). В reconstruct есть только badsum.");
    const seq = l.match(/\.th_(seq|ack)\s*=\s*(.+)$/);
    if (seq && /[+\-]/.test(seq[2]) && !/u32add/.test(seq[2])) add("L008", "crit", i, `Арифметика th_${seq[1]} без u32add.`, `u32add(x, N) — сложение по модулю 2^32.`);
    if (/\.ip6?_(dst|src)\s*=\s*["']/.test(l)) add("L009", "crit", i, "IP-адрес присваивается строкой.", "Поле адреса — blob: pton('192.0.2.1').");
    for (const m of l.matchAll(/desync\.arg\.(\w+)\s*(?:>=|<=|>|<|\+|-|\*|\/)/g))
      add("L006", "warn", i, `desync.arg.${m[1]} используется как число, но это строка.`, `tonumber(desync.arg.${m[1]})`);
    if (/math\.\w+\(\s*desync\.arg\./.test(l)) add("L006", "warn", i, "math.* от строкового аргумента.", "Оберни в tonumber().");
    if (/math\.random\(\s*\d+\s*,\s*(0x[0-9a-fA-F]{8,}|\d{10,})/.test(l)) add("L007", "warn", i, "math.random с диапазоном > 2^31 непортируем в LuaJIT.", "u32(brandom(4)).");
    if (/return\s+[012]\s*(--.*)?$/.test(l)) add("L017", "warn", i, "Вердикт числом.", "Используй VERDICT_PASS / VERDICT_MODIFY / VERDICT_DROP.");
    if (/rawsend_dissect\s*\([^)]*,[^)]*,/.test(l)) add("L024", "warn", i, "rawsend_dissect с 3+ аргументами — сигнатуру нужно сверить.", "rawsend_dissect_ipfrag(dis, desync_opts(desync)).");
    if (/>=\s*seqovl\b/.test(l)) add("L020", "warn", i, "seqovl допускается равным точке реза.", "if seqovl >= split_pos then seqovl = 0 end.");
  });

  masked.forEach((l, i) => {
    if (/if\s+not\s+replay_first/.test(l)) {
      const end = blockEnd(masked, i);
      if (/replay_drop_set/.test(lines.slice(i, end + 1).join("\n")))
        add("L011", "crit", i, "replay_drop_set на поздних частях replay.", "На поздних частях только проверка replay_drop.");
    }
    if (/if\s+not\s+desync\.dis\.(tcp|udp)\s+then/.test(l)) {
      const win = lines.slice(i, i + 4).join("\n");
      if (/instance_cutoff_shim/.test(win) && !/icmp/.test(win)) add("L013", "warn", i, "cutoff на не-TCP без оговорки про icmp.", "if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end");
    }
  });

  const hasSend = /rawsend_/.test(text);
  if (hasSend && !/replay_first/.test(text)) add("L010", "warn", 0, "Отправка без защиты replay.", "if not replay_first(desync) then ... end");
  if (hasSend && !/instance_cutoff/.test(text)) add("L012", "info", 0, "Нет instance cutoff.", "Одноразовая функция без cutoff вызывается на каждом пакете потока.");
  if (hasSend && !/direction_check/.test(text)) add("L021", "info", 0, "Нет direction_check.", "Стандартный аргумент dir не будет работать.");
  if (hasSend && !/payload_check/.test(text)) add("L021", "info", 0, "Нет payload_check.", "Стандартный аргумент payload не будет работать.");
  if (/blob\(\s*desync\s*,\s*desync\.arg\.blob\s*\)/.test(text) && !/blob_exist|blob_or_def|arg\.optional/.test(text))
    add("L014", "warn", 0, "blob() без optional/blob_exist.", "Нет блоба → error. Добавь optional и blob_exist.");
  if (/0x16/.test(text) && /0x03/.test(text) && !/l7payload\s*==\s*["']tls_client_hello/.test(text))
    add("L019", "warn", 0, "TLS-логика без гейта по l7payload.", "Добавь desync.l7payload == 'tls_client_hello'.");
  if (/if\s+desync\.reasm_data/.test(text) && /elseif\s+desync\.arg\.blob/.test(text))
    add("L022", "info", 0, "reasm_data приоритетнее блоба из аргумента.", "Эталон: blob_or_def → reasm_data → payload.");
  const bare = lines.map((l, i) => [l, i]).filter(([l]) => /\bDLOG\s*\(/.test(l) && !/b_debug/.test(l));
  if (bare.length > 3) add("L015", "info", bare[0][1], `DLOG без гейта b_debug: ${bare.length} строк.`, "if b_debug then DLOG(...) end");

  // неизвестные вызовы: пропускаем ключевые слова (not/and/...) и методы через . или :
  const unknown = new Map();
  masked.forEach((l, i) => {
    for (const m of l.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
      const n = m[1];
      const prev = m.index > 0 ? l[m.index - 1] : "";
      if (prev === "." || prev === ":") continue;
      if (KEYWORDS.has(n) || KNOWN.has(n) || defined.has(n)) continue;
      if (!unknown.has(n)) unknown.set(n, i);
    }
  });
  for (const [n, i] of unknown) add("L016", "info", i, `Вызов ${n}() не найден в известном API zapret2/Lua.`, "Проверь имя по справочнику; опечатка = попытка вызвать nil.");

  const order = { crit: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line);
  return { issues, functions: desyncFns.filter(m => !m[1]).map(m => m[2]), lines: lines.length };
}