import { SwitcherTrigger } from "./switcher-trigger";
import { StatusChip } from "./status";
import type { DocEntry } from "./docs/types";

export default {
  name: "SwitcherTrigger",
  group: "Buttons",
  summary:
    "Flat text trigger for compact project and environment switchers. It opens a popover; the label truncates and may be followed by a StatusChip.",
  exports: ["SwitcherTrigger"],
  examples: [
    {
      id: "label",
      title: "Label",
      render: () => (
        // #region label
        <SwitcherTrigger aria-label="Switch project: Polterware" aria-expanded={false}>
          <span class="truncate">Polterware</span>
        </SwitcherTrigger>
        // #endregion
      ),
    },
    {
      id: "chip",
      title: "With status chip",
      render: () => (
        // #region chip
        <SwitcherTrigger aria-label="Switch environment: Production" aria-expanded={false}>
          <StatusChip appearance="filled" tone="warn" label="Production" />
        </SwitcherTrigger>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
