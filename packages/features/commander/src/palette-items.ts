import type { PlatformCapability } from "@polterware/frontend-platform";
import type { ShortcutCommandId } from "@polterware/frontend-state";

export type PaletteItem = {
  id: string;
  label: string;
  group: "Navigation" | "Actions" | "Recent";
  shortcutId?: ShortcutCommandId;
  requiredCapability?: PlatformCapability;
};

export const DEFAULT_PALETTE_ITEMS: PaletteItem[] = [
  { id: "nav.inbox", label: "Inbox", group: "Navigation" },
  { id: "nav.work", label: "Work", group: "Navigation" },
  { id: "nav.canvas", label: "Canvas", group: "Navigation", shortcutId: "shell.open_canvas" },
  { id: "nav.structure", label: "Structure", group: "Navigation" },
  { id: "nav.truth", label: "Truth", group: "Navigation" },
  { id: "nav.dispatch", label: "Dispatch Agents", group: "Navigation" },
  { id: "nav.dispatch-routing", label: "Dispatch Routing", group: "Navigation" },
  { id: "nav.dispatch-usage", label: "Dispatch Usage", group: "Navigation" },
  { id: "nav.activity", label: "Activity", group: "Navigation" },
  { id: "nav.integrations", label: "Platforms", group: "Navigation" },
  { id: "nav.agents", label: "Core", group: "Navigation" },
  { id: "nav.settings", label: "Open Settings > Project > General", group: "Navigation" },
  { id: "action.open-sync", label: "Open Settings > App > Local core", group: "Actions" },
  {
    id: "action.create-node",
    label: "Add structure node",
    group: "Actions",
    shortcutId: "structure.add_node",
  },
  { id: "action.connect-integration", label: "Connect integration", group: "Actions" },
  { id: "recent.payment", label: "Payment Service", group: "Recent" },
  { id: "recent.postgres", label: "prod-postgres", group: "Recent" },
];
