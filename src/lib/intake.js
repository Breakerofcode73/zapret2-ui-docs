// Разбор вставленного текста на отдельные файлы. Понимает формат базы знаний,
// fenced-блоки с именем, заголовки-комментарии и голый текст одного файла.
const EXT = /\.(lua|bat|cmd|txt)$/i;

export const HUES = ["#38bdf8", "#f472b6", "#4ade80", "#fbbf24", "#a78bfa", "#60a5fa", "#fb7185", "#2dd4bf"];
export const hueFor = i => HUES[((i % HUES.length) + HUES.length) % HUES.length];

export function inferName(text, n = 1) {
  const head = text.split("\n").slice(0, 6).join("\n");
  let m = head.match(/([A-Za-z0-9][\w.\-]*\.(?:lua|bat|cmd|txt))/);
  if (m) return m[1];
  if (/@echo\s+off/i.test(text) || /winws2|nfqws2/i.test(text)) return n > 1 ? `config-${n}.bat` : "config.bat";
  m = text.match(/^\s*function\s+([A-Za-z_]\w*)\s*\(\s*ctx\s*,\s*desync\s*\)/m);
  if (m) return m[1] + ".lua";
  m = text.match(/^\s*(?:local\s+)?function\s+([A-Za-z_]\w*)/m);
  if (m) return m[1] + ".lua";
  return n > 1 ? `pasted-${n}.lua` : "pasted.lua";
}

function headerName(line, bufEmpty) {
  const t = line.trim();
  let m = t.match(/^#{1,6}\s*.*?\[File\]\(([^)]+)\)/i);
  if (m) return { name: m[1].trim(), keep: false };
  m = t.match(/^(?:[=\-–—*#>]{1,}\s*)?(?:файл|file)?\s*[:\-]?\s*[`*"']?([A-Za-z0-9][\w.\-]*\.(?:lua|bat|cmd|txt))[`*"']?\s*[=\-–—:*]*$/i);
  if (m && EXT.test(m[1])) return { name: m[1], keep: false };
  if (bufEmpty) {
    m = t.match(/^--\s*([A-Za-z0-9][\w.\-]*\.lua)\s*$/i);
    if (m) return { name: m[1], keep: true };
  }
  return null;
}

export function splitFiles(raw) {
  const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let buf = [], name = null, pending = null, inFence = false;

  const flush = n => {
    const text = buf.join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
    buf = [];
    if (!text.trim()) return;
    out.push({ file: n || inferName(text, out.length + 1), text });
  };

  for (const line of lines) {
    const fence = line.match(/^\s*`{3,}\s*([A-Za-z0-9_+-]*)\s*$/);
    if (fence) {
      if (!inFence) {
        if (buf.some(l => l.trim())) { flush(name); name = null; }
        inFence = true;
        if (pending) { name = pending; pending = null; }
      } else {
        flush(name); name = null; inFence = false;
      }
      continue;
    }
    if (inFence) { buf.push(line); continue; }
    const h = headerName(line, buf.length === 0);
    if (h) {
      if (buf.some(l => l.trim())) { flush(name); }
      name = h.name; pending = h.name;
      if (h.keep) buf.push(line);
      continue;
    }
    if (!line.trim() && !buf.length) continue;
    buf.push(line);
  }
  if (buf.some(l => l.trim())) flush(name);

  const seen = new Map();
  return out.map(f => {
    const base = f.file;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? { ...f, version: 1, base }
      : { ...f, file: base.replace(EXT, ` (${n})$1`), version: n, base };
  });
}

export function looksLikeCode(t) {
  return /\bfunction\s+\w+\s*\(/.test(t) || /--lua-desync|winws2|@echo\s+off/i.test(t) || /\bdesync\./.test(t);
}