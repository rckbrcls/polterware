import { createSignal } from "solid-js";
import { Slider } from "./slider";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal([40]);
  return (
    // #region controlled
    <Slider label="Confidence" value={value()} onValueChange={(details) => setValue(details.value)} />
    // #endregion
  );
}

export default {
  name: "Slider",
  group: "Inputs",
  summary: "Slider uses Ark UI range behavior with shared track and thumb styling. Use one value for a single measure or two values to expose a bounded range.",
  exports: ["Slider"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <Slider label="Coverage" defaultValue={[65]} />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "range", title: "Range", render: () => (
      // #region range
      <Slider label="Review window" defaultValue={[25, 75]} />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <Slider label="Locked coverage" defaultValue={[65]} disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
