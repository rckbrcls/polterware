import type { NoteJSON, NoteRow } from "./model";
import { rowFromJSON } from "./model";

export function noteFixture(index = 1): NoteJSON {
  return { id: `note-${index}`, title: `Note ${index}`, content: `Note ${index}`, status: "active", spaceId: "", pinned: index % 10 === 0,
    rev: "1", createdAt: "2026-10-04T08:00:00.000Z", updatedAt: "2026-10-04T08:00:00.000Z", dueAt: "2026-10-04T12:00:00.000Z",
    checklist: [{ id: `check-${index}`, title: "First step", detail: "Keep details", done: false, sortOrder: 0 }], tags: [{ id: "tag-1", name: "Errands" }] };
}
export function rowsFixture(count = 10000): NoteRow[] { return Array.from({ length: count }, (_, index) => rowFromJSON({ ...noteFixture(index), snippet: `Note ${index}`, tagIds: ["tag-1"] })); }
