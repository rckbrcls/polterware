import { Separator } from "./separator";
import type { DocEntry } from "./docs/types";

export default {
  name: "Separator",
  group: "Layout",
  summary: "A subtle structural divider with horizontal and vertical orientations. Keep it between related content groups rather than using it as decoration.",
  exports: ["Separator"],
  examples: [
    { id: "horizontal", title: "Horizontal", render: () => (
      // #region horizontal
      <div class="w-64"><span class="text-sm text-[var(--color-text-primary)]">Overview</span><Separator /><span class="text-sm text-[var(--color-text-secondary)]">Details</span></div>
      // #endregion
    ) },
    { id: "vertical", title: "Vertical", render: () => (
      // #region vertical
      <div class="flex h-8 items-center gap-3"><span class="text-sm text-[var(--color-text-primary)]">Map</span><Separator orientation="vertical" /><span class="text-sm text-[var(--color-text-secondary)]">Components</span></div>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
