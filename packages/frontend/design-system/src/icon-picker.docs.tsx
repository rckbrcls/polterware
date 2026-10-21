import { createSignal } from "solid-js";
import { IconPicker } from "./icon-picker";
import type { DocEntry } from "./docs/types";

function Controlled() {
  const [value, setValue] = createSignal<"book" | "brain" | "calendar" | "check" | "folder" | "home" | "place" | "bell" | "energy">("folder");
  return (
    // #region controlled
    <IconPicker label="Component icon" value={value()} onValueChange={setValue} />
    // #endregion
  );
}

export default {
  name: "Icon picker",
  group: "Inputs",
  summary: "IconPicker selects an icon from the product picker set in a trigger-driven popover. It can manage its own initial choice or let the caller control the selected icon.",
  exports: ["IconPicker"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <IconPicker label="Domain icon" defaultValue="brain" />
      // #endregion
    ) },
    { id: "controlled", title: "Controlled", render: () => <Controlled /> },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <IconPicker label="Locked icon" value="calendar" disabled />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
