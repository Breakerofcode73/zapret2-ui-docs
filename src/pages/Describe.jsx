import { useMemo, useState } from "react";
import Page from "../components/Page";
import Code from "../components/Code";
import { checkLua } from "../lib/checkLua";
import { save } from "../lib/pack";
import { setLua, setConfig } from "../lib/store";
import { addItem } from "../lib/vault";
import { describeToFunction, KNOWN } from "../lib/describeGen";
import "../styles/builder.css";
import "../styles/checkers.css";

const LV = { crit: "критично", warn: "warning", info: "замечание" };
const EXAMPLES = [
  { name: "youtube_fake_split", text: "Ютуб: фейковый TLS ClientHello с TTL 8 и битой суммой, потом сплит по 1,midsld" },
  { name: "http_host_eol", text: "HTTP сайт: поменять регистр заголовка Host и добавить перенос строки перед методом" },
  { name: "quic_youtube", text: "QUIC YouTube: фейк fake_default_quic с badsum и ttl 8, потом увеличить длину UDP на 2 байта" },
  { name: "tls_mask_vk", text: "Маскировка SNI под vk.com, реальный хост частями, midhost midsld, ttl 8 badsum" },
  { name: "discord_voice", text: "Дискорд голос: UDP паддинг +2 байта и фейк optional с ttl 8 badsum" },
  { name: "tls_clone_fake", text: "Клонировать ClientHello в hello_clone, отправить клон как фейк с badsum ttl 8, потом сплит pos=1,midsld" }
];

export default function Describe({ onNav }) {
  const [desc, setDesc] = useState("");
  const [name, setName] = useState("my_strategy");
  const [proto, setProto] = useState("auto");
  const gen = useMemo(() => desc.trim() ? describeToFunction(desc, { name, proto }) : null, [desc, name, proto]);
  const check = useMemo(() => gen ? checkLua(gen.code, KNOWN) : null, [gen]);
  const n = { crit: 0, warn: 0, info: 0 };
  (check?.issues || []).forEach(i => n[i.level]++);

  const toVault = () => {
    if (!gen) return;
    addItem({ file: gen.name + ".lua", text: gen.code, tags: ["сгенерировано", gen.proto], note: desc.slice(0, 200) });
    onNav?.("vault");
  };

  return (
    <Page title="Описание → функция" desc="Опиши свою стратегию словами — проект соберёт Lua-функцию из стандартных приёмов zapret-antidpi.lua, профиль .bat и проверит синтаксис. Это офлайн-генератор по правилам; реальную работу проверяй через test-zapret.ps1.">
      <div className="chk-drop">
        <textarea className="chk-ta" spellCheck={false} value={desc}
          placeholder="Например: «ютуб: фейк TLS с ttl 8 и badsum, потом сплит по midsld»…"
          onChange={e => setDesc(e.target.value)} />
        <div className="chk-bar">
          <input className="bd-ta" style={{ minHeight: 0, width: 220 }} value={name} onChange={e => setName(e.target.value)} placeholder="имя функции" />
          <select className="bd-ta" style={{ minHeight: 0, width: 140 }} value={proto} onChange={e => setProto(e.target.value)}>
            <option value="auto">авто</option>
            <option value="tls">TLS/HTTPS</option>
            <option value="http">HTTP</option>
            <option value="quic">QUIC</option>
            <option value="udp">UDP</option>
          </select>
          <button onClick={() => { setDesc(""); setName("my_strategy"); }}>очистить</button>
        </div>
        <div className="chk-bar">
          {EXAMPLES.map(e => <button key={e.name} onClick={() => { setDesc(e.text); setName(e.name); }}>{e.name}</button>)}
        </div>
      </div>

      {!gen && <p className="note">Введи описание — функция сгенерируется автоматически.</p>}

      {gen && (
        <>
          <div className="chk-sum">
            <span className="chk-pill info">{gen.proto}</span>
            <span className="chk-meta">вызовы: {gen.calls.join(" → ") || "нет"}</span>
            <span className={"chk-pill " + (n.crit ? "crit" : n.warn ? "warn" : "info")}>{n.crit} крит / {n.warn} warn / {n.info} зам</span>
          </div>

          {gen.notes.length > 0 && <div className="chk-list">{gen.notes.map((x, i) => <p key={i} className="chk-fix">{x}</p>)}</div>}

          <h2>Lua-функция</h2>
          <Code label={gen.name + ".lua"} lines>{gen.code}</Code>
          <div className="chk-bar">
            <button onClick={() => save(gen.code, gen.name + ".lua")}>скачать .lua</button>
            <button onClick={() => navigator.clipboard?.writeText(gen.code)}>копировать Lua</button>
            <button onClick={toVault}>в хранилище</button>
            <button onClick={() => { setLua(gen.code); onNav?.("fixer"); }}>в исправление Lua</button>
          </div>

          {check && check.issues.length > 0 && (
            <>
              <h2>Замечания checkLua</h2>
              <div className="chk-list">
                {check.issues.map((x, i) => (
                  <article key={i} className={"chk-item " + x.level}>
                    <header><span className="chk-id">{x.id}</span><span className="chk-lv">{LV[x.level]}</span><span className="chk-line">строка {x.line}</span></header>
                    <p className="chk-msg">{x.msg}</p>
                    {x.fix && <p className="chk-fix"><b>Как исправить:</b> {x.fix}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
          {check && check.issues.length === 0 && <p className="chk-ok">Синтаксических дефектов не найдено.</p>}

          <h2>Профиль .bat</h2>
          <Code label="профиль">{gen.profile}</Code>
          <h2>Готовый .bat</h2>
          <Code label={gen.name + ".bat"} lines>{gen.bat}</Code>
          <div className="chk-bar">
            <button onClick={() => save(gen.bat, gen.name + ".bat")}>скачать .bat</button>
            <button onClick={() => navigator.clipboard?.writeText(gen.bat)}>копировать .bat</button>
            <button onClick={() => { setConfig(gen.bat); onNav?.("run"); }}>в прогон конфига</button>
            <button onClick={() => { setConfig(gen.bat); onNav?.("strategytest"); }}>в тест стратегий</button>
          </div>
        </>
      )}
    </Page>
  );
}