import { createContext, useContext, type Accessor, type Component } from "solid-js";
import type { NoteShortcut } from "./shortcuts";
import type { NotesFeature, DetailSectionDef, NoteAttachmentsApi, SettingsPanelDef } from "./feature";

export type NoteDetailRenderer = Component<{ noteId: string }>;
export type NotesShellContext = {
  features: readonly NotesFeature[];
  path: Accessor<string>;
  params: Accessor<Record<string, string>>;
  searchParams: Accessor<URLSearchParams>;
  navigate: (path: string) => void;
  selectedNoteId: Accessor<string | null>;
  openNote: (id: string) => void;
  /** Create an empty note and open its page; untouched ones are discarded when the page is left. */
  newNote?: (options?: { spaceId?: string }) => Promise<void>;
  /** True while a note made by `newNote` has not been left; it can still be cancelled. */
  isFreshNote?: (id: string) => boolean;
  /** Whether the floating properties card of the open note is shown. */
  propertiesOpen?: () => boolean;
  expanded?: Accessor<boolean>;
  setExpanded?: (expanded: boolean) => void;
  noteAttachments?: () => NoteAttachmentsApi | undefined;
  setPropertiesOpen?: (open: boolean) => void;
  /** Leave a fresh note's page and delete it, whatever was typed. */
  cancelNewNote?: (id: string) => Promise<void>;
  closeDetail: () => void;
  /** The notes route registers its editor. Returns a cleanup; the host owns Content/Header. */
  registerNoteDetail: (component: NoteDetailRenderer) => () => void;
  /** Collection owners supply selection, mutation and delete confirmation semantics. */
  registerCollectionShortcuts: (handler: (action: NoteShortcut) => void) => () => void;
  deepLink: Accessor<URL | null>;
  detailSections: Accessor<DetailSectionDef[]>;
  settingsPanels: Accessor<SettingsPanelDef[]>;
};
export const ShellContext = createContext<NotesShellContext>();
export function useNotesShell(): NotesShellContext {
  const context = useContext(ShellContext);
  if (!context) throw new Error("Polterware Notes features must render inside NotesShell.");
  return context;
}
