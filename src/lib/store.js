let lua = "";
export const setLua = v => { lua = v; };
export const getLua = () => lua;

const CKEY = "z2config:v1";
export function setConfig(text) {
  try { localStorage.setItem(CKEY, text); } catch {}
  window.dispatchEvent(new Event("z2config"));
}
export function getConfig() { try { return localStorage.getItem(CKEY) || ""; } catch { return ""; } }
export function onConfig(fn) { window.addEventListener("z2config", fn); return () => window.removeEventListener("z2config", fn); }