import { mdDoc } from "./luadoc";

export function bundle({ items, docs, config, patched, notes = [] }) {
  const L = [];
  L.push("# Пакет zapret2: свои функции + конфиг", "");
  L.push(`Файлов Lua: ${items.length}. Конфиг: ${config ? "есть" : "нет"}. Патченный конфиг: ${patched ? "есть" : "нет"}.`, "");
  L.push("Формат совпадает с приёмом файлов: этот .md можно вставить обратно на вкладке «Приём файлов» — записи восстановятся.", "");
  items.forEach((it, i) => {
    L.push(`## The content from [File](${it.file}):`, "", "```lua", it.text, "```", "");
    if (it.note) L.push(`> ${it.note.replace(/\n/g, " ")}`, "");
    void i;
  });
  if (patched || config) {
    L.push("## The content from [File](config.bat):", "", "```bat", patched || config, "```", "");
  }
  if (notes.length) { L.push("## Замечания", ""); notes.forEach(n => L.push("- " + n)); L.push(""); }
  L.push("---", "", "# Документация функций", "");
  docs.forEach(d => L.push(mdDoc(d), "", "---", ""));
  return L.join("\n");
}

export function save(text, name, type = "text/plain") {
  const b = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}