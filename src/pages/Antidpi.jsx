import Page from "../components/Page";
import Fn, { Jump } from "../components/Fn";

export const fns = [
  { name: "drop", kind: "desync", ru: "Дропает пакет.", std: "direction, payload (по умолчанию all)", ex: "--lua-desync=drop:dir=any" },
  { name: "send", kind: "desync", old: "nfqws1 --dup", ru: "Отправляет копию пакета с fooling, оригинал не трогает. delay — отложенно через таймер.", args: [["delay", "мс, отложенная отправка"]], std: "direction, fooling, ip_id, ipfrag, rawsend, reconstruct", ex: "--lua-desync=send:repeats=2:ip_ttl=6" },
  { name: "pktmod", kind: "desync", old: "nfqws1 --orig", ru: "Применяет fooling/ip_id к текущему пакету, VERDICT_MODIFY.", std: "direction, fooling, ip_id", ex: "--lua-desync=pktmod:tcp_seq=-1" },
  { name: "http_domcase", kind: "desync", old: "--domcase", ru: "Чередующийся регистр Host. Только http_req.", std: "direction" },
  { name: "http_hostcase", kind: "desync", old: "--hostcase", ru: "Меняет написание заголовка Host.", args: [["spell", "ровно 4 буквы"]], std: "direction", ex: "--lua-desync=http_hostcase:spell=HoSt" },
  { name: "http_methodeol", kind: "desync", old: "--methodeol", ru: "Манипуляция с переводом строки вокруг User-Agent. Ставить ПОСЛЕДНИМ среди http-функций.", std: "direction" },
  { name: "http_unixeol", kind: "desync", old: "tpws --unixeol", ru: "CRLF → LF с сохранением длины (добивка пробелами в UA).", std: "direction" },
  { name: "wsize", kind: "desync", old: "--wsize", ru: "Меняет window size в SYN,ACK.", args: [["wsize", "размер окна"], ["scale", "scale factor"]], ex: "--lua-desync=wsize:wsize=4096" },
  { name: "wssize", kind: "desync", old: "--wssize", ru: "Меняет окно во всех пакетах до первого пейлоада. Снижает скорость, не работает с хостлистами.", args: [["wsize", ""], ["scale", ""], ["forced_cutoff", "список пейлоадов для cutoff"]], std: "direction" },
  { name: "tls_client_hello_clone", kind: "desync", ru: "Клонирует ClientHello в desync.<blob> с модификациями SNI — данные для следующих инстансов.", args: [["blob", "куда сохранить (обязателен)"], ["fallback", "блоб если не удалось"], ["sni_first / sni_last", "добавить имя"], ["sni_del / sni_del_ext", "удалить имена/расширение"]], std: "direction", ex: "--lua-desync=tls_client_hello_clone:blob=hello:sni_first=example.com" },
  { name: "syndata", kind: "desync", old: "--dpi-desync=syndata", ru: "Данные внутри SYN (по умолчанию 16 нулей). Должны влезть в один пакет.", args: [["blob", "фейковый пейлоад"], ["tls_mod", "rnd,rndsni,sni=…"]], std: "fooling, rawsend, reconstruct, ipfrag" },
  { name: "rst", kind: "desync", old: "--dpi-desync=rst", ru: "Шлёт RST (или RST,ACK) с fooling перед оригиналом.", args: [["rstack", "RST,ACK вместо RST"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=rst:rstack:ip_ttl=6" },
  { name: "fake", kind: "desync", old: "--dpi-desync=fake", ru: "Главная функция: фейковый пейлоад перед реальным, авто-сегментация, оригинал проходит.", args: [["blob", "обязателен"], ["optional", "пропустить если блоба нет"], ["tls_mod", "rnd,rndsni,sni=,dupsid,padencap"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=fake:blob=fake_default_tls:tcp_md5:tls_mod=rnd,rndsni,dupsid" },
  { name: "multisplit", kind: "desync", old: "--dpi-desync=multisplit", ru: "Режет пейлоад по маркерам pos, шлёт по порядку; seqovl — перекрытие sequence первым сегментом.", args: [["pos", "список маркеров"], ["seqovl", "N байт перекрытия"], ["seqovl_pattern", "блоб-заполнитель"], ["blob", "данные вместо payload"], ["nodrop", "не дропать оригинал"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=multisplit:pos=1:seqovl=5:seqovl_pattern=0x1603030000" },
  { name: "multidisorder", kind: "desync", old: "--dpi-desync=multidisorder", ru: "Как multisplit, но части в обратном порядке; seqovl здесь — маркер (< первой точки реза).", args: [["pos", ""], ["seqovl", "маркер"], ["seqovl_pattern", ""], ["blob", ""], ["nodrop", ""]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=multidisorder:pos=1,host,midsld+1" },
  { name: "multidisorder_legacy", kind: "desync", ru: "Порядок сегментов 1-в-1 как в nfqws1: по каждому пакету, позиции нормализуются в его диапазон.", args: [["pos", ""], ["seqovl", ""], ["seqovl_pattern", ""]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag" },
  { name: "fakedsplit", kind: "desync", old: "--dpi-desync=fakedsplit", ru: "fake1-real1-fake1-fake2-real2-fake2; fooling только к фейкам.", args: [["pos", "маркер реза"], ["nofake1..4", "отключить фейки"], ["pattern", "заполнитель фейков"], ["seqovl", "N"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct", ex: "--payload=http_req --lua-desync=fakedsplit:pos=host" },
  { name: "fakeddisorder", kind: "desync", old: "--dpi-desync=fakeddisorder", ru: "Как fakedsplit, но вторая половина первой.", args: [["pos", ""], ["nofake1..4", ""], ["pattern", ""], ["seqovl", "маркер < pos"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct", ex: "--payload=http_req --lua-desync=fakeddisorder:pos=host" },
  { name: "hostfakesplit", kind: "desync", old: "--dpi-desync=hostfakesplit", ru: "before_host → фейковый host → реальный host → фейк → after_host; fooling только к фейкам.", args: [["host", "шаблон, напр. vk.com"], ["midhost", "доп. рез внутри host"], ["nofake1/2", ""], ["disorder_after", "маркер; пусто = -1"]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct", ex: "--lua-desync=hostfakesplit:host=vk.com:midhost=midsld" },
  { name: "tcpseg", kind: "desync", ru: "Отправляет только диапазон пейлоада (ровно 2 маркера).", args: [["pos", "start,end (обязателен)"], ["seqovl", "N"], ["blob", ""]], std: "direction, payload, fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=tcpseg:pos=host,endhost" },
  { name: "oob", kind: "desync", ru: "OOB-байт (URG): длящаяся десинхронизация с самого SYN. Несовместим с multisplit и ко; нужен перехват с начала соединения.", args: [["char", "символ OOB"], ["byte", "байт OOB"], ["urp", "маркер, b|e"]], std: "fooling, ip_id, rawsend, reconstruct, ipfrag", ex: "--lua-desync=oob:char=!" },
  { name: "udplen", kind: "desync", old: "--dpi-desync=udplen", ru: "Меняет длину UDP-пейлоада на ±increment, заполняет pattern.", args: [["min / max", "границы длины"], ["increment", "по умолчанию 2"], ["pattern", ""], ["pattern_offset", ""]], std: "direction, payload", ex: "--lua-desync=udplen:increment=2" },
  { name: "dht_dn", kind: "desync", old: "--dpi-desync=tamper", ru: "'d1:' → 'dN:' в DHT без поломки bencode. Только payload dht.", args: [["dn", "N, по умолчанию 3"]], std: "direction", ex: "--lua-desync=dht_dn:dn=3" },
  { name: "synack", kind: "desync", old: "--dpi-desync=synack", ru: "SYN,ACK перед SYN (TCB turnaround). Ломает NAT.", std: "rawsend, reconstruct, ipfrag" },
  { name: "synack_split", kind: "desync", old: "--synack-split", ru: "Для сервера: SYN,ACK → SYN / SYN+ACK / ACK+SYN (TCP split handshake).", args: [["mode", "syn|synack|acksyn"]], std: "rawsend, reconstruct, ipfrag", ex: "--lua-desync=synack_split:mode=acksyn" },
  { name: "multidisorder_send", kind: "helper", ru: "Внутренняя: отправка частей в обратном порядке. Не вызывать напрямую." },
  { name: "pos_normalize", kind: "helper", ru: "Внутренняя: позиция в диапазон [low,hi)." },
  { name: "pos_array_normalize", kind: "helper", ru: "Внутренняя: нормализация массива позиций." },
  { name: "send_timer_delayed", kind: "timer", ru: "Внутренняя: callback таймера для send:delay." }
];

export default function Antidpi() {
  return (
    <Page title="zapret-antidpi.lua" desc="Готовые программы атаки на DPI. Каждая — desync-функция с стандартными аргументами.">
      <Jump fns={fns} />
      {fns.map(f => <Fn key={f.name} {...f} />)}
    </Page>
  );
}