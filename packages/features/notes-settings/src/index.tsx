import type { NotesFeature } from "@polterware/feature-notes-shell/feature";
import { lazy } from "solid-js";

const GeneralPanel = lazy(() => import("./panels").then(module => ({ default: module.GeneralPanel })));
const NotificationsPanel = lazy(() => import("./panels").then(module => ({ default: module.NotificationsPanel })));
const FocusPanel = lazy(() => import("./panels").then(module => ({ default: module.FocusPanel })));
const CalendarPanel = lazy(() => import("./panels").then(module => ({ default: module.CalendarPanel })));
const MapPanel = lazy(() => import("./panels").then(module => ({ default: module.MapPanel })));
const SearchPanel = lazy(() => import("./panels").then(module => ({ default: module.SearchPanel })));
const AgentsAccessPanel = lazy(() => import("./panels").then(module => ({ default: module.AgentsAccessPanel })));
const AgentsActivityPanel = lazy(() => import("./panels").then(module => ({ default: module.AgentsActivityPanel })));
const DataPanel = lazy(() => import("./panels").then(module => ({ default: module.DataPanel })));
const ShortcutsPanel = lazy(() => import("./panels").then(module => ({ default: module.ShortcutsPanel })));
const AdvancedPanel = lazy(() => import("./panels").then(module => ({ default: module.AdvancedPanel })));

const feature: NotesFeature = {
  id: "settings",
  routes: [],
  settingsPanels: [
    { id: "general", label: "General", group: "Essentials", component: GeneralPanel },
    { id: "notifications", label: "Notifications", group: "Essentials", component: NotificationsPanel },
    { id: "focus", label: "Focus", group: "Productivity", component: FocusPanel },
    { id: "calendar", label: "Calendar", group: "Productivity", component: CalendarPanel },
    { id: "settings-map", label: "Map", group: "Productivity", component: MapPanel },
    { id: "search", label: "Search", group: "Productivity", component: SearchPanel },
    { id: "data", label: "Data", group: "System", component: DataPanel },
    { id: "shortcuts", label: "Shortcuts", group: "System", component: ShortcutsPanel },
    { id: "advanced", label: "Advanced", group: "System", component: AdvancedPanel },
    { id: "agents-access", label: "Access", group: "Agents", component: AgentsAccessPanel },
    { id: "agents-activity", label: "Activity", group: "Agents", component: AgentsActivityPanel },
  ],
};

export default feature;
export { createSettingsBridge, browserBridge } from "./bridge";
export { createSettingsStore, settingsStore } from "./store";
export { mcpSnippets } from "./snippets";
export { testMcpConnection } from "./mcp-test";
export {
  AdvancedPanel,
  AgentsAccessPanel,
  AgentsActivityPanel,
  CalendarPanel,
  DataPanel,
  FocusPanel,
  GeneralPanel,
  MapPanel,
  NotificationsPanel,
  SearchPanel,
  ShortcutsPanel,
};
