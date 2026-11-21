import Page from "../components/Page";
import Fn, { Jump } from "../components/Fn";

const RAW = [
  ["luaexec", "Выполняет код из arg code; desync — глобальная. Эксперименты без файла.", "desync"],
  ["pass", "Ничего не делает, логирует вызов.", "desync"],
  ["pktdebug", "Печатает всю таблицу desync — главный инструмент изучения пакета.", "desync"],
  ["argdebug", "Печатает аргументы инстанса.", "desync"],
  ["posdebug", "Позиции conntrack (n,d,b,s,p) в обе стороны.", "desync"],
  ["var_debug", "Рекурсивный дамп переменной в DLOG."],
  ["deepcopy", "Глубокая копия таблицы — обязательна перед модификацией копии диссекта."],
  ["blob", "Достаёт блоб: 0xHEX, поле desync, глобальная; 3-й аргумент — default."],
  ["blob_exist", "Существует ли блоб (для optional)."],
  ["blob_or_def", "Как blob, но без error если не найден."],
  ["pattern", "Повторяет pattern до N байт со смещения (1-based)."],
  ["hex", "Blob → hex-строка."],
  ["hexdump_dlog", "Hex-дамп для лога, обрезка по HEXDUMP_DLOG_MAX."],
  ["direction_check", "Фильтр dir=in|out|any (по умолчанию out)."],
  ["payload_check", "Фильтр по типам пейлоада (по умолчанию непустые known)."],
  ["direction_cutoff_opposite", "Отключает инстанс для противоположного направления."],
  ["instance_cutoff_shim", "Обёртка instance_cutoff с учётом оркестрации — используй её."],
  ["apply_fooling", "Стандартное fooling к dis или desync.dis."],
  ["apply_ip_id", "ip_id: seq|rnd|zero|none."],
  ["desync_opts", "Собирает opts (rawsend/reconstruct/ipfrag/ipid/fooling) из arg."],
  ["rawsend_dissect_ipfrag", "Реконструкция + IP-фрагментация + отсылка."],
  ["rawsend_dissect_segmented", "Отсылка диссекта с авто TCP-сегментацией по MSS."],
  ["rawsend_payload_segmented", "Отсылка пейлоада с сегментацией; сдвиг seq для seqovl."],
  ["replay_first", "true на первой части replay (или без replay)."],
  ["replay_drop_set", "Пометить последующие части replay на дроп."],
  ["replay_drop", "Дропать ли текущую часть replay."],
  ["pos_get", "Позиция потока n|d|b|s|p, прямо/реверс."],
  ["zero_based_pos", "1-based → 0-based для логов."],
  ["delete_pos_1", "Убирает позицию 1: резать по первому байту нельзя."],
  ["genhost", "Hostname по шаблону со случайными метками."],
  ["desync_timer_name", "Уникальное имя таймера инстанса."],
  ["orchestrate", "Базовый оркестратор: выполняет план инстансов."],
  ["in_list", "Есть ли значение в списке через запятую."],
  ["array_field_search", "Поиск в массиве таблиц по полю."],
  ["http_dissect_req", "Разбор http-запроса → таблица."],
  ["http_reconstruct_req", "Сборка http-запроса из таблицы."],
  ["tls_client_hello_mod", "Модификации ClientHello (SNI и др.)."],
  ["wsize_rewrite", "Переписывает window size/scale."],
  ["ipfrag2", "IP-фрагментация на 2 части по ipfrag_pos_*."]
];

export const fns = RAW.map(([name, ru, kind]) => ({ name, ru, kind: kind || "helper" }));

export default function Lib() {
  return (
    <Page title="zapret-lib.lua" desc="Хелперы, на которых стоят все стратегии: блобы, отсылка, фильтры, replay, позиции.">
      <Jump fns={fns} />
      {fns.map(f => <Fn key={f.name} {...f} />)}
    </Page>
  );
}