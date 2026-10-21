import { Card, Surface } from "./card";
import type { DocEntry } from "./docs/types";

export default {
  name: "Card",
  group: "Layout",
  summary: "Card is a quiet nested panel, while Surface is the elevated host material for larger panels. Use a floating Surface only when it is outside the main application surface.",
  exports: ["Card", "Surface"],
  examples: [
    { id: "card", title: "Nested card", render: () => (
      // #region card
      <Card><p class="text-sm font-medium text-[var(--color-text-primary)]">Project context</p><p class="text-sm text-[var(--color-text-secondary)]">Evidence is attached to this decision.</p></Card>
      // #endregion
    ) },
    { id: "surface", title: "Host surface", render: () => (
      // #region surface
      <Surface class="p-4"><p class="text-sm font-medium text-[var(--color-text-primary)]">Activity</p><p class="text-sm text-[var(--color-text-secondary)]">No recent changes.</p></Surface>
      // #endregion
    ) },
    { id: "floating", title: "Floating surface", render: () => (
      // #region floating
      <Surface float class="p-4"><p class="text-sm font-medium text-[var(--color-text-primary)]">Detached panel</p></Surface>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
