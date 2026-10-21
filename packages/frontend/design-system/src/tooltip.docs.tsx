import { Tooltip } from "./tooltip";
import type { DocEntry } from "./docs/types";

export default {
  name: "Tooltip",
  group: "Overlays",
  summary: "Non-interactive Ark tooltip with a compact Polter panel, delayed opening, and automatic collision-aware placement. A group keeps adjacent tooltips warm after the first one opens.",
  exports: ["Tooltip"],
  examples: [
    { id: "default", title: "Default", render: () => (
      // #region default
      <Tooltip.Root><Tooltip.Trigger>Tooltip target</Tooltip.Trigger><Tooltip.Content>Helpful text</Tooltip.Content></Tooltip.Root>
      // #endregion
    ) },
    { id: "group", title: "Grouped tooltips", render: () => (
      // #region group
      <Tooltip.Group><Tooltip.Root><Tooltip.Trigger>Previous</Tooltip.Trigger><Tooltip.Content>Previous item</Tooltip.Content></Tooltip.Root><Tooltip.Root placement="bottom"><Tooltip.Trigger>Next</Tooltip.Trigger><Tooltip.Content>Next item</Tooltip.Content></Tooltip.Root></Tooltip.Group>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
