import { createSignal } from "solid-js";
import { Button } from "./button";
import { SelectionCheck } from "./menu-highlight";
import type { DocEntry } from "./docs/types";

function Toggleable() {
  const [checked, setChecked] = createSignal(false);
  return (
    // #region toggleable
    <Button onClick={() => setChecked((value) => !value)}><SelectionCheck checked={checked()} /> Toggle selection</Button>
    // #endregion
  );
}

export default {
  name: "Selection check",
  group: "Inputs",
  summary: "SelectionCheck is the animated check marker used in menu and list rows. It reserves its own slot, so changing selection does not shift neighboring content.",
  exports: ["SelectionCheck"],
  examples: [
    { id: "selected", title: "Selected", render: () => (
      // #region selected
      <SelectionCheck checked />
      // #endregion
    ) },
    { id: "unselected", title: "Unselected", render: () => (
      // #region unselected
      <SelectionCheck checked={false} />
      // #endregion
    ) },
    { id: "toggleable", title: "Animated state", render: () => <Toggleable /> },
  ],
} satisfies DocEntry;
