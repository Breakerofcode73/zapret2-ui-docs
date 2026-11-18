import { useMemo, useRef, useState } from "react";
import { splitFiles, looksLikeCode, hueFor } from "../lib/intake";
import { docLua } from "../lib/luadoc";
import { fixLua } from "../lib/fixLua";
import { loadVault, addItem, updateItem, replaceAll } from "../lib/vault";
import "../styles/intake.css";

const SAMPLE = `## The content from [File](fake_ip_misdirection.lua):

\`\`\`lua
function fake_ip_misdirection(ctx, desync)
if not desync.outgoing or #desync.dis.payload == 0 then
    return VERDICT_PASS
end
local opts_fake = desync_opts(desync)
opts_fake.reconstruct.ip_dst = desync.arg.ip_dst or "192.0.2.1"
opts_fake.reconstruct.ip_ttl = tonumber(desync.arg.ip_ttl) or 1
opts_fake.reconstruct.badsum = true
opts_fake.reconstruct.ip_id = "rnd"
if desync.dis.tcp then
    opts_fake.reconstruct.tcp_seq = math.random(0, 0xFFFFFFFF)
    opts_fake.reconstruct.tcp_ts = -600000
end
local fake_dis = deepcopy(desync.dis)
rawsend_dissect(fake_dis, opts_fake.rawsend, opts_fake.reconstruct)
return VERDICT_PASS
end
\`\`\`

## The content from [File](my_ttl_probe.lua):

\`\`\`lua
-- my_ttl_probe.lua : копия пакета с заданным TTL, оригинал не трогаем
function my_ttl_probe(ctx, desync)
    if not desync.dis.tcp then
        if not desync.dis.icmp then instance_cutoff_shim(ctx, desync) end
        return
    end
    direction_cutoff_opposite(ctx, desync)
    if not direction_check(desync) then return end
    if not payload_check(desync) then return end
    if not replay_first(desync) then
        if replay_drop(desync) then return VERDICT_DROP end
        return
    end
    local ttl = tonumber(desync.arg.ttl) or 8
    local dis = deepcopy(desync.dis)
    if dis.ip then dis.ip.ip_ttl = ttl
    elseif dis.ip6 then dis.ip6.ip6_hlim = ttl end
    local opts = desync_opts(desync)
    opts.reconstruct.badsum = true
    if b_debug then DLOG("my_ttl_probe: ttl=" .. ttl) end
    rawsend_dissect_ipfrag(dis, opts)
    instance_cutoff_shim(ctx, desync)
    return VERDICT_PASS
end
\`\`\``;

export default function Intake({ known, onPick, onToast }) {
  const [raw, setRaw] = useState("");
  const [over, setOver] = useState(false);
  const [taken, setTaken] = useState([]);
  const fileRef = useRef(null);

  const parts = useMemo(() => splitFiles(raw), [raw]);
  const preview = useMemo(() => parts.map((p, i) => {
    const d = docLua(p.text, p.file, known);
    const f = fixLua(p.text, null, known);
    const mem = loadVault().find(x => x.file === p.file);
    return {
      ...p, i, hue: hueFor(i), doc: d, fix: f,
      status: !mem ? "new" : mem.text === p.text ? "same" : "changed",
      taken: taken.includes(p.file)
    };
  }), [parts, known, taken]);

  const snapshot = () => loadVault().map(x => ({ ...x }));

  const accept = list => {
    if (!list.length) return;
    const snap = snapshot();
    const ids = [];
    list.forEach(p => {
      const mem = loadVault().find(x => x.file === p.file);
      if (mem) { updateItem(mem.id, { text: p.text, tags: [...new Set([...(mem.tags || []), "обновлено"])], note: p.doc.funcs.map(f => `${f.name}: ${f.kind}`).join("\n") }); ids.push(mem.id); }
      else {
        const it = addItem({ file: p.file, text: p.text, tags: [p.version > 1 ? `версия ${p.version}` : "импорт"], note: p.doc.funcs.map(f => `${f.name}: ${f.kind}`).join("\n") });
        ids.push(it.id);
      }
    });
    setTaken(t => [...new Set([...t, ...list.map(p => p.file)])]);
    onPick?.(ids[0]);
    onToast?.({
      msg: `Загружено как текст: ${list.length} файл(ов) — ${list.map(p => p.file).join(", ")}`,
      undo: () => { replaceAll(snap); setTaken([]); onToast?.(null); }
    });
  };

  const readFiles = async files => {
    const arr = [];
    for (const f of files) arr.push({ file: f.name, text: await f.text(), version: 1 });
    const enriched = arr.map((p, i) => {
      const d = docLua(p.text, p.file, known);
      return { ...p, i, hue: hueFor(i), doc: d, fix: fixLua(p.text, null, known), status: loadVault().some(x => x.file === p.file) ? "changed" : "new" };
    });
    setRaw(enriched.map(p => `## The content from [File](${p.file}):\n\n\`\`\`lua\n${p.text}\n\`\`\``).join("\n\n"));
    accept(enriched);
  };

  const onPaste = e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); readFiles(files); return; }
    const text = e.clipboardData?.getData("text") || "";
    if (!text.trim()) return;
    e.preventDefault();
    setRaw(text);
    const parsed = splitFiles(text);
    if (!parsed.length || !looksLikeCode(text)) return;
    const enriched = parsed.map((p, i) => ({
      ...p, i, hue: hueFor(i), doc: docLua(p.text, p.file, known), fix: fixLua(p.text, null, known),
      status: loadVault().some(x => x.file === p.file) ? "changed" : "new"
    }));
    accept(enriched);
  };

  const dupes = preview.filter(p => p.version > 1);

  return (
    <div className="ik">
      <div className={"ik-zone" + (over ? " over" : "")}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) readFiles(f); }}>
        <div className="ik-zone-h">
          <span className="ik-mark">⌁</span>
          <div>
            <b>Вставь файлы — они сразу станут текстом в памяти</b>
            <span>Ctrl+V прямо сюда · несколько файлов за раз · формат базы знаний, ```блоки, заголовки <code>-- имя.lua</code> и голый код</span>
          </div>
          <kbd>Ctrl</kbd><kbd>V</kbd>
        </div>
        <textarea className="ik-ta" spellCheck={false} value={raw} onPaste={onPaste}
          placeholder={"Вставь сюда один или несколько файлов…\n\nПоддерживается:\n## The content from [File](name.lua):\n```lua … ```\n\n-- name.lua\nfunction name(ctx, desync) … end"}
          onChange={e => setRaw(e.target.value)} />
        <div className="ik-bar">
          <button className="ik-btn ik-primary" onClick={() => fileRef.current?.click()}>выбрать файлы</button>
          <input ref={fileRef} type="file" accept=".lua,.bat,.cmd,.txt" multiple hidden onChange={e => { const f = [...e.target.files]; if (f.length) readFiles(f); e.target.value = ""; }} />
          <button className="ik-btn" onClick={async () => {
            try { const t = await navigator.clipboard.readText(); if (t.trim()) { setRaw(t); const p = splitFiles(t); if (p.length) accept(p.map((x, i) => ({ ...x, i, hue: hueFor(i), doc: docLua(x.text, x.file, known), fix: fixLua(x.text, null, known), status: loadVault().some(v => v.file === x.file) ? "changed" : "new" }))); } }
            catch { onToast?.({ msg: "Буфер недоступен — нажми Ctrl+V в поле выше" }); }
          }}>вставить из буфера</button>
          <button className="ik-btn" onClick={() => { setRaw(SAMPLE); setTaken([]); }}>пример из двух файлов</button>
          <button className="ik-btn" disabled={!preview.length} onClick={() => accept(preview.filter(p => !p.taken))}>принять всё ({preview.filter(p => !p.taken).length})</button>
          <button className="ik-btn" onClick={() => { setRaw(""); setTaken([]); }}>очистить</button>
          <span className="ik-mono">распознано файлов: {preview.length}</span>
        </div>
      </div>

      {dupes.length > 0 && (
        <div className="ik-note warn">Найдены разные версии одного имени: {dupes.map(d => d.base).join(", ")}. Они сохранены отдельными записями с суффиксом — исправления считаются для каждой независимо.</div>
      )}

      {preview.length === 0 ? (
        <p className="ik-note">Пока ничего не распознано. Вставь текст или выбери файлы — превью появится здесь, а записи уйдут в память автоматически.</p>
      ) : (
        <div className="ik-list">
          {preview.map(p => (
            <article key={p.file + p.i} className={"ik-card" + (p.taken ? " taken" : "")} style={{ "--fh": p.hue }}>
              <div className="ik-card-h">
                <span className="ik-dot" />
                <code>{p.file}</code>
                <span className={"ik-status " + p.status}>{p.status === "new" ? "новый" : p.status === "changed" ? "отличается от памяти" : "совпадает"}</span>
                {p.taken && <span className="ik-taken">в памяти</span>}
                <span className="ik-mono">{p.doc.lines} строк · {p.doc.funcs.length} функций</span>
              </div>
              <div className="ik-fns">
                {p.doc.funcs.map(f => (
                  <span key={f.name} className="ik-fn"><b>{f.name}</b><i>{f.kind}</i>{f.args.length > 0 && <em>{f.args.length} арг.</em>}</span>
                ))}
              </div>
              <div className="ik-fixline">
                <span className={"ik-badge " + (p.fix.after.length ? "bad" : "ok")}>
                  {p.fix.before.length} → {p.fix.after.length} замечаний
                </span>
                {p.fix.applied.length > 0
                  ? <span className="ik-rules">правки этого файла: {p.fix.applied.map(a => `${a.id}×${a.count}`).join(", ")}</span>
                  : <span className="ik-rules ok">исправлений не требуется</span>}
              </div>
              <div className="ik-card-a">
                {!p.taken && <button className="ik-btn ik-primary" onClick={() => accept([p])}>принять этот файл</button>}
                <button className="ik-btn" onClick={() => {
                  const mem = loadVault().find(x => x.file === p.file);
                  if (mem) onPick?.(mem.id); else { accept([p]); }
                }}>открыть разбор</button>
                <button className="ik-btn" onClick={() => setRaw(prev => prev.replace(p.text, "").trim())}>убрать из вставки</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}