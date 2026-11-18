import { docLua, KIND_RU } from "./luadoc";
import { fixLua } from "./fixLua";
import { diffLines, hunks } from "./diff";

export function describeFn(f) {
  const parts = [];
  parts.push(`«${f.name}» — ${KIND_RU[f.kind]}`);
  const gates = [f.tcpOnly && "только TCP", f.udpOnly && "только UDP", f.outgoingOnly && "исходящие", ...f.gatePayload].filter(Boolean);
  parts.push(gates.length ? `работает по ${gates.join(", ")}` : "без транспортных гейтов");
  if (f.sends) parts.push(f.splits ? "режет пейлоад и отправляет части" : "отправляет собственные пакеты");
  if (f.needsReasm) parts.push("использует собранный reasm");
  parts.push(`вердикт: ${f.verdicts.join("/") || "nil (PASS)"}`);
  parts.push(`replay-защита ${f.hasReplay ? "есть" : "отсутствует"}, cutoff ${f.hasCutoff ? "есть" : "отсутствует"}`);
  if (f.luaCutoff) parts.push("ВНИМАНИЕ: вызывает lua_cutoff — отключает обработку потока для всех инстансов");
  if (f.args.length) parts.push(`аргументы: ${f.args.map(a => a.name).join(", ")}`);
  return parts.join("; ") + ".";
}

export function reconcile(items, loaded, known) {
  const byName = new Map(items.map(i => [i.file, i]));
  const rows = [];
  const seen = new Set();

  for (const f of loaded) {
    seen.add(f.file);
    const mem = byName.get(f.file) || null;
    const status = !mem ? "new" : mem.text !== f.text ? "changed" : "same";
    const base = status === "same" ? mem.text : f.text;
    const fix = fixLua(base, null, known);
    const doc = docLua(fix.code, f.file, known);
    rows.push({
      key: "L:" + f.file, file: f.file, source: "loaded", status, id: mem?.id || null,
      memText: mem?.text ?? null, incoming: f.text, base, fix, doc,
      hunks: mem && status === "changed" ? hunks(diffLines(mem.text, f.text)) : [],
      action: status === "new" ? "import" : status === "changed" ? "update" : fix.applied.length ? "fix" : "none"
    });
  }
  for (const it of items) {
    if (seen.has(it.file)) continue;
    const fix = fixLua(it.text, null, known);
    const doc = docLua(fix.code, it.file, known);
    rows.push({
      key: "M:" + it.id, file: it.file, source: "memory", status: "memory", id: it.id,
      memText: it.text, incoming: it.text, base: it.text, fix, doc, hunks: [],
      action: fix.applied.length ? "fix" : "none"
    });
  }
  const need = rows.filter(r => r.action !== "none");
  return { rows, need, clean: need.length === 0 };
}

export const STATUS_RU = {
  new: "новый файл", changed: "содержимое отличается", same: "совпадает с памятью", memory: "только в памяти"
};
export const ACTION_RU = {
  import: "принять в память", update: "обновить память", fix: "применить исправления", none: "исправлений не требуется"
};