import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { genLua, TEMPLATES, DEFAULT_CFG } from "../lib/genLua";
import { checkLua } from "../lib/checkLua";
import { setLua } from "../lib/store";
import { fns as capi } from "../ref/CApi";
import { fns as lib } from "../ref/Lib";
import { fns as antidpi } from "../ref/Antidpi";
import { fns as auto } from "../ref/Auto";
import "../styles/builder.css";

const KNOWN = new Set([...capi, ...lib, ...antidpi, ...auto].map(f => f.name));

function Row({ label, hint, children }) {
  return (
    <label className="bd-row">
      <span className="bd-label">{label}{hint && <i>{hint}</i>}</span>
      <span className="bd-ctl">{children}</span>
    </label>
  );
}
const Num = ({ v, set, min = 0, max = 65535 }) => (
  <input type="number" className="bd-num" value={v} min={min} max={max} onChange={e => set(+e.target.value)} />
);
const Txt = ({ v, set, ph }) => <input className="bd-txt" value={v} placeholder={ph} onChange={e => set(e.target.value)} />;
const Sw = ({ v, set }) => (
  <button className={"bd-sw" + (v ? " on" : "")} onClick={() => set(!v)} role="switch" aria-checked={v}><i /></button>
);
const Sel = ({ v, set, opts }) => (
  <select className="bd-sel" value={v} onChange={e => set(e.target.value)}>
    {opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
  </select>
);

export default function Builder({ onNav }) {
  const [c, setC] = useState(DEFAULT_CFG);
  const set = k => v => setC(o => ({ ...o, [k]: v }));
  const out = useMemo(() => genLua(c), [c]);
  const chk = useMemo(() => checkLua(out.code, KNOWN), [out.code]);
  const crit = chk.issues.filter(i => i.level === "crit").length;

  const download = () => {
    const blob = new Blob([out.code], { type: "text/x-lua" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = out.name + ".lua"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const send = target => { setLua(out.code); onNav?.(target); };

  return (
    <Page title="Конструктор функции" desc="Опиши задачу переключателями слева — рабочий Lua-скрипт собирается справа вживую, с комментариями и строкой запуска.">
      <div className="bd">
        <div className="bd-panel">
          <div className="bd-sec">Задача</div>
          <Row label="Имя функции" hint="латиница, без пробелов"><Txt v={c.name} set={set("name")} ph="my_strategy" /></Row>
          <div className="bd-tpl">
            {TEMPLATES.map(t => (
              <button key={t.id} className={"bd-tpl-b" + (c.kind === t.id ? " on" : "")} onClick={() => set("kind")(t.id)}>
                <b>{t.label}</b><span>{t.hint}</span>
              </button>
            ))}
          </div>

          <div className="bd-sec">Фильтры</div>
          <Row label="Транспорт"><Sel v={c.transport} set={set("transport")} opts={[["tcp", "TCP"], ["udp", "UDP"], ["both", "TCP или UDP"]]} /></Row>
          <Row label="Направление"><Sel v={c.dir} set={set("dir")} opts={[["out", "исходящие"], ["in", "входящие"], ["any", "оба"]]} /></Row>
          <Row label="Тип пейлоада" hint="--payload"><Txt v={c.payload} set={set("payload")} ph="tls_client_hello" /></Row>
          <Row label="payload_check" hint="стандартный фильтр"><Sw v={c.payloadCheck} set={set("payloadCheck")} /></Row>
          <Row label="cutoff противоположного" hint="экономия CPU"><Sw v={c.cutoffOpposite} set={set("cutoffOpposite")} /></Row>
          <Row label="Защита replay" hint="один раз на сообщение"><Sw v={c.replayGuard} set={set("replayGuard")} /></Row>
          <Row label="cutoff после действия" hint="для одноразовых"><Sw v={c.cutoffDone} set={set("cutoffDone")} /></Row>
          <Row label="Отладочный лог" hint="под b_debug"><Sw v={c.debug} set={set("debug")} /></Row>

          {c.kind === "fake" && <>
            <div className="bd-sec">Фейк</div>
            <Row label="Блоб"><Txt v={c.blob} set={set("blob")} ph="fake_default_tls" /></Row>
            <Row label="optional" hint="не падать без блоба"><Sw v={c.optional} set={set("optional")} /></Row>
            <Row label="TTL фейка" hint="0 = не менять"><Num v={c.ttl} set={set("ttl")} max={255} /></Row>
            <Row label="Битая сумма"><Sw v={c.badsum} set={set("badsum")} /></Row>
            <Row label="tcp_md5"><Sw v={c.md5} set={set("md5")} /></Row>
            <Row label="tls_mod" hint="пусто = выкл"><Txt v={c.tlsmod} set={set("tlsmod")} ph="rnd,rndsni,dupsid" /></Row>
          </>}

          {(c.kind === "split" || c.kind === "disorder") && <>
            <div className="bd-sec">Сегментация</div>
            <Row label="Маркеры pos"><Txt v={c.pos} set={set("pos")} ph="1,host,midsld+1" /></Row>
            <Row label="seqovl" hint="байт перекрытия"><Num v={c.seqovl} set={set("seqovl")} max={1400} /></Row>
            <Row label="Узор перекрытия"><Txt v={c.pattern} set={set("pattern")} ph="0x1603030000" /></Row>
            <Row label="nodrop" hint="не дропать оригинал"><Sw v={c.nodrop} set={set("nodrop")} /></Row>
          </>}

          {c.kind === "modify" && <>
            <div className="bd-sec">Искажение оригинала</div>
            <Row label="TTL" hint="0 = не менять"><Num v={c.modTtl} set={set("modTtl")} max={255} /></Row>
            <Row label="tcp_ts" hint="сдвиг timestamp"><Num v={c.modTs} set={set("modTs")} min={-9999999} max={9999999} /></Row>
          </>}

          {c.kind === "send" && <>
            <div className="bd-sec">Дубль</div>
            <Row label="Повторы"><Num v={c.repeats} set={set("repeats")} min={1} max={10} /></Row>
            <Row label="Задержка, мс" hint="0 = сразу"><Num v={c.delay} set={set("delay")} max={5000} /></Row>
          </>}

          {c.kind === "skeleton" && <>
            <div className="bd-sec">Своя логика</div>
            <textarea className="bd-ta" value={c.custom} onChange={e => set("custom")(e.target.value)} spellCheck={false} />
          </>}

          <div className="bd-actions">
            <button onClick={() => setC(DEFAULT_CFG)}>сбросить</button>
            <button onClick={() => setC(o => ({ ...o, name: "my_" + Math.random().toString(36).slice(2, 7) }))}>случайное имя</button>
          </div>
        </div>

        <div className="bd-out">
          <div className="bd-out-bar">
            <span className={"bd-badge " + (crit ? "bad" : "ok")}>{crit ? crit + " критичных" : "каркас корректен"}</span>
            <span className="bd-meta">{out.code.split("\n").length} строк · {chk.issues.length} замечаний</span>
            <button onClick={download}>скачать .lua</button>
            <button onClick={() => send("diagnose")}>проверить</button>
            <button className="bd-primary" onClick={() => send("fixer")}>исправить</button>
          </div>
          <Code label={out.name + ".lua"} lines>{out.code}</Code>
          <Code label="строка запуска">{out.cli}</Code>
          {out.warnings.length > 0 && <div className="bd-warn"><b>Обрати внимание:</b><ul>{out.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
          {chk.issues.length > 0 && (
            <div className="bd-issues">
              {chk.issues.slice(0, 8).map((x, i) => (
                <div key={i} className={"bd-issue " + x.level}><span>{x.id}</span> строка {x.line}: {x.msg}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}