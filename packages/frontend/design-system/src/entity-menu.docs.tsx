import { Archive, Copy, ExternalLink } from "./hugeicons";
import { createEntityContextMenu, EntityContextMenu, EntityMenuButton, type EntityAction } from "./entity-menu";
import type { DocEntry } from "./docs/types";

function EntityMenuExample() {
  const menu = createEntityContextMenu();
  const actions: EntityAction[] = [
    { id: "open", label: "Open", icon: ExternalLink, hint: "↵", onSelect: () => {} },
    { id: "copy", label: "Copy link", icon: Copy, hint: "⌘C", onSelect: () => {} },
    { id: "archive", label: "Archive", icon: Archive, group: "archive", danger: true, onSelect: () => {} },
  ];
  return (
    // #region default
    <div
      class="flex items-center justify-between gap-4 rounded-[var(--radius-item)] border border-[var(--color-border-subtle)] px-3 py-2"
      onContextMenu={(event) => menu.open(event, actions)}
    >
      <span>Right-click the row or use its button</span>
      <EntityMenuButton label="Actions for Login" actions={actions} />
      <EntityContextMenu menu={menu} />
    </div>
    // #endregion
  );
}

export default {
  name: "Entity menu",
  group: "Menus",
  summary:
    "One list of actions for an entity, shown by its \"…\" button and by right-click. Actions in a new group start after a separator; hints name their shortcut.",
  exports: ["EntityMenuButton", "EntityContextMenu", "createEntityContextMenu"],
  examples: [{ id: "default", title: "Row actions", description: "The same items in both menus.", render: () => <EntityMenuExample /> }],
} satisfies DocEntry;
