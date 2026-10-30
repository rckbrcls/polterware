import type { NavItem } from "./route";

export const DEFAULT_NAV: NavItem[] = [
  { id: "inbox", section: "inbox", label: "Inbox", group: "Now", icon: "inbox" },
  { id: "activity", section: "activity", label: "Activity", group: "Now", icon: "activity" },
  { id: "milestones", section: "milestones", label: "Milestones", group: "Project", icon: "milestones" },
  { id: "canvas", section: "canvas", label: "Canvas", group: "Project", icon: "canvas" },
  { id: "structure", section: "structure", label: "Structure", group: "Project", icon: "structure" },
  { id: "truth", section: "truth", label: "Knowledge", group: "Project", icon: "truth" },
  { id: "dispatch", section: "dispatch", label: "Runs", group: "Agents", icon: "runs" },
  { id: "dispatch-routing", section: "dispatch-routing", label: "Models", group: "Agents", icon: "routing" },
  { id: "dispatch-usage", section: "dispatch-usage", label: "Usage", group: "Agents", icon: "usage" },
];
