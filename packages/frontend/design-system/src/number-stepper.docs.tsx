import { createSignal } from "solid-js";
import { NumberStepper } from "./number-stepper";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal("3");
  return (
    // #region controlled
    <NumberStepper label="Retry limit" value={value()} min={0} max={10} onValueChange={(details) => setValue(details.value)} />
    // #endregion
  );
}

export default {
  name: "Number stepper",
  group: "Inputs",
  summary: "NumberStepper pairs an Ark number input with decrement and increment controls. It can constrain a numeric range, apply a step, and optionally render its own label.",
  exports: ["NumberStepper"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <NumberStepper label="Priority" defaultValue="2" min={1} max={5} />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "step", title: "Custom step", render: () => (
      // #region step
      <NumberStepper label="Minutes" defaultValue="15" min={0} max={120} step={15} />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <NumberStepper label="Locked value" value="8" disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
