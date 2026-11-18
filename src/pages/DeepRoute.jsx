import DeepDoc from "../components/DeepDoc";
import { byId, DEEP, deepIndex } from "../data/deep";

export default function DeepRoute({ id, onNav }) {
  const e = byId[id];
  if (!e) return (
    <div className="err">
      <h2>Разбор не найден: {id}</h2>
      <p>Возможно, функция ещё не разобрана. Проверь карту покрытия.</p>
      <p><a href="#/deep">← ко всем разборам</a> · <a href="#/coverage">карта покрытия</a></p>
    </div>
  );
  const i = deepIndex[id];
  return <DeepDoc e={e} prev={DEEP[i - 1]} next={DEEP[i + 1]} onNav={onNav} />;
}