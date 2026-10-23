import type { Component, JSX } from "solid-js";
import type { NotesFeature, DetailSectionDef } from "@polterware/feature-notes-shell/feature";
import { browserBridge } from "./bridge";
import { NoteDetailHost, NotePropertiesHost } from "./host";
import { NoteDetail } from "./note-detail";
import { InboxPage, NoteCollection, SpaceNotesPage, TodayPage } from "./note-list";
import { notesStore } from "./store";
import type { FolderItem } from "./card-reorder";

const feature: NotesFeature & {
  noteDetail: Component<{ noteId: string; sections: DetailSectionDef[] }>;
  noteCollection: Component<{ spaceId: string; mode?: "spaces"; leading?: JSX.Element; trailing?: JSX.Element; onCreateSpace?: () => void; folderItems?: FolderItem[]; onReorderFolders?: (updates: { id: string; sortOrder: number }[]) => Promise<void> | void; canDropInto?: (held: { kind: "space" | "note"; id: string }, spaceId: string) => boolean; onDropInto?: (held: { kind: "space" | "note"; id: string }, spaceId: string) => Promise<void> | void }>;
} = {
  id: "notes",
  routes: [
    { path: "/today", title: "Today", component: TodayPage },
    { path: "/inbox", title: "Inbox", component: InboxPage },
    { path: "/note/:id", title: "Note", component: NoteDetailHost },
  ],
  commands: [{
    id: "notes.create",
    label: "Create untitled note",
    keywords: ["add", "create", "new", "note"],
    run: async () => {
      const note = await notesStore.create({ title: "Untitled note" });
      await browserBridge().app.openDeepLink(`pwnotes://note/${note.id}`);
    },
  }],
  noteDetail: NoteDetailHost,
  noteProperties: NotePropertiesHost,
  noteCollection: SpaceNotesPage,
};
export default feature;
export { NoteDetail, NoteDetailHost, NoteCollection, SpaceNotesPage, TodayPage, InboxPage };
export { createNotesStore, notesStore } from "./store";
export { createNotesBridge, browserBridge } from "./bridge";
export type { NoteDetailProps } from "./note-detail";
export type { NoteCollectionProps } from "./note-list";
