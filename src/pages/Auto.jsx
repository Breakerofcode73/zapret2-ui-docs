import Page from "../components/Page";
import Fn, { Jump } from "../components/Fn";
import Code from "../components/Code";

export const fns = [
  { name: "automate_conn_record", kind: "helper", ru: "Хранилище состояния автоматизации, привязанное к потоку." },
  { name: "standard_hostkey", kind: "helper", ru: "Ключ по hostname (или IP). arg: reqhost, nld." },
  { name: "automate_host_record", kind: "helper", ru: "Хранилище по хосту: autostate[key][hostkey]." },
  { name: "automate_failure_counter", kind: "helper", ru: "Счётчик неудач: true при fails, сброс по maxtime." },
  { name: "automate_failure_counter_reset", kind: "helper", ru: "Сброс счётчика." },
  { name: "automate_failure_check", kind: "helper", ru: "Ведёт счётчик через детекторы. arg: success_detector, failure_detector, fails=3, time=60." },
  { name: "standard_success_detector", kind: "helper", ru: "Удача: много исходящих (maxseq=32768) и входящих (inseq=4096) данных." },
  { name: "standard_failure_detector", kind: "helper", ru: "Неудача: ретрансмиссии (retrans=3), RST или http-редирект DPI." },
  { name: "circular", kind: "desync", ru: "Меняет стратегии по кругу при накоплении неудач. Инстансы маркируются strategy=N, последняя — final.", ex: "--lua-desync=circular:fails=4 --lua-desync=fake:blob=fake_default_tls:strategy=1 --lua-desync=multisplit:pos=2:strategy=2:final" },
  { name: "repeater", kind: "desync", ru: "Повторяет ближайшие instances инстансов repeats раз (1-2-3-1-2-3…).", args: [["instances", "сколько повторять"], ["repeats", "число повторов"], ["stop / clear", "не играть хвост / очистить план"], ["iff / neg", "условие продолжения"]] },
  { name: "condition", kind: "desync", ru: "Выполняет следующие инстансы, если iff вернула true (neg инвертирует).", args: [["iff", "имя функции"], ["neg", ""], ["instances", "сколько, по умолчанию все"]], ex: "--lua-desync=condition:iff=cond_payload_str:pattern=GET --lua-desync=multisplit:pos=2" },
  { name: "per_instance_condition", kind: "desync", ru: "Каждый следующий инстанс — только при своём cond=iff_func (cond_neg инвертирует)." },
  { name: "stopif", kind: "desync", ru: "Очищает план если iff true. Полезен вложенным в circular." },
  { name: "cond_true", kind: "iff", ru: "Всегда true." },
  { name: "cond_false", kind: "iff", ru: "Всегда false." },
  { name: "cond_random", kind: "iff", ru: "true с вероятностью percent (50)." },
  { name: "cond_payload_str", kind: "iff", ru: "Подстрока pattern в пейлоаде — простейший сигнатурный детектор." },
  { name: "cond_tcp_has_ts", kind: "iff", ru: "tcp и есть timestamp option." },
  { name: "cond_lua", kind: "iff", ru: "Код из cond_code; результат через return." }
];

export default function Auto() {
  return (
    <Page title="zapret-auto.lua" desc="Оркестрация: управляющая логика отдельно от логики действий. Ничего не патчить — только программировать сценарий.">
      <Jump fns={fns} />
      {fns.map(f => <Fn key={f.name} {...f} />)}
      <h2>Своё условие</h2>
      <Code>{`function cond_long_payload(desync)
    return #desync.dis.payload > 100
end`}</Code>
    </Page>
  );
}