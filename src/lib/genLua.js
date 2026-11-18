export const TEMPLATES = [
  { id: "fake", label: "Фейк перед оригиналом", hint: "Отправляет поддельный пейлоад, который умрёт по пути; оригинал проходит." },
  { id: "split", label: "Разрез по маркерам", hint: "Режет пейлоад в точках pos и шлёт частями по порядку." },
  { id: "disorder", label: "Разрез в обратном порядке", hint: "То же, но части уходят от последней к первой." },
  { id: "modify", label: "Искажение оригинала", hint: "Меняет поля самого пакета и возвращает MODIFY." },
  { id: "drop", label: "Дроп пакета", hint: "Запрещает пакету уйти дальше." },
  { id: "send", label: "Дубль пакета", hint: "Отправляет копию с искажениями, оригинал не трогает." },
  { id: "skeleton", label: "Пустой каркас", hint: "Все охранники и место для своей логики." }
];

export const DEFAULT_CFG = {
  name: "my_strategy", kind: "fake", transport: "tcp", dir: "out", payload: "tls_client_hello",
  cutoffOpposite: true, payloadCheck: true, replayGuard: true, cutoffDone: false, debug: true,
  blob: "fake_default_tls", optional: true, ttl: 6, badsum: true, md5: false, tlsmod: "rnd,rndsni,dupsid",
  pos: "1,host,midsld+1", seqovl: 5, pattern: "0x1603030000", nodrop: false,
  modTtl: 0, modTs: -600000, repeats: 2, delay: 0, custom: "-- своя логика здесь"
};

const q = s => String(s).replace(/[^\w]/g, "");

export function genLua(c) {
  const name = q(c.name) || "my_strategy";
  const L = [];
  const warn = [];
  const push = (...s) => L.push(...s);
  const tcpOnly = c.kind === "split" || c.kind === "disorder";
  const transport = tcpOnly ? "tcp" : c.transport;

  push(`-- ${name}.lua — сгенерировано конструктором zapret2-docs`,
    `-- подключение (порядок важен):`,
    `--   --lua-init=@zapret-lib.lua --lua-init=@zapret-antidpi.lua --lua-init=@${name}.lua`, "");
  push(`function ${name}(ctx, desync)`);

  if (transport === "tcp") {
    push("    -- 1. транспорт: только TCP; на связанных icmp не отключаемся",
      "    if not desync.dis.tcp then",
      "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end",
      "        return", "    end");
  } else if (transport === "udp") {
    push("    -- 1. транспорт: только UDP",
      "    if not desync.dis.udp then",
      "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end",
      "        return", "    end");
  } else {
    push("    -- 1. транспорт: TCP или UDP",
      "    if not (desync.dis.tcp or desync.dis.udp) then",
      "        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end",
      "        return", "    end");
  }

  if (c.cutoffOpposite && c.dir !== "any") push("    direction_cutoff_opposite(ctx, desync)");
  push(c.dir !== "out"
    ? `    if not direction_check(desync, "${c.dir}") then return end`
    : "    if not direction_check(desync) then return end");
  if (c.payloadCheck) push("    if not payload_check(desync) then return end");

  if (c.kind === "drop") {
    push("", "    -- 2. действие: запрет пакета");
    if (c.debug) push(`    DLOG("${name}: drop")`);
    push("    return VERDICT_DROP", "end");
    return finish(L, c, name, warn);
  }

  if (["fake", "split", "disorder", "skeleton"].includes(c.kind)) {
    push("", "    -- 2. источник данных: блоб → собранный reasm → пейлоад пакета",
      "    local data = blob_or_def(desync, desync.arg.blob) or desync.reasm_data or desync.dis.payload",
      "    if not data or #data == 0 then return end");
  }

  if (c.replayGuard && c.kind !== "modify") {
    push("", "    -- 3. многопакетный пейлоад: действуем один раз",
      "    if not replay_first(desync) then",
      "        if replay_drop(desync) then return VERDICT_DROP end",
      "        return", "    end");
  }

  if (c.kind === "fake") {
    push("", "    -- 4. фейковый пейлоад");
    if (c.optional) {
      push("    if desync.arg.optional and desync.arg.blob and not blob_exist(desync, desync.arg.blob) then",
        `        DLOG("${name}: blob absent, skipped")`, "        return", "    end");
    }
    push(`    local fake = blob(desync, desync.arg.blob or "${c.blob}")`);
    if (c.tlsmod) {
      push("    if desync.reasm_data then",
        `        local pl = tls_mod_shim(desync, fake, "${c.tlsmod}", desync.reasm_data)`,
        "        if pl then fake = pl end", "    end");
    }
    push("", "    -- 5. копия диссекта: оригинал неприкосновенен",
      "    local dis = deepcopy(desync.dis)", "    dis.payload = fake");
    if (c.ttl > 0) {
      push(`    if dis.ip then dis.ip.ip_ttl = ${c.ttl}`,
        `    elseif dis.ip6 then dis.ip6.ip6_hlim = ${c.ttl} end`);
    }
    if (c.md5) push("    apply_fooling(desync, dis)   -- tcp_md5 и прочие стандартные искажения");
    push("", "    -- 6. отправка с авто-сегментацией");
    if (c.badsum) push("    local opts = desync_opts(desync)", "    opts.reconstruct.badsum = true");
    if (c.debug) push(`    if b_debug then DLOG("${name}: fake len=" .. #fake) end`);
    push(`    rawsend_payload_segmented(desync, fake${c.badsum ? ", 0, opts" : ""})`);
    if (c.cutoffDone) push("    instance_cutoff_shim(ctx, desync)");
    push("", "    -- 7. оригинал проходит как есть", "    return VERDICT_PASS", "end");
    if (!c.ttl && !c.badsum && !c.md5) warn.push("Фейк без искажений дойдёт до сервера — задай TTL, badsum или tcp_md5.");
  }

  if (c.kind === "split" || c.kind === "disorder") {
    const rev = c.kind === "disorder";
    push("", "    -- 4. точки реза",
      `    local spos = desync.arg.pos or "${c.pos}"`,
      "    local pos = resolve_multi_pos(data, desync.l7payload, spos)",
      "    delete_pos_1(pos)   -- резать по первому байту нельзя",
      "    if #pos == 0 then",
      `        DLOG("${name}: no valid split positions")`, "        return", "    end",
      `    local seqovl = tonumber(desync.arg.seqovl) or ${c.seqovl}`,
      "    if seqovl < 0 then seqovl = 0 end",
      "    if seqovl >= (pos[1] or #data) then",
      `        DLOG("${name}: seqovl cancelled")`, "        seqovl = 0", "    end",
      "", `    -- 5. отправка частей ${rev ? "в обратном порядке" : "по порядку"}`,
      `    local pat = blob(desync, desync.arg.seqovl_pattern or "${c.pattern}")`);
    const head = rev ? "    for i = #pos, 0, -1 do" : "    for i = 0, #pos do";
    push(head,
      "        local a = pos[i] or 1",
      "        local b = (i < #pos) and (pos[i + 1] - 1) or #data",
      "        local part = string.sub(data, a, b)",
      "        local off = a - 1",
      `        if i == ${rev ? 1 : 0} and seqovl > 0 then`,
      "            part = pattern(pat, 1, seqovl) .. part",
      "            off = off - seqovl",
      "        end");
    if (c.debug) push(`        if b_debug then DLOG("${name}: part off=" .. off .. " len=" .. #part) end`);
    push("        if not rawsend_payload_segmented(desync, part, off) then return VERDICT_PASS end",
      "    end",
      "", "    -- 6. сообщение отправлено целиком: последующие части дропаем",
      "    replay_drop_set(desync)");
    if (c.cutoffDone) push("    instance_cutoff_shim(ctx, desync)");
    push("    return desync.arg.nodrop and VERDICT_PASS or VERDICT_DROP", "end");
    if (tcpOnly && c.transport !== "tcp") warn.push("Сегментация возможна только для TCP — транспорт переключён на TCP.");
    if (c.seqovl > 0) warn.push("seqovl не должен быть больше первой точки реза — в коде есть отмена, но проверь маркеры.");
  }

  if (c.kind === "modify") {
    push("", "    -- 4. искажение оригинала");
    if (c.modTtl > 0) push(`    if desync.dis.ip then desync.dis.ip.ip_ttl = ${c.modTtl}`,
      `    elseif desync.dis.ip6 then desync.dis.ip6.ip6_hlim = ${c.modTtl} end`);
    if (c.modTs !== 0) push("    apply_fooling(desync)   -- применит tcp_ts и другие стандартные аргументы");
    if (c.debug) push(`    DLOG("${name}: modified")`);
    push("    return VERDICT_MODIFY", "end");
    warn.push("Модификация оригинала влияет на реальное соединение: не сдвигай seq/ack без необходимости.");
  }

  if (c.kind === "send") {
    push("", "    -- 4. копия пакета", "    local dis = deepcopy(desync.dis)",
      "    apply_fooling(desync, dis)", '    apply_ip_id(desync, dis, nil, "none")');
    if (c.delay > 0) {
      push("", "    -- 5. отложенная отправка",
        `    timer_set(desync_timer_name(desync), "${name}_cb", ${c.delay}, true,`,
        "        { dis = dis, opts = desync_opts(desync) })");
    } else {
      push("", "    -- 5. немедленная отправка", "    rawsend_dissect_ipfrag(dis, desync_opts(desync))");
    }
    if (c.cutoffDone) push("    instance_cutoff_shim(ctx, desync)");
    push("    return VERDICT_PASS", "end");
    if (c.delay > 0) push("", `function ${name}_cb(name, data)`,
      "    rawsend_dissect_ipfrag(data.dis, data.opts)", "end");
  }

  if (c.kind === "skeleton") {
    push("", "    -- 4. своя логика", "    " + c.custom,
      "", "    -- 5. вердикт: PASS / MODIFY / DROP", "    return VERDICT_PASS", "end");
    warn.push("Каркас пустой: добавь действие и вердикт, затем прогони проверку ошибок.");
  }

  return finish(L, c, name, warn);
}

function finish(L, c, name, warn) {
  const code = L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  const parts = [];
  if (c.payload && c.payload !== "any") parts.push(`--payload=${c.payload}`);
  const args = [];
  if (c.dir !== "out") args.push(`dir=${c.dir}`);
  if (c.kind === "fake") { args.push(`blob=${c.blob}`); if (c.optional) args.push("optional"); }
  if (c.kind === "split" || c.kind === "disorder") {
    args.push(`pos=${c.pos}`);
    if (c.seqovl > 0) args.push(`seqovl=${c.seqovl}`);
    if (c.nodrop) args.push("nodrop");
  }
  if (c.kind === "modify" && c.modTs !== 0) args.push(`tcp_ts=${c.modTs}`);
  if (c.kind === "send") {
    if (c.repeats > 1) args.push(`repeats=${c.repeats}`);
    if (c.delay > 0) args.push(`delay=${c.delay}`);
  }
  if (c.ttl > 0 && c.kind === "fake") args.push(`ip_ttl=${c.ttl}`);
  if (c.md5 && c.kind === "fake") args.push("tcp_md5");
  if (c.badsum && c.kind === "fake") args.push("badsum");
  parts.push(`--lua-desync=${name}${args.length ? ":" + args.join(":") : ""}`);
  return { code, cli: parts.join(" "), warnings: warn, name };
}