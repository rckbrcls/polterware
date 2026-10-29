import type { Component, JSX } from "solid-js";

export type RouteDef = {
  path: string;
  component: Component;
  title: string;
};

export type SidebarItemDef = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  badge?: number;
};

export type CommandDef = {
  id: string;
  label: string;
  keywords?: string[];
  run: () => void | Promise<void>;
};

export type CommandSourceDef = {
  id: string;
  search: (query: string) => Promise<{ hits: { id: string; label: string; snippet?: string; run: () => void }[] }>;
};

export type SettingsPanelDef = {
  id: string;
  label: string;
  group: string;
  component: Component;
};

export type DetailSectionDef = {
  id: string;
  order: number;
  component: Component;
  visible?: (noteId: string) => boolean;
};

export type NoteAttachmentsApi = {
  /** Card for one attachment id of the open note. */
  render: (noteId: string, attachmentId: string, block: { remove: () => void }) => JSX.Element;
  /** Opens the file picker and returns the new attachment ids. */
  pick: (noteId: string) => Promise<string[]>;
  /** Imports dropped or pasted files and returns the new attachment ids. */
  drop: (noteId: string, files: File[]) => Promise<string[]>;
  /** Extra "insert" entries (record audio, add link) that resolve the new attachment ids. */
  actions?: { id: string; label: string; icon?: (props: { size?: number }) => JSX.Element; run: (noteId: string) => Promise<string[]> }[];
};

export type NoteDetailProps = {
  noteId: string;
  detailSections: DetailSectionDef[];
};

export type SidebarTreeDef = {
  id: string;
  component: Component;
};

export type NotesFeature = {
  id: string;
  routes: RouteDef[];
  sidebar?: SidebarItemDef[];
  commands?: CommandDef[];
  commandSources?: CommandSourceDef[];
  settingsPanels?: SettingsPanelDef[];
  detailSections?: DetailSectionDef[];
  noteDetail?: Component<NoteDetailProps>;
  /** Properties of the open note, rendered by the page's NoteDetailHost. */
  noteProperties?: Component<NoteDetailProps>;
  /** Lets the note editor embed attachments as blocks inside the text. */
  noteAttachments?: NoteAttachmentsApi;
  noteCollection?: Component<{
    spaceId: string;
    /** "spaces" shows only the Space cards (the root Spaces page), without notes. */
    mode?: "spaces";
    leading?: JSX.Element;
    trailing?: JSX.Element;
    onCreateSpace?: () => void;
    /** Child Spaces shown as cards in the same reorderable grid as the notes. */
    folderItems?: { id: string; sortOrder: number; render: (state: { dropTarget: boolean; noteCount: number }) => JSX.Element }[];
    onReorderFolders?: (updates: { id: string; sortOrder: number }[]) => Promise<void> | void;
    canDropInto?: (held: { kind: "space" | "note"; id: string }, spaceId: string) => boolean;
    onDropInto?: (held: { kind: "space" | "note"; id: string }, spaceId: string) => Promise<void> | void;
  }>;
  sidebarTree?: SidebarTreeDef;
  onDeepLink?: (url: URL) => boolean;
};

// Features access host services through this registry entry point only.
export { useNotesShell } from "./context";
export { NoteDetailHost } from "./note-detail-host";
export type { NotesShellContext, NoteDetailRenderer } from "./context";
export type { NoteShortcut } from "./shortcuts";
export { notesSavedFiltersApi } from "./saved-filters";
