import { createSignal } from "solid-js";
import { Checkbox } from "./checkbox";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [checked, setChecked] = createSignal(true);
  return (
    // #region controlled
    <Checkbox label="Include verified facts" checked={checked()} onCheckedChange={(details) => setChecked(details.checked === true)} />
    // #endregion
  );
}

export default {
  name: "Checkbox",
  group: "Inputs",
  summary: "Checkboxes use Ark UI behavior with the shared form primitive treatment. They support labels, indeterminate state, and square or round controls.",
  exports: ["Checkbox"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <Checkbox label="Include archived decisions" defaultChecked />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "states", title: "States", render: () => (
      // #region states
      <><Checkbox label="Partially selected" checked="indeterminate" /><Checkbox label="Unavailable option" disabled /></>
      // #endregion
    ) },
    { id: "round", title: "Round", render: () => (
      // #region round
      <Checkbox label="Round selection" shape="round" defaultChecked />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
