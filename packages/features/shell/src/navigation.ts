import type { NavItem } from "./route";

export const DEFAULT_NAV: NavItem[] = [
  { id: "inbox", section: "inbox", label: "Inbox", group: "Now", icon: "inbox" },
  { id: "activity", section: "activity", label: "Activity", group: "Now", icon: "activity" },
  { id: "work", section: "work", label: "Work", group: "Project", icon: "work" },
  { id: "canvas", section: "canvas", label: "Canvas", group: "Project", icon: "canvas" },
  { id: "structure", section: "structure", label: "Structure", group: "Project", icon: "structure" },
  { id: "truth", section: "truth", label: "Truth", group: "Project", icon: "truth" },
  { id: "dispatch", section: "dispatch", label: "Agents", group: "Dispatch", icon: "runs" },
  { id: "dispatch-routing", section: "dispatch-routing", label: "Routing", group: "Dispatch", icon: "routing" },
  { id: "dispatch-usage", section: "dispatch-usage", label: "Usage", group: "Dispatch", icon: "usage" },
  { id: "integrations", section: "integrations", label: "Platforms", group: "System", icon: "integrations" },
  { id: "agents", section: "agents", label: "Core", group: "System", icon: "agents" },
];
