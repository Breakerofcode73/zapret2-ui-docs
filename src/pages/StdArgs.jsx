import Page from "../components/Page";
import Code from "../components/Code";

export default function StdArgs() {
  return (
    <Page title="Стандартные аргументы" desc="Их понимает большинство desync-функций; в своей функции поддерживай через хелперы.">
      <table className="tbl"><tbody>
        <tr><td><b>direction</b></td><td>dir=in|out|any</td></tr>
        <tr><td><b>fooling</b></td><td>ip_ttl, ip6_ttl, ip_autottl=delta,min-max, ip6_autottl; ip6_hopbyhop[2], ip6_destopt[2], ip6_routing, ip6_ah; tcp_seq, tcp_ack, tcp_ts, tcp_md5[=hex], tcp_flags_set/unset, tcp_ts_up, tcp_nop_del; fool=своя_функция</td></tr>
        <tr><td><b>reconstruct</b></td><td>badsum — невалидная L4-сумма</td></tr>
        <tr><td><b>rawsend</b></td><td>repeats=N, ifout, fwmark</td></tr>
        <tr><td><b>payload</b></td><td>список типов (по умолчанию непустые known)</td></tr>
        <tr><td><b>ip_id</b></td><td>seq|rnd|zero|none; ip_id_conn</td></tr>
        <tr><td><b>ipfrag</b></td><td>ipfrag[=func] (默认 ipfrag2), ipfrag_disorder, ipfrag_pos_tcp=32, ipfrag_pos_udp=8, ipfrag_pos_icmp=8, ipfrag_pos=32 (кратны 8), ipfrag_next</td></tr>
      </tbody></table>
      <Code copy={false}>{`direction_check(desync)      -- dir
payload_check(desync)        -- payload
apply_fooling(desync, dis)   -- fooling
apply_ip_id(desync, dis)     -- ip_id
desync_opts(desync)          -- opts для функций отсылки`}</Code>
    </Page>
  );
}