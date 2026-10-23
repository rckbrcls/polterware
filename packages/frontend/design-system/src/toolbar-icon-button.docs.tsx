import { ToolbarIconButton } from "./toolbar-icon-button";
import { PlusIcon } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Toolbar icon button",
  group: "Buttons",
  summary: "ToolbarIconButton is the round primary action for PageToolbar. Its label supplies both the accessible name and the shared delayed tooltip.",
  exports: ["ToolbarIconButton"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <ToolbarIconButton label="Add fact"><PlusIcon size={14} /></ToolbarIconButton>
      // #endregion
    ) },
    { id: "disabled", title: "Disabled", render: () => (
      // #region disabled
      <ToolbarIconButton label="Add fact" disabled><PlusIcon size={14} /></ToolbarIconButton>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
