import { BLOCKS } from "../data/blocks";

const byId = id => BLOCKS.find(b => b.id === id);
const luaName = s => String(s || "my_fn").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "_$1").replace(/_+/g, "_").replace(/^_|_$/g, "") || "my_fn";
const q = s => '"' + String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

function fill(tpl, p, ctx) {
  return tpl
    .replace(/\{\{flag:([a-z0-9_]+)\}\}/gi, (_, k) => (p[k] ? "true" : "nil"))
    .replace(/\{\{kv:([a-z0-9_]+)\}\}/gi, (_, k) => String(p[k] || "")
      .split(",").map(x => x.trim()).filter(Boolean)
      .map(x => { const i = x.indexOf("="); return i < 0 ? `${x} = true` : `${x.slice(0, i).trim()} = ${q(x.slice(i + 1).trim())}`; })
      .join(", "))
    .replace(/\{\{name\}\}/g, ctx.name)
    .replace(/\{\{uid\}\}/g, ctx.uid)
    .replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, k) => {
      const v = p[k];
      if (v === undefined) return "";
      if (v === "" ) return "nil";
      if (/^-?\d+(\.\d+)?$/.test(String(v))) return String(v);
      if (k === "fn") return String(v);
      return q(v);
    });
}

export function compose({ name, blocks = [], guards = {}, desc = "" }) {
  const fn = luaName(name);
  const issues = [];
  const provided = new Set();
  const body = [];
  let usesCalls = false, hasSend = false, hasVerdict = false, uid = 0;

  blocks.forEach((inst, i) => {
    const def = byId(inst.id);
    if (!def) { issues.push({ level: "crit", msg: `Блок ${inst.id} не найден` }); return; }
    const p = { ...Object.fromEntries((def.params || []).map(x => [x.k, x.def])), ...(inst.p || {}) };
    (def.needs || []).forEach(n => {
      if (!provided.has(n)) issues.push({ level: "warn", msg: `«${def.title}» требует «${n}» — добавь блок выше (шаг ${i + 1})` });
    });
    (def.provides || []).forEach(n => provided.add(n));
    if (def.calls) usesCalls = true;
    if (def.cat === "Отправка" || def.calls) hasSend = true;
    if (def.cat === "Вердикт") hasVerdict = true;
    uid += 1;
    body.push(`    -- ${i + 1}. ${def.title}`);
    fill(def.code, p, { name: fn, uid: `${fn}_${uid}` }).split("\n").forEach(l => body.push("    " + l));
  });

  if (!blocks.length) issues.push({ level: "info", msg: "Пусто: добавь блоки из палитры или пиши тело вручную" });
  if (blocks.length && !hasSend) issues.push({ level: "warn", msg: "Нет ни одного приёма/отправки — функция ничего не делает" });
  if (blocks.length && !hasVerdict) issues.push({ level: "info", msg: "Нет явного вердикта — будет добавлен return verdict" });
  const fakeNoFool = blocks.some(b => b.id === "call_fake_ip" && !(b.p?.ip_ttl || b.p?.ip_autottl));
  if (fakeNoFool) issues.push({ level: "crit", msg: "фейк без TTL/autottl дойдёт до сервера — задай ip_ttl или ip_autottl" });

  const L = [];
  L.push(`-- ${fn}.lua`);
  if (desc) L.push(`-- ${String(desc).replace(/\r?\n/g, " ").slice(0, 180)}`);
  L.push(`-- собрано в кузнице из ${blocks.length} блок(ов)`);
  L.push("");
  if (usesCalls) {
    L.push("local function make_caller(ctx, desync)");
    L.push("    local verdict = VERDICT_PASS");
    L.push("    return function(fn, over)");
    L.push("        local saved = {}");
    L.push("        for k, v in pairs(over) do saved[k] = desync.arg[k]; desync.arg[k] = v end");
    L.push("        local ok, v = pcall(fn, ctx, desync)");
    L.push("        for k in pairs(over) do desync.arg[k] = saved[k] end");
    L.push("        if not ok then DLOG(\"call failed: \" .. tostring(v)); return end");
    L.push("        if v == VERDICT_DROP then verdict = VERDICT_DROP");
    L.push("        elseif v == VERDICT_MODIFY and verdict ~= VERDICT_DROP then verdict = VERDICT_MODIFY end");
    L.push("    end, function() return verdict end");
    L.push("end");
    L.push("");
  }
  L.push(`function ${fn}(ctx, desync)`);
  if (guards.tcp) {
    L.push("    if not desync.dis.tcp then");
    L.push("        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end");
    L.push("        return VERDICT_PASS");
    L.push("    end");
  }
  if (guards.nonempty) {
    L.push("    if not desync.dis.payload or #desync.dis.payload == 0 then");
    L.push("        if not (desync.reasm_data and #desync.reasm_data > 0) then return VERDICT_PASS end");
    L.push("    end");
  }
  if (usesCalls) L.push("    local apply_call, get_verdict = make_caller(ctx, desync)");
  if (body.length) L.push(...body); else L.push("    -- тело функции: пиши здесь");
  if (!hasVerdict) L.push(usesCalls ? "    return get_verdict()" : "    return VERDICT_PASS");
  L.push("end");

  const code = L.join("\n") + "\n";
  const needsLua = blocks.map(b => byId(b.id)?.calls).filter(x => x && x !== "*");
  const profile = [
    `--new=${fn}`, `--name=${fn}`,
    `--filter-tcp=${guards.tcp || "443"}`,
    ...(guards.l7 ? [`--filter-l7=${guards.l7}`] : []),
    ...(guards.payload ? [`--payload=${guards.payload}`] : []),
    ...(guards.out ? [`--out-range=${guards.out}`] : []),
    `--lua-desync=${fn}`
  ].join("\n");
  return { name: fn, code, profile, issues, needsLua: [...new Set(needsLua)], usesCalls };
}

export function batFor(res, files) {
  const cmd = ['start "zapret2" /min "%~dp0winws2.exe"', "--wf-tcp-out=80,443"];
  ["zapret-lib.lua", "zapret-antidpi.lua", "zapret-auto.lua"].forEach(f => cmd.push(`--lua-init=@"%~dp0lua\\${f}"`));
  [...new Set(files)].forEach(f => cmd.push(`--lua-init=@"%~dp0${f}"`));
  cmd.push(`--lua-init=@"%~dp0${res.name}.lua"`);
  res.profile.split("\n").forEach(l => cmd.push(l));
  return ["@echo off", "chcp 65001 >nul",
    "net session >nul 2>&1 || (echo Нужны права администратора & pause & exit /b 1)",
    'cd /d "%~dp0"', cmd.join(" ^\n ")].join("\n") + "\n";
}