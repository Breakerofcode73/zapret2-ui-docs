import Page from "../components/Page";

export default function Checklist() {
  return (
    <Page title="Чеклист: 14 типичных ошибок" desc="Пройди перед запуском своей функции.">
      <ol className="check">
        <li><b>Аргументы — строки.</b> <code>tonumber()</code> обязателен; сравнение строки с числом — ошибка Lua.</li>
        <li><b>Флаг ≠ false.</b> <code>:optional=false</code> — truthy-строка. Выключить = не передавать аргумент.</li>
        <li><b>nil-проверки.</b> dis.tcp/udp/icmp и track могут отсутствовать; reasm_data — только у многопакетных.</li>
        <li><b>IPv4 ≠ IPv6.</b> ip_ttl vs ip6_hlim; обращение к nil-полю падает.</li>
        <li><b>Вердикты — константами.</b> Не числами; забытый return = nil = PASS.</li>
        <li><b>error() — только для ошибок программиста.</b> Инстанс прервётся, «desync ERR» в логе, пакет пройдёт. Ожидаемое — DLOG + return.</li>
        <li><b>Replay.</b> Действуй на replay_first, после отправки reasm — replay_drop_set, иначе дубли.</li>
        <li><b>Cutoff.</b> Одноразовая функция без cutoff = Lua на каждом пакете = нагрузка. Но не на связанных icmp.</li>
        <li><b>deepcopy.</b> Копию меняешь — deepcopy; сам desync.dis — это оригинал, нужен MODIFY.</li>
        <li><b>1-based.</b> Строки и resolve_pos с 1; сетевые смещения в мануале с 0; резать по позиции 1 нельзя.</li>
        <li><b>Сегментация.</b> Не собирай TCP-сегменты вручную — rawsend_*_segmented учтут MSS/MTU.</li>
        <li><b>Блобы.</b> Нет блоба — error. Для опциональных: blob_exist + optional, либо blob_or_def.</li>
        <li><b>Совместимость.</b> NFQWS2_COMPAT_VER; тяжёлый DLOG — под <code>if b_debug then</code>.</li>
        <li><b>Порядок.</b> http_methodeol — последним; oob несовместим с multisplit; фильтры действуют на последующие инстансы.</li>
      </ol>
    </Page>
  );
}