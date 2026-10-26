import { PageHeader, PageEmpty, StatusChip } from "@polterware/frontend-design-system";
import type { NotesFeature } from "./feature";
import { SHELL_ROUTES } from "./route";
const feature: NotesFeature = {
  id: "shell",
  routes: [...SHELL_ROUTES, { path: "/space/:id", title: "Space" }].map(route => ({
    path: route.path, title: route.title,
    component: () => <><PageHeader title={route.title} subtitle={<StatusChip tone="muted" label="Unavailable" />} />
      <PageEmpty title={`${route.title} is unavailable`} /></>,
  })),
};
export default feature;
export { NotesShell } from "./shell";
export { NoteDetailHost } from "./note-detail-host";
export { useNotesShell } from "./context";
export { parseQuickAdd } from "./quick-add";
export { createShellBridge } from "./bridge";
export type { NotesFeature, RouteDef, SidebarItemDef, CommandDef, CommandSourceDef, SettingsPanelDef, DetailSectionDef, NoteDetailProps, SidebarTreeDef } from "./feature";
export type { NotesShellContext, NoteDetailRenderer } from "./context";
export type { ShellBridge, ShellWireBridge } from "./bridge";
export type { NoteShortcut } from "./shortcuts";
