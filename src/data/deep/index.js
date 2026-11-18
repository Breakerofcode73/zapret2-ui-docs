import { fake, multisplit, multidisorder, fakedsplit, fakeddisorder, hostfakesplit } from "./antidpi";
import { drop, send, pktmod, rst, syndata, tls_client_hello_clone, multidisorder_legacy, tcpseg, oob,
  udplen, dht_dn, synack, synack_split, wsize, wssize, http_domcase, http_hostcase,
  http_methodeol, http_unixeol } from "./antidpi2";
import { blob, apply_fooling, rawsend_payload_segmented, replay_first } from "./lib";
import { resolve_pos, u32add, pton } from "./capi";
import { fake_ip_misdirection, outline_random_split } from "./custom";

export const DEEP_GROUPS = {
  "Базовые desync-функции": ["drop", "send", "pktmod"],
  "Фейки и подготовка": ["fake", "syndata", "tls_client_hello_clone", "rst"],
  "TCP-сегментация": ["multisplit", "multidisorder", "multidisorder_legacy", "fakedsplit", "fakeddisorder", "hostfakesplit", "tcpseg", "oob"],
  "Дурение HTTP": ["http_hostcase", "http_domcase", "http_unixeol", "http_methodeol"],
  "Window size": ["wsize", "wssize"],
  "Handshake": ["synack", "synack_split"],
  "Дурение UDP": ["udplen", "dht_dn"],
  "Хелперы zapret-lib": ["blob", "apply_fooling", "rawsend_payload_segmented", "replay_first"],
  "C API": ["resolve_pos", "u32add", "pton"],
  "Твои функции": ["fake_ip_misdirection", "outline_random_split"]
};

export const DEEP = [
  drop, send, pktmod, fake, syndata, tls_client_hello_clone, rst,
  multisplit, multidisorder, multidisorder_legacy, fakedsplit, fakeddisorder, hostfakesplit, tcpseg, oob,
  http_hostcase, http_domcase, http_unixeol, http_methodeol,
  wsize, wssize, synack, synack_split, udplen, dht_dn,
  blob, apply_fooling, rawsend_payload_segmented, replay_first,
  resolve_pos, u32add, pton,
  fake_ip_misdirection, outline_random_split
];

export const byId = Object.fromEntries(DEEP.map(e => [e.id, e]));

// какие ещё имена покрывает разбор (составные страницы)
export const COVERS = {
  resolve_pos: ["resolve_pos", "resolve_multi_pos", "resolve_range"],
  replay_first: ["replay_first", "replay_drop", "replay_drop_set"],
  pton: ["pton", "ntop"],
  u32add: ["u32add", "u32", "bu32", "brandom"],
  blob: ["blob", "blob_exist", "blob_or_def"],
  apply_fooling: ["apply_fooling", "apply_ip_id"],
  rawsend_payload_segmented: ["rawsend_payload_segmented", "rawsend_dissect_segmented", "rawsend_dissect_ipfrag"],
  multidisorder: ["multidisorder", "multidisorder_send"],
  send: ["send", "send_timer_delayed"],
  multisplit: ["multisplit", "delete_pos_1", "pattern"],
  hostfakesplit: ["hostfakesplit", "genhost"],
  http_hostcase: ["http_hostcase", "http_dissect_req", "array_field_search"],
  http_unixeol: ["http_unixeol", "http_reconstruct_req"],
  tls_client_hello_clone: ["tls_client_hello_clone", "tls_client_hello_mod"],
  wsize: ["wsize", "wsize_rewrite"],
  oob: ["oob", "pos_get"]
};

export const coveredNames = new Set(DEEP.flatMap(e => COVERS[e.id] || [e.id]));
export const deepIndex = Object.fromEntries(DEEP.map((e, i) => [e.id, i]));