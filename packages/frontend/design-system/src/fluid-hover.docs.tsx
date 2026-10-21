import { FluidHoverHighlight } from "./fluid-hover";
import type { DocEntry } from "./docs/types";

export default {
  name: "Fluid Hover Highlight",
  group: "Layout",
  summary: "The shared absolute highlight that glides between measured list items. It accepts either a FluidHover controller or a resolved item rectangle from an owning composite.",
  exports: ["FluidHoverHighlight"],
  examples: [
    { id: "visible", title: "Resolved rectangle", render: () => (
      // #region visible
      <div class="relative h-10 w-48"><FluidHoverHighlight rect={{ top: 4, left: 4, width: 184, height: 32 }} class="rounded-[var(--radius-item)] bg-[var(--color-surface-raised)]" /></div>
      // #endregion
    ) },
    { id: "transition", title: "Moderate transition", render: () => (
      // #region transition
      <div class="relative h-10 w-48"><FluidHoverHighlight rect={{ top: 4, left: 4, width: 184, height: 32 }} targetKey="active-row" session={1} class="rounded-[var(--radius-item)] bg-[var(--color-surface-raised)]" /></div>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
