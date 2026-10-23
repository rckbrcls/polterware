import { DatePicker, parseDate } from "./date-picker";
import type { DocEntry } from "./docs/types";

export default {
  name: "Date picker",
  group: "Inputs",
  summary: "DatePicker is an Ark date field with a trigger that reveals the shared calendar surface. Its label is always visible and its popup remains closed until the trigger is used.",
  exports: ["DatePicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <DatePicker label="Due date" />
      // #endregion
    ) },
    { id: "selected", title: "Selected date", render: () => (
      // #region selected
      <DatePicker label="Review date" defaultValue={[parseDate("2026-10-21")]} />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <DatePicker label="Locked date" value={[parseDate("2026-10-21")]} disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
