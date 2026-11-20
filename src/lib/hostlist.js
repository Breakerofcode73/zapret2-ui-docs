import { SERVICES } from "../data/domains";

const CAT_KW = {
  video: ["видео", "стрим", "фильм", "ролики"], msg: ["мессенджер", "связь", "звонк", "чат", "голос"],
  social: ["соцсет", "социальн"], music: ["музык", "плеер"], ai: ["ии", "нейросет", "нейронк", "ai", "gpt", "claude"],
  work: ["работ", "офис", "облак", "документ"], dev: ["разработ", "код", "программир", "git", "docker"],
  edu: ["образован", "курс", "учеб", "наук", "статьи"], news: ["новост", "медиа", "сми"],
  game: ["игр", "steam", "гейм"], torrent: ["торрент", "tracker"], other: ["почт", "vpn", "архив"]
};

export function matchServices(text) {
  const t = String(text || "").toLowerCase();
  if (/(всё|все сервисы|всех|полный список|любой)/.test(t)) return SERVICES.map(s => ({ s, score: 1 }));
  const hits = [];
  SERVICES.forEach(s => {
    let score = 0;
    s.kw.forEach(k => { if (t.includes(k)) score += k.length >= 4 ? 2 : 1; });
    if (t.includes(s.title.toLowerCase())) score += 2;
    if (score) hits.push({ s, score });
  });
  const cats = Object.keys(CAT_KW).filter(c => CAT_KW[c].some(k => t.includes(k)));
  cats.forEach(c => SERVICES.forEach(s => {
    if (s.cat === c && !hits.some(h => h.s.id === s.id)) hits.push({ s, score: 1 });
  }));
  return hits.sort((a, b) => b.score - a.score);
}

export function buildList(services, custom = "") {
  const set = new Set();
  services.forEach(s => s.domains.forEach(d => set.add(d.toLowerCase().trim())));
  custom.split(/[\s,;]+/).forEach(d => {
    d = d.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) set.add(d);
  });
  return [...set].sort();
}

export function patchConfig(text, name = "list.txt") {
  const flag = `--hostlist="%~dp0${name}"`;
  if (text.includes(flag)) return { text, added: 0 };
  const lines = text.split(/\r?\n/);
  const res = []; let added = 0, pending = false, sawCmd = false;
  const insert = () => {
    if (!pending) return;
    const prev = res[res.length - 1] || "";
    if (/\^\s*$/.test(prev)) res.push(" " + flag + " ^");
    else if (prev.trim()) res[res.length - 1] = prev.replace(/\s+$/, "") + " " + flag;
    else res.push(flag);
    added++; pending = false;
  };
  for (const line of lines) {
    if (/--lua-desync/i.test(line) || /--new\b/i.test(line)) insert();
    res.push(line);
    if (/winws2|nfqws2/i.test(line)) { sawCmd = true; pending = true; }
    if (/--new\b/i.test(line)) pending = true;
  }
  insert();
  return { text: res.join("\n"), added: sawCmd ? added : 0 };
}