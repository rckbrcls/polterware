import type { PlatformCapability } from "@polterware/frontend-platform";
import type { ShortcutCommandId, ShortcutSequenceId } from "@polterware/frontend-state";

export type PaletteItem = {
  id: string;
  label: string;
  group: "Navigation" | "Actions" | "Recent";
  shortcutId?: ShortcutCommandId;
  /** A G sequence that runs the same command, shown as its hint. */
  sequenceId?: ShortcutSequenceId;
  requiredCapability?: PlatformCapability;
};

export const DEFAULT_PALETTE_ITEMS: PaletteItem[] = [
  { id: "nav.inbox", label: "Inbox", group: "Navigation", sequenceId: "go.inbox" },
  { id: "nav.milestones", label: "Milestones", group: "Navigation", sequenceId: "go.milestones" },
  { id: "nav.canvas", label: "Canvas", group: "Navigation", shortcutId: "shell.open_canvas" },
  { id: "nav.structure", label: "Structure", group: "Navigation", sequenceId: "go.structure" },
  { id: "nav.truth", label: "Truth", group: "Navigation", sequenceId: "go.truth" },
  { id: "nav.dispatch", label: "Dispatch Runs", group: "Navigation", sequenceId: "go.runs" },
  { id: "nav.dispatch-routing", label: "Dispatch Routing", group: "Navigation" },
  { id: "nav.dispatch-usage", label: "Dispatch Usage", group: "Navigation" },
  { id: "nav.activity", label: "Activity", group: "Navigation", sequenceId: "go.activity" },
  { id: "nav.settings", label: "Open Project settings", group: "Navigation" },
  { id: "nav.app-settings", label: "Open App settings", group: "Navigation" },
  { id: "nav.platforms", label: "Open Project settings > Platforms", group: "Navigation" },
  { id: "nav.cli-reference", label: "Open App settings > CLI reference", group: "Navigation" },
  { id: "action.open-sync", label: "Open App settings > Local core", group: "Actions" },
  { id: "action.create-card", label: "New card", group: "Actions", shortcutId: "shell.create" },
  { id: "action.create-decision", label: "New decision", group: "Actions" },
  { id: "action.create-doc", label: "New doc", group: "Actions" },
  {
    id: "action.create-node",
    label: "Add structure node",
    group: "Actions",
    shortcutId: "structure.add_node",
  },
  { id: "action.connect-integration", label: "Connect integration", group: "Actions" },
  { id: "action.show-shortcuts", label: "Keyboard shortcuts", group: "Actions", shortcutId: "shell.show_shortcuts" },
  { id: "recent.payment", label: "Payment Service", group: "Recent" },
  { id: "recent.postgres", label: "prod-postgres", group: "Recent" },
];

/** Shown first while a Work card is open: its brief for an agent, and a dispatch run on it. */
export const CARD_PALETTE_ITEMS: PaletteItem[] = [
  { id: "action.copy-brief", label: "Copy agent brief", group: "Actions" },
  { id: "action.dispatch-card", label: "Dispatch this card", group: "Actions" },
];
