import { Card, Surface } from "./card";
import type { DocEntry } from "./docs/types";

export default {
  name: "Card",
  group: "Layout",
  summary: "Card offers two opaque finishes: concentric rings (default) and a framed gradient texture with the button geometry and a softer surface palette. texture=\"compact\" uses the field gradient and a single rim. Atlas Relations groups and nodes, and Components group containers, use the framed texture. Components list rows stay flat. Surface uses the flat main application material, also used by detail sections. Use a floating Surface only when it is outside the main application surface.",
  exports: ["Card", "Surface"],
  examples: [
    { id: "card", title: "Concentric rings (default)", render: () => (
      // #region card
      <Card><p class="text-sm font-medium text-[var(--color-text-primary)]">Project context</p><p class="text-sm text-[var(--color-text-secondary)]">Evidence is attached to this decision.</p></Card>
      // #endregion
    ) },
    { id: "texture", title: "Framed texture", render: () => (
      // #region texture
      <Card variant="texture"><p class="text-sm font-medium text-[var(--color-text-primary)]">Project context</p><p class="text-sm text-[var(--color-text-secondary)]">The button frame and gradient geometry with a softer palette for content surfaces.</p></Card>
      // #endregion
    ) },
    { id: "surface", title: "Host surface", render: () => (
      // #region surface
      <Surface class="p-4"><p class="text-sm font-medium text-[var(--color-text-primary)]">Activity</p><p class="text-sm text-[var(--color-text-secondary)]">No recent changes.</p></Surface>
      // #endregion
    ) },
    { id: "nested-surface", title: "Nested surface", render: () => (
      // #region nested-surface
      <Surface class="surface-panel--nested p-3"><p class="text-sm font-medium text-[var(--color-text-primary)]">Context</p><p class="text-sm text-[var(--color-text-secondary)]">A lighter flat fill and compact corners for detail sections.</p></Surface>
      // #endregion
    ) },
    { id: "floating", title: "Floating surface", render: () => (
      // #region floating
      <Surface float class="p-4"><p class="text-sm font-medium text-[var(--color-text-primary)]">Detached panel</p></Surface>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
