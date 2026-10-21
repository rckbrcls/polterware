import { StatusChip, StatusDot } from "./status";
import type { DocEntry } from "./docs/types";

export default {
  name: "Status",
  group: "Feedback",
  summary: "StatusChip is the filled semantic label for results and health. StatusDot is the lighter compact indicator when a full badge would be too heavy.",
  exports: ["StatusChip", "StatusDot"],
  examples: [
    { id: "chips", title: "Status chips", render: () => (
      // #region chips
      <><StatusChip tone="healthy" /><StatusChip tone="degraded" /><StatusChip tone="down" /><StatusChip tone="syncing" /></>
      // #endregion
    ) },
    { id: "custom-label", title: "Custom label", render: () => (
      // #region custom-label
      <StatusChip tone="warn">Needs review</StatusChip>
      // #endregion
    ) },
    { id: "dots", title: "Compact dots", render: () => (
      // #region dots
      <><StatusDot ok label="Connected" /><StatusDot tone="warn" label="Delayed" /><StatusDot tone="unknown" showLabel={false} /></>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
