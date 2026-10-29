import { createSignal } from "solid-js";
import { EntityNavigator } from "./entity-navigator";
import type { DocEntry } from "./docs/types";

function EntityNavigatorExample() {
  const [position, setPosition] = createSignal(3);
  return (
    // #region default
    <EntityNavigator
      position={position()}
      total={12}
      onPrevious={() => setPosition(position() - 1)}
      onNext={() => setPosition(position() + 1)}
    />
    // #endregion
  );
}

export default {
  name: "Entity navigator",
  group: "Pages",
  summary:
    "Position of an entity page in the list it was opened from, with previous and next. K and J move while the page is open; typing in a field does not.",
  exports: ["EntityNavigator"],
  examples: [{ id: "default", title: "3 of 12", render: () => <EntityNavigatorExample /> }],
} satisfies DocEntry;
