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
  { id: "nav.atlas", label: "Atlas", group: "Navigation" },
  { id: "nav.work", label: "Work", group: "Navigation" },
  { id: "nav.truth", label: "Truth", group: "Navigation" },
  { id: "nav.dispatch", label: "Dispatch", group: "Navigation" },
  { id: "nav.activity", label: "Activity", group: "Navigation" },
  { id: "nav.agents", label: "Agents settings", group: "Navigation" },
  { id: "nav.integrations", label: "Integrations settings", group: "Navigation" },
  { id: "nav.settings", label: "Project Settings", group: "Navigation" },
  { id: "action.open-sync", label: "Sync diagnostics", group: "Actions" },
  {
    id: "action.create-node",
    label: "Create architecture node",
    group: "Actions",
    shortcutId: "architecture.add_node",
  },
  {
    id: "tool.connect",
    label: "Connect architecture components",
    group: "Actions",
    shortcutId: "architecture.tool_connect",
  },
  {
    id: "view.fit_document",
    label: "Fit architecture to view",
    group: "Actions",
    shortcutId: "architecture.fit_document",
  },
  { id: "action.connect-integration", label: "Connect integration", group: "Actions" },
  { id: "recent.payment", label: "Payment Service", group: "Recent" },
  { id: "recent.postgres", label: "prod-postgres", group: "Recent" },
];
