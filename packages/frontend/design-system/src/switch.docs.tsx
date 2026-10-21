import { createSignal } from "solid-js";
import { Switch, SwitchRow } from "./switch";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [checked, setChecked] = createSignal(true);
  return (
    // #region controlled
    <Switch aria-label="Enable notifications" checked={checked()} onCheckedChange={setChecked} />
    // #endregion
  );
}

export default {
  name: "Switch",
  group: "Inputs",
  summary: "Switch provides an animated, draggable on/off control for settings and option rows. SwitchRow pairs the same behavior with a label and optional content on either side.",
  exports: ["SwitchRow", "Switch"],
  examples: [
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "sizes", title: "Sizes", render: () => (
      // #region sizes
      <><Switch aria-label="Compact switch" checked onCheckedChange={() => undefined} size="sm" /><Switch aria-label="Default switch" checked onCheckedChange={() => undefined} /></>
      // #endregion
    ) },
    { id: "row", title: "Row", render: () => (
      // #region row
      <SwitchRow label="Show verification reminders" checked={false} onCheckedChange={() => undefined} trailing="Weekly" />
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <SwitchRow label="Managed by policy" checked onCheckedChange={() => undefined} disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
