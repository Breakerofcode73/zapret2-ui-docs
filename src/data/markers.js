// certainty: verified — встречено в исходниках antidpi; config — встречено в рабочем tests.txt; manual — только по мануалу.
export const MARKERS = [
  { name: "N", proto: "любой", meaning: "Абсолютная позиция от начала пейлоада, 1-based.", certainty: "verified", ex: "pos=1" },
  { name: "-N", proto: "любой", meaning: "Позиция от конца пейлоада.", certainty: "verified", ex: "pos=-10" },
  { name: "host", proto: "http, tls", meaning: "Начало имени хоста: заголовок Host в http, значение SNI в tls.", certainty: "verified", ex: "pos=host" },
  { name: "endhost", proto: "http, tls", meaning: "Граница за последним символом имени хоста. В hostfakesplit диапазон задают как host,endhost-1.", certainty: "verified", ex: "pos=host,endhost-1" },
  { name: "midsld", proto: "http, tls", meaning: "Середина домена второго уровня — точка внутри имени, ломающая сигнатуру по offset.", certainty: "verified", ex: "pos=midsld" },
  { name: "sniext", proto: "tls", meaning: "Начало расширения SNI в ClientHello — раньше самого имени. В твоём конфиге используется sniext+1.", certainty: "config", ex: "pos=1,sniext+1,host+1" },
  { name: "±N", proto: "любой", meaning: "Арифметика поверх любого маркера: сдвиг на N байт вперёд или назад.", certainty: "verified", ex: "midsld-2, midsld+2, endhost-1" },
  { name: "список", proto: "любой", meaning: "Маркеры через запятую — несколько точек реза для multisplit/multidisorder.", certainty: "verified", ex: "1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1" }
];

export const RULES = [
  ["1-based", "resolve_pos / resolve_multi_pos / resolve_range возвращают Lua-индексы с 1. Для сдвига sequence в rawsend_payload_segmented нужно pos-1."],
  ["Нельзя резать по 1", "delete_pos_1 убирает позицию 1 из списка: первая часть получилась бы пустой."],
  ["nil — не ошибка", "resolve_pos и resolve_multi_pos возвращают nil, если маркер не найден. Это штатная ветка, обработай её."],
  ["range может бросить error", "resolve_range при неразрешимых маркерах вызывает error — только через pcall."],
  ["Протокол важен", "Один и тот же host в http и tls даёт разные смещения: передавай desync.l7payload, а не константу."],
  ["Порядок точек", "После разрешения список может быть не отсортирован; multisplit обходит его как есть."]
];

export function parseMarkerList(str) {
  return String(str || "").split(",").map(s => s.trim()).filter(Boolean).map(raw => {
    const m = raw.match(/^(-?\d+|[A-Za-z_]\w*)\s*([+-]\s*\d+)?$/);
    if (!m) return { raw, base: raw, delta: 0, known: false, bad: true };
    const base = m[1];
    const delta = m[2] ? parseInt(m[2].replace(/\s+/g, ""), 10) : 0;
    const numeric = /^-?\d+$/.test(base);
    const known = numeric || MARKERS.some(k => k.name === base);
    return { raw, base, delta, known, numeric };
  });
}