import { vi } from "vitest";
import type { NotesBridge, NoteJSON } from "./model";
import { noteFixture } from "./fixtures";

/** All behavior fixtures use the same JSON input/output boundary as the Electron preload. */
export function fakeBridge(seed: NoteJSON[] = [noteFixture()]) {
  const data = new Map(seed.map(note => [note.id!, structuredClone(note)]));
  let listener: Parameters<NotesBridge["onChange"]>[0] | undefined;
  function find(id?: string) { const note = data.get(id ?? ""); if (!note) throw new Error("Note not found"); return note; }
  function update(id: string | undefined, expectedRev: string | undefined, patch: Partial<NoteJSON>) {
    const old = find(id);
    if (expectedRev && expectedRev !== old.rev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" });
    const next = { ...old, ...patch, rev: String(BigInt(old.rev ?? "0") + 1n), updatedAt: new Date().toISOString() };
    data.set(id!, next); return { note: { ...structuredClone(next), checklist: [], tags: [], attachments: [], completions: [] } };
  }
  const bridge: NotesBridge = {
    notes: {
      list: vi.fn<NotesBridge["notes"]["list"]>(async input => {
        const all = [...data.values()]; const offset = Number(input?.cursor ?? 0), limit = input?.limit ?? 500;
        return { notes: all.slice(offset, offset + limit).map(note => ({ ...note, snippet: note.content, tagIds: note.tags?.map(tag => tag.id ?? "") })), total: all.length, nextCursor: offset + limit < all.length ? String(offset + limit) : "" };
      }),
      get: vi.fn<NotesBridge["notes"]["get"]>(async input => ({ note: structuredClone(find(input?.id)) })),
      create: vi.fn<NotesBridge["notes"]["create"]>(async input => { const note = { ...input, id: `created-${data.size}`, status: "active", rev: "1" }; data.set(note.id, note); return { note }; }),
      update: vi.fn<NotesBridge["notes"]["update"]>(async input => {
        const { id, expectedRev, clearDueAt, clearPriority, clearSpaceId, ...patch } = input!;
        if (clearDueAt && patch.dueAt !== undefined || clearPriority && patch.priority !== undefined || clearSpaceId && patch.spaceId !== undefined) throw new Error("cannot set and clear the same field");
        if (clearDueAt) patch.dueAt = undefined;
        if (clearPriority) patch.priority = undefined;
        if (clearSpaceId) patch.spaceId = "";
        return update(id, expectedRev, patch);
      }),
      delete: vi.fn<NotesBridge["notes"]["delete"]>(async input => { const note = find(input?.id); if (input?.expectedRev !== note.rev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" }); data.delete(input!.id!); return {}; }),
      setStatus: vi.fn<NotesBridge["notes"]["setStatus"]>(async input => update(input?.id, input?.expectedRev, { status: input?.status })),
      setPinned: vi.fn<NotesBridge["notes"]["setPinned"]>(async input => update(input?.id, input?.expectedRev, { pinned: input?.pinned })),
      reorder: vi.fn<NotesBridge["notes"]["reorder"]>(async () => ({})),
      toggleCheckItem: vi.fn<NotesBridge["notes"]["toggleCheckItem"]>(async input => {
        const old = find(input?.noteId);
        const checklist = (old.checklist ?? []).map(item => item.id === input?.itemId ? { ...item, done: input?.done ?? !item.done } : item);
        const patch: NoteJSON = { checklist };
        if (old.autoCompleteOnChecklist) patch.status = checklist.length && checklist.every(item => item.done) ? "completed" : "active";
        const result = update(input?.noteId, input?.expectedRev, patch);
        return { ...result, note: { ...result.note, content: "" }, item: checklist.find(item => item.id === input?.itemId) };
      }),
      replaceChecklist: vi.fn<NotesBridge["notes"]["replaceChecklist"]>(async input => {
        const items = (input?.items ?? []).map((item, index) => ({ ...item, id: item.id || `new-check-${index}` }));
        const old = find(input?.noteId);
        const patch: NoteJSON = { checklist: items };
        if (old.autoCompleteOnChecklist) patch.status = items.length > 0 && items.every(item => item.done) ? "completed" : "active";
        const result = update(input?.noteId, input?.expectedRev, patch);
        return { ...result, note: { ...result.note, content: "" }, items };
      }),
      setTags: vi.fn<NotesBridge["notes"]["setTags"]>(async input => { const tags = input?.tagIds?.map(id => ({ id, name: id })); const result = update(input?.noteId, input?.expectedRev, { tags }); return { ...result, note: { ...result.note, content: "" }, tags }; }),
      bulkAction: vi.fn<NotesBridge["notes"]["bulkAction"]>(async () => ({ results: [] })),
    },
    spaces: { list: vi.fn(async () => ({ spaces: [{ id: "space-1", name: "Home" }] })), get: vi.fn(async () => ({})), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), reorder: vi.fn(async () => ({})) },
    tags: { list: vi.fn(async () => ({ tags: [{ id: "tag-1", name: "Errands" }] })), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), merge: vi.fn(async () => ({})) },
    activity: { list: vi.fn(async () => ({ events: [{ id: "activity-1", entityId: "note-1", actor: "agent:codex", summary: "Updated note", at: "2026-10-04T08:00:00Z" }] })) },
    schedule: { set: vi.fn(async () => ({})), clear: vi.fn(async () => ({})), preview: vi.fn(async () => ({})), listOccurrences: vi.fn(async () => ({ occurrences: [] })), completeOccurrence: vi.fn(async () => ({})), reopenOccurrence: vi.fn(async () => ({})), setFocusRecipe: vi.fn(async () => ({})) },
    onChange: vi.fn(callback => { listener = callback; return () => { listener = undefined; }; }),
    app: { openDeepLink: vi.fn(async () => {}) },
  };
  return { bridge, data, emit: (id = "note-1") => listener?.({ resync: false, changes: [{ entity: "note", id, op: "update" }] }) };
}
