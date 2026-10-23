import { createSignal } from "solid-js";
import { TimePicker } from "./time-picker";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal("09:30");
  return (
    // #region controlled
    <TimePicker label="Start time" value={value()} onValueChange={setValue} minuteStep={15} />
    // #endregion
  );
}

export default {
  name: "Time picker",
  group: "Inputs",
  summary: "TimePicker selects a local wall-clock HH:mm value in a trigger-driven popover. The caller owns timezone and schedule meaning while the picker optionally constrains minute increments.",
  exports: ["TimePicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <TimePicker label="Reminder" defaultValue="14:00" />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "minute-step", title: "Minute step", render: () => (
      // #region minute-step
      <TimePicker label="Quarter-hour review" defaultValue="10:15" minuteStep={15} />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <TimePicker label="Locked time" value="16:30" disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
