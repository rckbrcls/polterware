import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotesBridge, type NotesWireBridge } from "./bridge";
import { createNotesStore, type NotesStore } from "./store";
import { fakeBridge } from "./fake-bridge";
import { noteFixture } from "./fixtures";
import type { NotesBridge } from "./model";

const stores: NotesStore[] = [];
function setup(count = 1) {
  const fake = fakeBridge(Array.from({ length: count }, (_, index) => noteFixture(index + 1)));
  const store = createNotesStore(() => createNotesBridge(fake.bridge as unknown as NotesWireBridge));
  stores.push(store);
  return { ...fake, store };
}
afterEach(() => { stores.splice(0).forEach(store => store.dispose()); vi.useRealTimers(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("revision-safe note store", () => {
  it("reads every cursor page of 10k records", async () => {
    const { store, bridge } = setup(10000); await store.refresh();
    expect(store.loadError()).toBe("");
    expect(store.rows()).toHaveLength(10000); expect(bridge.notes.list).toHaveBeenCalledTimes(20);
  });
  it("serializes rapid edits and preserves the newer draft while a save is in flight", async () => {
    const { store, bridge, data } = setup(); await store.load("note-1");
    const first = deferred<Awaited<ReturnType<NotesBridge["notes"]["update"]>>>();
    const update = bridge.notes.update;
    vi.mocked(update).mockImplementationOnce(async input => {
      const result = { ...data.get(input!.id!)!, title: input!.title, content: input!.content, rev: "2" };
      await first.promise; data.set("note-1", result); return { note: result };
    });
    store.edit("note-1", { title: "First", content: "First note" });
    const one = store.flush("note-1"); await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    store.edit("note-1", { title: "Final", content: "Final note" });
    const two = store.flush("note-1");
    expect(store.record("note-1")!.content).toBe("Final note");
    first.resolve({}); await Promise.all([one, two]);
    expect(data.get("note-1")!.title).toBe("Final"); expect(data.get("note-1")!.content).toBe("Final note");
    expect(vi.mocked(update).mock.calls[1]![0]!.expectedRev).toBe("2"); expect(store.state("note-1")).toBe("live");
  });
  it("coalesces rapid set/clear property edits into a valid patch", async () => {
    const { store, data, bridge } = setup(); await store.load("note-1");
    store.edit("note-1", { spaceId: "space-1", priority: 3, dueAt: "2026-10-05T12:00:00Z" });
    store.edit("note-1", { clearSpaceId: true, clearPriority: true, clearDueAt: true });
    await store.flush("note-1");
    expect(store.state("note-1")).toBe("live");
    expect(vi.mocked(bridge.notes.update).mock.calls[0]![0]).toEqual({ id: "note-1", expectedRev: "1", clearSpaceId: true, clearPriority: true, clearDueAt: true });
    expect(data.get("note-1")!.dueAt).toBeUndefined(); expect(store.record("note-1")!.priority).toBeUndefined();
    store.edit("note-1", { clearSpaceId: true }); store.edit("note-1", { spaceId: "space-1" }); await store.flush("note-1");
    expect(data.get("note-1")!.spaceId).toBe("space-1");
  });
  it("retains the latest local draft on conflict, then overwrites against the reloaded rev", async () => {
    const { store, data, bridge } = setup(); await store.load("note-1");
    data.set("note-1", { ...data.get("note-1")!, content: "Remote edit", rev: "2" });
    store.edit("note-1", { content: "Local edit" }); await store.flush("note-1");
    expect(store.state("note-1")).toBe("conflict"); expect(store.record("note-1")!.content).toBe("Local edit");
    store.edit("note-1", { content: "Newest local edit" }); await store.resolve("note-1", "overwrite");
    expect(data.get("note-1")!.content).toBe("Newest local edit");
    expect(vi.mocked(bridge.notes.update).mock.calls.at(-1)![0]!.expectedRev).toBe("2");
  });
  it("reload discards only the conflicted entity's draft", async () => {
    const { store, data } = setup(2); await store.load("note-1"); await store.load("note-2");
    data.set("note-1", { ...data.get("note-1")!, content: "Remote", rev: "2" });
    store.edit("note-1", { content: "Local" }); store.edit("note-2", { content: "Other local" });
    await store.flush("note-1"); await store.resolve("note-1", "reload");
    expect(store.record("note-1")!.content).toBe("Remote"); expect(store.record("note-2")!.content).toBe("Other local");
  });
  it("keeps rapid checkbox/detail/tag edits and saves each against the preceding revision", async () => {
    const { store, data, bridge } = setup(); await store.load("note-1");
    store.edit("note-1", { autoCompleteOnChecklist: true });
    store.editChecklist("note-1", [{ id: "check-1", title: "Final", detail: "Retained detail", done: true }]);
    store.editTags("note-1", ["tag-2"]); await store.flush("note-1");
    expect(store.record("note-1")!.content).toBe("Note 1"); expect(data.get("note-1")!.status).toBe("completed"); expect(data.get("note-1")!.checklist![0]!.detail).toBe("Retained detail");
    expect(vi.mocked(bridge.notes.replaceChecklist).mock.calls[0]![0]!.expectedRev).toBe("2");
    expect(vi.mocked(bridge.notes.setTags).mock.calls[0]![0]!.expectedRev).toBe("3");
  });
  it("preserves note and tags when real mutation responses emit empty unloaded relations", async () => {
    const { store, bridge, data } = setup(); await store.load("note-1");
    vi.mocked(bridge.notes.setPinned).mockImplementationOnce(async () => ({ note: { id: "note-1", pinned: true, rev: "2", checklist: [], tags: [], attachments: [], completions: [] } }));
    await store.toggle("note-1", "pinned");
    expect(store.record("note-1")!.content).toBe("Note 1"); expect(store.record("note-1")!.tagIds).toEqual(["tag-1"]);
    data.set("note-1", { ...data.get("note-1")!, rev: "2", pinned: true });
    vi.mocked(bridge.notes.setPinned).mockImplementationOnce(async () => ({ note: { id: "note-1", rev: "3" } }));
    await store.toggle("note-1", "pinned", false); expect(store.record("note-1")!.pinned).toBe(false);
  });
  it("rolls back a failed optimistic pin without losing unrelated draft text", async () => {
    const { store, bridge } = setup(); await store.load("note-1"); await store.refresh();
    vi.mocked(bridge.notes.setPinned).mockRejectedValueOnce(new Error("Core unavailable"));
    const task = store.toggle("note-1", "pinned"); expect(store.rows()[0]!.pinned).toBe(true); await task;
    expect(store.rows()[0]!.pinned).toBe(false); expect(store.state("note-1")).toBe("failed");
  });
  it("rolls back a failed optimistic checklist toggle while preserving its title and detail", async () => {
    const { store, bridge } = setup(); await store.load("note-1");
    vi.mocked(bridge.notes.toggleCheckItem).mockRejectedValueOnce(new Error("Core unavailable"));
    const task = store.toggleChecklist("note-1", "check-1", true);
    expect(store.record("note-1")!.checklist[0]!.done).toBe(true); await task;
    expect(store.record("note-1")!.checklist[0]!.done).toBe(false);
    expect(store.record("note-1")!.checklist[0]!.detail).toBe("Keep details");
  });
  it("flushes a checklist detail edit before a checked toggle and reflects auto completion", async () => {
    const { store, data, bridge } = setup(); await store.load("note-1");
    store.edit("note-1", { autoCompleteOnChecklist: true });
    store.editChecklist("note-1", [{ id: "check-1", title: "First step", detail: "Latest detail", done: false }]);
    await store.toggleChecklist("note-1", "check-1", true);
    expect(vi.mocked(bridge.notes.toggleCheckItem).mock.calls[0]![0]!.expectedRev).toBe("3");
    expect(store.record("note-1")!.status).toBe("completed"); expect(data.get("note-1")!.checklist![0]!.detail).toBe("Latest detail");
  });
  it("undo reopens a completion with expectedRev", async () => {
    const { store, data, bridge } = setup(); await store.refresh(); await store.toggle("note-1", "status");
    expect(data.get("note-1")!.status).toBe("completed");
    await store.undo(store.undos()[0]!); expect(data.get("note-1")!.status).toBe("active");
    expect(vi.mocked(bridge.notes.setStatus).mock.calls.at(-1)![0]!.expectedRev).toBe("2");
  });
  it("undo cancels queued deletion and preserves the complete aggregate", async () => {
    vi.useFakeTimers(); const { store, data, bridge } = setup();
    const note = data.get("note-1")!; note.attachments = [{ id: "attachment-1", noteId: "note-1" }];
    await store.refresh(); await store.queueDelete("note-1"); expect(store.rows()).toHaveLength(0);
    await store.undo(store.undos()[0]!); await vi.advanceTimersByTimeAsync(8001);
    expect(bridge.notes.delete).not.toHaveBeenCalled(); expect(data.get("note-1")!.attachments).toHaveLength(1); expect(store.rows()).toHaveLength(1);
  });
  it("does not queue duplicate deletion or undo twice", async () => {
    const { store, bridge } = setup(); await store.load("note-1");
    await Promise.all([store.queueDelete("note-1"), store.queueDelete("note-1")]);
    expect(store.undos()).toHaveLength(1);
    const undo = store.undos()[0]!; await Promise.all([store.undo(undo), store.undo(undo)]);
    expect(bridge.notes.delete).not.toHaveBeenCalled(); expect(store.deleting().size).toBe(0);
  });
  it("runs deletion after 8 seconds, with a checked revision, and restores a failed row", async () => {
    vi.useFakeTimers(); const { store, bridge } = setup(); await store.refresh();
    vi.mocked(bridge.notes.delete).mockRejectedValueOnce(new Error("Core unavailable"));
    await store.queueDelete("note-1"); await vi.advanceTimersByTimeAsync(7999); expect(bridge.notes.delete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(bridge.notes.delete).toHaveBeenCalledWith({ id: "note-1", expectedRev: "1" });
    expect(store.rows()).toHaveLength(1); expect(store.state("note-1")).toBe("failed");
  });
  it("refreshes live changes while keeping an unsaved editor draft", async () => {
    vi.useFakeTimers(); const { store, data, emit } = setup(); const disconnect = store.connect();
    await store.refresh(); await store.load("note-1"); store.edit("note-1", { content: "Unsaved" });
    data.set("note-1", { ...data.get("note-1")!, title: "Agent title", rev: "2" }); emit();
    await vi.advanceTimersByTimeAsync(100); expect(store.record("note-1")!.content).toBe("Unsaved");
    disconnect(); await store.flush("note-1"); expect(store.state("note-1")).toBe("conflict");
  });
  it("keeps int64 revisions as decimal strings through protobuf JSON", async () => {
    const fake = fakeBridge([{ ...noteFixture(), rev: "9007199254740993" }]);
    const store = createNotesStore(() => createNotesBridge(fake.bridge as unknown as NotesWireBridge));
    stores.push(store);
    await store.load("note-1");
    store.edit("note-1", { title: "Safe int64" }); await store.flush("note-1");
    expect(vi.mocked(fake.bridge.notes.update).mock.calls[0]![0]!.expectedRev).toBe("9007199254740993");
    expect(typeof vi.mocked(fake.bridge.notes.update).mock.calls[0]![0]!.expectedRev).toBe("string");
    expect(store.record("note-1")!.rev).toBe("9007199254740994");
  });
  it("cancels queued deletion on pagehide without sending Delete", async () => {
    vi.useFakeTimers(); const { store, bridge } = setup();
    const disconnect = store.connect(); await store.refresh(); await store.queueDelete("note-1");
    expect(store.rows()).toHaveLength(0);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(8001);
    expect(bridge.notes.delete).not.toHaveBeenCalled();
    expect(store.rows()).toHaveLength(1); expect(store.deleting().size).toBe(0);
    disconnect();
  });
});
