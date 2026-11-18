import { useEffect, useMemo, useRef, useState } from "react";
import Overview from "./pages/Overview";
import Contract from "./pages/Contract";
import Writing from "./pages/Writing";
import Anatomy from "./pages/Anatomy";
import Checklist from "./pages/Checklist";
import Debugging from "./pages/Debugging";
import StdArgs from "./pages/StdArgs";
import Blobs from "./pages/Blobs";
import Markers from "./pages/Markers";
import Coverage from "./pages/Coverage";
import Builder from "./pages/Builder";
import Diagnose from "./pages/Diagnose";
import Fixer from "./pages/Fixer";
import UpdateDiff from "./pages/UpdateDiff";
import Vault from "./pages/Vault";
import History from "./pages/History";
import RunConfig from "./pages/RunConfig";
import MyApi from "./pages/MyApi";
import Idea from "./pages/Idea";
import Dedup from "./pages/Dedup";
import DeepIndex from "./pages/DeepIndex";
import DeepRoute from "./pages/DeepRoute";
import CApi, { fns as capiFns } from "./pages/CApi";
import Antidpi, { fns as antidpiFns } from "./pages/Antidpi";
import Lib, { fns as libFns } from "./pages/Lib";
import Auto, { fns as autoFns } from "./pages/Auto";
import Assistant from "./pages/Assistant";
import { KIND } from "./components/Fn";
import { DEEP, coveredNames } from "./data/deep";
import { subscribe } from "./lib/vault";
import { collectMy } from "./lib/myDoc";
import "./styles/print.css";

const PAGES = [
  { id: "assistant", group: "Мои функции", title: "Локальный ассистент", C: Assistant },
  { id: "overview", group: "Начало", title: "Обзор и архитектура", C: Overview },
  { id: "contract", group: "Начало", title: "Контракт desync-функции", C: Contract },
  { id: "writing", group: "Начало", title: "Своя функция", C: Writing },
  { id: "anatomy", group: "Начало", title: "Как читать и писать", C: Anatomy },
  { id: "deep", group: "Разборы", title: "Полные разборы", C: DeepIndex },
  { id: "coverage", group: "Разборы", title: "Карта покрытия", C: Coverage },
  { id: "idea", group: "Мои функции", title: "Идея → функция", C: Idea },
  { id: "myapi", group: "Мои функции", title: "Мои функции → Lua", C: MyApi },
  { id: "vault", group: "Мои функции", title: "Хранилище функций", C: Vault },
  { id: "dedup", group: "Мои функции", title: "Объединение похожих", C: Dedup },
  { id: "history", group: "Мои функции", title: "История версий", C: History },
  { id: "run", group: "Мои функции", title: "Прогон конфига", C: RunConfig },
  { id: "builder", group: "Практика", title: "Конструктор функции", C: Builder },
  { id: "diagnose", group: "Практика", title: "Проверка ошибок", C: Diagnose },
  { id: "fixer", group: "Практика", title: "Исправление ошибок", C: Fixer },
  { id: "update", group: "Практика", title: "Обновление движка", C: UpdateDiff },
  { id: "checklist", group: "Практика", title: "Чеклист ошибок", C: Checklist },
  { id: "debugging", group: "Практика", title: "Отладка", C: Debugging },
  { id: "stdargs", group: "Практика", title: "Стандартные аргументы", C: StdArgs },
  { id: "blobs", group: "Практика", title: "Блобы и свои данные", C: Blobs },
  { id: "markers", group: "Практика", title: "Маркеры позиций", C: Markers },
  { id: "capi", group: "Справочник", title: "C API → Lua", C: CApi, fns: capiFns },
  { id: "antidpi", group: "Справочник", title: "zapret-antidpi.lua", C: Antidpi, fns: antidpiFns },
  { id: "lib", group: "Справочник", title: "zapret-lib.lua", C: Lib, fns: libFns },
  { id: "auto", group: "Справочник", title: "zapret-auto.lua", C: Auto, fns: autoFns }
];
const GROUPS = ["Начало", "Разборы", "Мои функции", "Практика", "Справочник"];
const TOTAL = [...capiFns, ...antidpiFns, ...libFns, ...autoFns].length;

const readHash = () => {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (raw.startsWith("deep/")) return { page: "deep", deep: raw.slice(5) };
  return { page: PAGES.some(p => p.id === raw) ? raw : "overview", deep: null };
};

export default function App() {
  const [route, setRoute] = useState(readHash);
  const [target, setTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [vv, setVv] = useState(0);
  const searchRef = useRef(null);
  const sideRef = useRef(null);
  const { page, deep } = route;

  useEffect(() => subscribe(() => setVv(v => v + 1)), []);
  useEffect(() => {
    const onHash = () => {
      const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
      if (raw.startsWith("sec-") || raw.startsWith("fn-") || raw.startsWith("grp-") || raw === "main") return;
      setRoute(readHash()); setTarget(null);
    };
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setQuery(""); setOpen(false); }
      if (e.key === "Tab" && open && sideRef.current) {
        const f = sideRef.current.querySelectorAll("button, input, a[href], select");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (target) requestAnimationFrame(() => document.getElementById("fn-" + target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    else window.scrollTo({ top: 0 });
  }, [page, deep, target]);

  const navigate = (id, t = null) => {
    setQuery(""); setOpen(false); setTarget(t);
    location.hash = "/" + id;
    setRoute(id.startsWith("deep/") ? { page: "deep", deep: id.slice(5) } : { page: id, deep: null });
  };

  const index = useMemo(() => {
    const fns = PAGES.flatMap(p => (p.fns || []).map(f => ({
      ...f, page: DEEP.some(d => d.id === f.name) ? "deep/" + f.name : p.id,
      pageTitle: p.title, deep: coveredNames.has(f.name)
    })));
    const deeps = DEEP.map(e => ({ name: e.id, ru: e.lead, kind: e.kind === "custom" ? "desync" : e.kind, page: "deep/" + e.id, pageTitle: "полный разбор", deep: true }));
    const mine = collectMy().records.map(r => ({ name: r.name, ru: r.mech, kind: "custom", page: "myapi", pageTitle: r.file, deep: false }));
    const seen = new Set();
    return [...mine, ...deeps, ...fns].filter(x => { const k = x.page + x.name; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [vv]);

  const q = query.trim().toLowerCase();
  const hits = q.length >= 2
    ? index.filter(x => (x.name + " " + (x.ru || "")).toLowerCase().includes(q))
        .sort((a, b) => (b.name.toLowerCase().startsWith(q) ? 1 : 0) - (a.name.toLowerCase().startsWith(q) ? 1 : 0) || (b.deep ? 1 : 0) - (a.deep ? 1 : 0))
        .slice(0, 60)
    : [];

  const cur = PAGES.find(p => p.id === page) || PAGES[0];
  const i = PAGES.indexOf(cur);
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  const CurC = cur.C;
  const myCount = useMemo(() => collectMy().records.length, [vv]);

  return (
    <>
      <a className="skip" href="#main">К содержимому</a>
      <div className="bg" aria-hidden="true"><div className="bg-glow" /><div className="bg-grid" /><div className="bg-grain" /></div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={"side" + (open ? " open" : "")} ref={sideRef} aria-label="Навигация по документации">
        <div className="brand" onClick={() => navigate("overview")}>
          <span className="brand-mark">⚡</span> zapret2 <em>v1.0.7</em>
        </div>
        <input ref={searchRef} className="search" placeholder="Поиск функций…  Ctrl+K" aria-label="Поиск"
          value={query} onChange={e => setQuery(e.target.value)} />
        {q.length >= 2 ? (
          <div className="results">
            <div className="count">{hits.length} совпадений</div>
            {hits.map(h => (
              <button key={h.page + h.name} className="result" onClick={() => navigate(h.page, h.page.startsWith("deep/") ? null : h.name)}>
                <span className={"tag " + (h.deep ? "desync" : h.kind)}>{h.deep ? "разбор" : KIND[h.kind] || h.kind}</span>
                <span className="r-name">{h.name}</span>
                <span className="r-page">{h.pageTitle}</span>
              </button>
            ))}
            {hits.length === 0 && <p className="count">Ничего не найдено.</p>}
          </div>
        ) : (
          <nav>
            {GROUPS.map(g => (
              <div key={g}>
                <div className="nav-sec">{g}</div>
                {PAGES.filter(p => p.group === g).map(p => (
                  <button key={p.id} className={"nav-item" + (p.id === page ? " active" : "")}
                    aria-current={p.id === page ? "page" : undefined} onClick={() => navigate(p.id)}>
                    {p.title}
                    {p.fns && <span className="nav-count">{p.fns.length}</span>}
                    {p.id === "deep" && <span className="nav-count">{DEEP.length}</span>}
                    {p.id === "coverage" && <span className="nav-count">{TOTAL}</span>}
                    {p.id === "myapi" && <span className="nav-count">{myCount}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>
      <div className="main">
        <header className="top">
          <button className="burger" onClick={() => setOpen(v => !v)} aria-label="Меню" aria-expanded={open}>☰</button>
          <div className="crumb"><span>{cur.group}</span> / {deep ? "Разбор: " + deep : cur.title}</div>
          <div className="top-right">
            <button className="vt-btn" onClick={() => navigator.clipboard?.writeText(location.href)}>ссылка</button>
            <button className="vt-btn" onClick={() => window.print()}>печать</button>
            <kbd>Ctrl K</kbd><span className="ver">v1.0.7</span>
          </div>
        </header>
        <main className="content" id="main" key={page + (deep || "")}>
          {page === "deep" && deep ? <DeepRoute id={deep} onNav={navigate} /> : <CurC onNav={navigate} target={target} />}
          <div className="pager">
            {prev ? <button onClick={() => navigate(prev.id)}>← {prev.title}</button> : <span />}
            {next ? <button onClick={() => navigate(next.id)}>{next.title} →</button> : <span />}
          </div>
        </main>
      </div>
    </>
  );
}