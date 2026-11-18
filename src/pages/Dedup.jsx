import { useEffect, useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { findClusters, rewriteConfig } from "../lib/dedup";
import { loadVault, subscribe, addItem, updateItem, replaceAll } from "../lib/vault";
import { getConfig, setConfig } from "../lib/store";
import { save } from "../lib/pack";
import "../styles/idea.css";

export default function Dedup({ onNav }) {
  const [items, setItems] = useState(loadVault);
  const [open, setOpen] = useState({});
  const [toast, setToast] = useState(null);
  useEffect(() => subscribe(setItems), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  const { clusters, near, total } = useMemo(() => findClusters(), [items]);
  const config = getConfig();

  const applyCluster = c => {
    const snap = items.map(x => ({ ...x, versions: x.versions.slice() }));
    const it = addItem({ file: c.merged.file, text: c.merged.code, tags: ["объединено"],
      note: `Заменяет: ${c.group.map(g => g.name).join(", ")}. Различались только значения литералов.` });
    c.group.forEach(g => updateItem(g.id, { tags: [...new Set([...(items.find(x => x.id === g.id)?.tags || []), "дубликат → " + c.merged.name])] }));
    if (config) setConfig(rewriteConfig(config, c.merged.migration));
    setToast({ msg: `${c.merged.name}: объединено ${c.group.length} функций, конфиг переписан`, undo: () => { replaceAll(snap); setToast(null); }, id: it.id });
  };
  const applyAll = () => {
    const snap = items.map(x => ({ ...x, versions: x.versions.slice() }));
    let n = 0, mig = [];
    clusters.filter(c => !c.identical).forEach(c => {
      addItem({ file: c.merged.file, text: c.merged.code, tags: ["объединено"], note: `Заменяет: ${c.group.map(g => g.name).join(", ")}` });
      c.group.forEach(g => updateItem(g.id, { tags: [...new Set([...(items.find(x => x.id === g.id)?.tags || []), "дубликат → " + c.merged.name])] }));
      mig = mig.concat(c.merged.migration); n++;
    });
    if (config && mig.length) setConfig(rewriteConfig(config, mig));
    setToast(n ? { msg: `Объединено кластеров: ${n}`, undo: () => { replaceAll(snap); setToast(null); } } : { msg: "Объединять нечего" });
  };

  return (
    <Page title="Объединение похожих функций" desc="Функции с одинаковой последовательностью вызовов, различающиеся только значениями, сворачиваются в одну параметризованную. Порядок вызовов важен — похожие, но переставленные, не объединяются автоматически.">
      <div className="stats">
        <span><b>{total}</b> desync-функций</span>
        <span><b>{clusters.length}</b> кластеров-дубликатов</span>
        <span><b>{clusters.filter(c => c.identical).length}</b> полных копий</span>
        <span><b>{near.length}</b> похожих, но не сворачиваемых</span>
      </div>

      <div className="dd-bar">
        <button className="id-btn primary" disabled={!clusters.some(c => !c.identical)} onClick={applyAll}>объединить все</button>
        <button className="id-btn" onClick={() => onNav?.("myapi")}>справочник своих</button>
        <button className="id-btn" onClick={() => onNav?.("history")}>история версий</button>
        <span className="id-mono">{config ? "конфиг найден — вызовы будут переписаны" : "конфиг не сохранён — миграция будет показана, но не применена"}</span>
      </div>

      {!clusters.length && !near.length && (
        <div className="dd-none"><b>Дубликатов нет.</b> Все функции различаются логикой, а не только значениями — объединение не требуется.</div>
      )}

      {clusters.map(c => (
        <article key={c.fp} className={"dd-card" + (c.identical ? " same" : "")}>
          <div className="dd-h">
            <span className="dd-fp">{c.fp}</span>
            <b>{c.group.length} функций</b>
            <span className="dd-names">{c.group.map(g => g.name).join(" · ")}</span>
            <span className={"dd-tag " + (c.identical ? "same" : "merge")}>{c.identical ? "полные копии" : `${c.varying.length} различающихся значений`}</span>
          </div>

          {c.identical ? (
            <p className="dd-why">Логика и все значения совпадают побайтово после нормализации имён и комментариев. Это одна и та же функция под разными именами: оставь одну, остальные помечай дубликатами и убери из конфига.</p>
          ) : (
            <>
              <p className="dd-why">Последовательность вызовов и структура идентичны. Различаются только литералы — значит функция одна, а значения должны быть аргументами.</p>
              <table className="dd-tbl">
                <thead><tr><th>позиция</th><th>будущий аргумент</th>{c.group.map(g => <th key={g.name}>{g.name}</th>)}</tr></thead>
                <tbody>{c.varying.map(v => {
                  const p = c.merged.params.find(x => x.index === v.index);
                  return <tr key={v.index}><td>#{v.index + 1}</td><td><code>{p.arg}</code><i>{p.numeric ? "число" : "строка"}</i></td>
                    {v.values.map((val, k) => <td key={k}><code>{val}</code></td>)}</tr>;
                })}</tbody>
              </table>
              <div className="dd-actions">
                <button className="id-btn primary" onClick={() => applyCluster(c)}>объединить в {c.merged.name}</button>
                <button className="id-btn" onClick={() => setOpen(o => ({ ...o, [c.fp]: !o[c.fp] }))}>{open[c.fp] ? "скрыть" : "показать"} код и миграцию</button>
                <button className="id-btn" onClick={() => save(c.merged.code, c.merged.file, "text/x-lua")}>скачать .lua</button>
              </div>
              {open[c.fp] && (
                <>
                  <Code label={c.merged.file} lines>{c.merged.code}</Code>
                  <h3>Замена вызовов в конфиге</h3>
                  <table className="dd-tbl">
                    <thead><tr><th>было</th><th>станет</th></tr></thead>
                    <tbody>{c.merged.migration.map(m => <tr key={m.from}><td><code>--lua-desync={m.from}</code></td><td><code>{m.cli}</code></td></tr>)}</tbody>
                  </table>
                  {config && <Code label="конфиг после переписывания">{rewriteConfig(config, c.merged.migration)}</Code>}
                </>
              )}
            </>
          )}
        </article>
      ))}

      {near.length > 0 && (
        <>
          <h2>Похожие, но автоматическое объединение небезопасно</h2>
          {near.map((g, i) => (
            <article key={i} className="dd-card near">
              <div className="dd-h"><b>{g.length} функций</b><span className="dd-names">{g.map(x => x.name).join(" · ")}</span><span className="dd-tag near">порядок различается</span></div>
              <p className="dd-why">Набор вызовов один и тот же, но последовательность разная. В zapret2 порядок определяет результат: фейк до реза и фейк после реза дают разное поведение DPI, а сдвиг seq до отправки и после — разную валидность пакета. Свернуть такие функции в одну значит потерять смысл. Объединяй вручную, если различие действительно несущественно.</p>
              <div className="dd-calls">{g.map(x => <div key={x.name}><code>{x.name}</code><span>{x.calls.join(" → ")}</span></div>)}</div>
            </article>
          ))}
        </>
      )}

      {toast && (
        <div className="vt-toast"><span>{toast.msg}</span>
          {toast.undo && <button className="vt-btn vt-primary" onClick={toast.undo}>вернуть</button>}
          <button className="vt-x" onClick={() => setToast(null)}>×</button></div>
      )}
    </Page>
  );
}