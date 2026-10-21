import { createSignal } from "solid-js";
import { DateTimePicker } from "./date-time-picker";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal("2026-10-21T09:30");
  return (
    // #region controlled
    <DateTimePicker value={value()} onValueChange={setValue} aria-label="Review appointment" />
    // #endregion
  );
}

export default {
  name: "Date and time picker",
  group: "Inputs",
  summary: "DateTimePicker combines the shared calendar with local hours and minutes in a trigger-driven popover. It stores a local date-time string, or only a day when dateOnly is set.",
  exports: ["DateTimePicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <DateTimePicker value="" onValueChange={() => undefined} placeholder="Set review time" />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "date-only", title: "Date only", render: () => (
      // #region date-only
      <DateTimePicker value="2026-10-21" onValueChange={() => undefined} dateOnly aria-label="Delivery date" />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <DateTimePicker value="2026-10-21T09:30" onValueChange={() => undefined} disabled aria-label="Locked appointment" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
