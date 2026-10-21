import { createSignal } from "solid-js";
import { SegmentedControl } from "./segmented-control";
import type { DocEntry } from "./docs/types";

const options = [{ value: "board", label: "Board" }, { value: "specs", label: "Specs" }, { value: "activity", label: "Activity" }];

function Controlled() {
  const [value, setValue] = createSignal("specs");
  return (
    // #region controlled
    <SegmentedControl aria-label="Work view" options={options} value={value()} onValueChange={(details) => { if (details.value) setValue(details.value); }} />
    // #endregion
  );
}

export default {
  name: "Segmented control",
  group: "Inputs",
  summary: "SegmentedControl presents a compact, single-choice group with a shared animated selection indicator. Supply options for each view or mode and use the Ark value API for controlled state.",
  exports: ["SegmentedControl"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <SegmentedControl aria-label="Work view" options={options} defaultValue="board" />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "disabled-option", title: "Disabled option", render: () => (
      // #region disabled-option
      <SegmentedControl aria-label="Report period" defaultValue="week" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }]} />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <SegmentedControl aria-label="Disabled view" options={options} defaultValue="board" disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
