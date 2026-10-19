import { batch, createSignal } from "solid-js";
import { browserBridge } from "./bridge";
import { applyPatch, errorText, parseNoteFailure, mergePatch, recordFromJSON, revisionString, rowFromJSON, type ActivityJSON, type ChecklistInput, type CreateNoteJSON, type NotesBridge, type NoteFailure, type NoteJSON, type NoteRecord, type NoteRow, type SpaceJSON, type OccurrenceJSON, type Patch, type TagJSON } from "./model";

export type SaveState = "live" | "queued" | "saving" | "failed" | "conflict";
type Draft = { patch: Patch; checklist?: ChecklistInput[]; tagIds?: string[] };
type Undo = { id: string; kind: "delete" | "complete"; message: string; expiresAt: number; run: () => Promise<void>; timer: ReturnType<typeof setTimeout> };
const INCLUDE = { content: true, checklist: true, tags: true, schedule: true, place: true, attachments: true, completions: true };

/** One entity cache; edits survive detail unmounts and every write uses the newest acknowledged rev. */
export function createNotesStore(getBridge: () => NotesBridge = browserBridge, debounceMs = 350) {
  const [rows, setRows] = createSignal<NoteRow[]>([]);
  const [records, setRecords] = createSignal<Record<string, NoteRecord>>({});
  const [drafts, setDrafts] = createSignal<Record<string, Draft>>({});
  const [inflight, setInflight] = createSignal<Record<string, Draft>>({});
  const [optimistic, setOptimistic] = createSignal<Record<string, Partial<NoteRecord>>>({});
  const [checkToggles, setCheckToggles] = createSignal<Record<string, Record<string, boolean>>>({});
  const [states, setStates] = createSignal<Record<string, SaveState>>({});
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [spaces, setSpaces] = createSignal<SpaceJSON[]>([]);
  const [tags, setTags] = createSignal<TagJSON[]>([]);
  const [activity, setActivity] = createSignal<ActivityJSON[]>([]);
  const [occurrences, setOccurrences] = createSignal<OccurrenceJSON[]>([]);
  const [scheduleError, setScheduleError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  const [metadataError, setMetadataError] = createSignal("");
  const [undos, setUndos] = createSignal<Undo[]>([]);
  const [deleting, setDeleting] = createSignal<ReadonlySet<string>>(new Set());
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const queues = new Map<string, Promise<void>>();
  const toggleVersions = new Map<string, number>();
  let generation = 0, unsubscribe: (() => void) | undefined, users = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const state = (id: string) => states()[id] ?? "live";
  const report = (id: string, error: NoteFailure) => batch(() => {
    setStates(v => ({ ...v, [id]: error.conflict ? "conflict" : "failed" }));
    setErrors(v => ({ ...v, [id]: error.message }));
  });
  function accept(json: NoteJSON, full = false, relations: Pick<NoteJSON, "checklist" | "tags"> = {}) {
    if (!json.id) throw new Error("The core returned a note without an ID.");
    const old = records()[json.id];
    if (old && BigInt(old.rev) > BigInt(revisionString(json.rev))) return old;
    const record = recordFromJSON(full ? json : { ...old, ...json,
      checklist: relations.checklist ?? old?.checklist, tags: relations.tags ?? old?.tags,
      schedule: old?.schedule, place: old?.place,
      attachments: old?.attachments, completions: old?.completions });
    batch(() => {
      setRecords(v => ({ ...v, [record.id]: record }));
      setRows(v => { const exists = v.some(row => row.id === record.id); return exists ? v.map(row => row.id === record.id ? record : row) : [...v, record]; });
    });
    return record;
  }
  async function load(id: string, force = false) {
    if (records()[id] && !force) return records()[id]!;
    const result = await getBridge().notes.get({ id, include: INCLUDE });
    if (!result.note) throw new Error("Note unavailable. It may have been deleted.");
    return accept(result.note, true);
  }
  function overlay<T extends NoteRow>(row: T): T {
    let next = { ...row, ...optimistic()[row.id] };
    for (const draft of [inflight()[row.id], drafts()[row.id]]) {
      if (!draft) continue;
      next = applyPatch(next, draft.patch);
      if (draft.tagIds) next = { ...next, tagIds: draft.tagIds };
      if (draft.checklist) next = { ...next, checklist: draft.checklist };
    }
    return next;
  }
  const record = (id: string) => {
    const value = records()[id]; if (!value) return undefined;
    const next = overlay(value), toggles = checkToggles()[id];
    return toggles ? { ...next, checklist: next.checklist.map(item => item.id && item.id in toggles ? { ...item, done: toggles[item.id] } : item) } : next;
  };
  const visibleRows = () => rows().filter(row => !deleting().has(row.id)).map(overlay);
  function enqueue(id: string, action: () => Promise<void>) {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.then(action);
    queues.set(id, next);
    void next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
    return next;
  }
  function mergeDraft(id: string, value: Draft) {
    setDrafts(v => ({ ...v, [id]: { ...value, ...v[id], patch: mergePatch(value.patch, v[id]?.patch ?? {}) } }));
  }
  async function saveDraft(id: string) {
    if (state(id) === "conflict" || state(id) === "failed") return;
    const draft = drafts()[id];
    if (!draft) return;
    const remaining = { ...draft, patch: { ...draft.patch } };
    batch(() => {
      setDrafts(v => { const next = { ...v }; delete next[id]; return next; });
      setInflight(v => ({ ...v, [id]: draft }));
      setStates(v => ({ ...v, [id]: "saving" }));
    });
    try {
      await load(id);
      if (Object.keys(remaining.patch).length) {
        const response = await getBridge().notes.update({ id, expectedRev: revisionString(records()[id]!.rev), ...remaining.patch });
        if (!response.note) throw new Error("The core did not acknowledge the edit.");
        accept({ ...applyPatch(records()[id]!, remaining.patch), ...response.note, content: remaining.patch.content ?? response.note.content ?? records()[id]!.content }); remaining.patch = {};
      }
      if (remaining.checklist) {
        const response = await getBridge().notes.replaceChecklist({ noteId: id, expectedRev: revisionString(records()[id]!.rev), items: remaining.checklist });
        if (!response.note) throw new Error("The core did not acknowledge the checklist.");
        accept({ ...response.note, content: records()[id]!.content }, false, { checklist: response.items ?? [] }); delete remaining.checklist;
      }
      if (remaining.tagIds) {
        const response = await getBridge().notes.setTags({ noteId: id, expectedRev: revisionString(records()[id]!.rev), tagIds: remaining.tagIds });
        if (!response.note) throw new Error("The core did not acknowledge the tags.");
        accept({ ...response.note, content: records()[id]!.content }, false, { tags: response.tags ?? [] }); delete remaining.tagIds;
      }
      setStates(v => ({ ...v, [id]: drafts()[id] ? "queued" : "live" }));
      setErrors(v => ({ ...v, [id]: "" }));
    } catch (error) {
      mergeDraft(id, remaining); report(id, parseNoteFailure(error));
    } finally {
      setInflight(v => { const next = { ...v }; delete next[id]; return next; });
    }
  }
  function edit(id: string, value: Partial<Draft>) {
    if (deleting().has(id)) return;
    setDrafts(v => ({ ...v, [id]: { ...v[id], ...value, patch: mergePatch(v[id]?.patch ?? {}, value.patch ?? {}) } }));
    if (state(id) === "conflict" || state(id) === "failed") return;
    setStates(v => ({ ...v, [id]: "queued" }));
    const old = timers.get(id); if (old) clearTimeout(old);
    timers.set(id, setTimeout(() => { timers.delete(id); void flush(id); }, debounceMs));
  }
  async function flush(id: string) {
    const timer = timers.get(id); if (timer) clearTimeout(timer); timers.delete(id);
    await enqueue(id, () => saveDraft(id));
  }
  async function resolve(id: string, mode: "reload" | "overwrite") {
    await enqueue(id, async () => {
      try {
        await load(id, true);
        if (mode === "reload") setDrafts(v => { const next = { ...v }; delete next[id]; return next; });
        setStates(v => ({ ...v, [id]: "live" })); setErrors(v => ({ ...v, [id]: "" }));
        if (mode === "overwrite") await saveDraft(id);
      } catch (error) { report(id, parseNoteFailure(error)); }
    });
  }
  function addUndo(id: string, kind: "delete" | "complete", message: string, run: () => Promise<void>, expire?: () => Promise<void>) {
    const timer = setTimeout(() => {
      setUndos(v => v.filter(undo => undo.timer !== timer));
      void expire?.();
    }, 8000);
    setUndos(v => [...v, { id, kind, message, run, timer, expiresAt: Date.now() + 8000 }]);
  }
  function cancelQueuedDeletes() {
    const pending = undos().filter(item => item.kind === "delete");
    if (!pending.length) return;
    pending.forEach(item => clearTimeout(item.timer));
    batch(() => {
      setUndos(v => v.filter(item => item.kind !== "delete"));
      setDeleting(new Set<string>());
    });
  }
  async function undo(item: Undo) {
    if (Date.now() >= item.expiresAt || !undos().includes(item)) return;
    clearTimeout(item.timer); setUndos(v => v.filter(value => value !== item));
    try { await item.run(); } catch (error) { report(item.id, parseNoteFailure(error)); }
  }
  async function toggle(id: string, kind: "status" | "pinned", explicit?: boolean) {
    const row = visibleRows().find(row => row.id === id);
    if (!row || deleting().has(id)) return;
    const value = explicit ?? (kind === "pinned" ? !row.pinned : row.status !== "completed");
    const toggleKey = `${id}:${kind}`;
    const version = (toggleVersions.get(toggleKey) ?? 0) + 1; toggleVersions.set(toggleKey, version);
    const patch = kind === "pinned" ? { pinned: value } : { status: value ? "completed" : "active" };
    setOptimistic(v => ({ ...v, [id]: { ...v[id], ...patch } }));
    await enqueue(id, async () => {
      try {
        await saveDraft(id);
        if (state(id) === "conflict" || state(id) === "failed") throw new Error("Resolve the unsaved edit before changing this note.");
        await load(id); setStates(v => ({ ...v, [id]: "saving" }));
        const expectedRev = revisionString(records()[id]!.rev);
        const response = kind === "pinned"
          ? await getBridge().notes.setPinned({ id, pinned: value, expectedRev })
          : await getBridge().notes.setStatus({ id, status: value ? "completed" : "active", expectedRev });
        if (!response.note) throw new Error("The core did not acknowledge the action.");
        accept({ ...response.note, ...patch });
        if (kind === "status") await load(id, true);
        setStates(v => ({ ...v, [id]: drafts()[id] ? "queued" : "live" }));
        if (kind === "status" && value) addUndo(id, "complete", `Completed “${row.title}”`, () => toggle(id, "status", false));
      } catch (error) { if (state(id) !== "conflict") report(id, parseNoteFailure(error)); }
      finally {
        // Later queued toggles still carry their own value into the serialized write.
        if (toggleVersions.get(toggleKey) === version) setOptimistic(v => { const next = { ...v, [id]: { ...v[id] } }; delete next[id]![kind === "pinned" ? "pinned" : "status"]; return next; });
      }
    });
  }
  async function toggleChecklist(id: string, itemId: string, done: boolean) {
    const key = `${id}:check:${itemId}`;
    const version = (toggleVersions.get(key) ?? 0) + 1; toggleVersions.set(key, version);
    setCheckToggles(v => ({ ...v, [id]: { ...v[id], [itemId]: done } }));
    await enqueue(id, async () => {
      try {
        await saveDraft(id);
        if (state(id) === "conflict" || state(id) === "failed") throw new Error("Resolve the unsaved edit before toggling a checklist item.");
        await load(id); setStates(v => ({ ...v, [id]: "saving" }));
        const response = await getBridge().notes.toggleCheckItem({ noteId: id, itemId, done, expectedRev: revisionString(records()[id]!.rev) });
        if (!response.note) throw new Error("The core did not acknowledge the checklist action.");
        accept({ ...response.note, content: records()[id]!.content });
        await load(id, true);
        setStates(v => ({ ...v, [id]: drafts()[id] ? "queued" : "live" }));
      } catch (error) { if (state(id) !== "conflict") report(id, parseNoteFailure(error)); }
      finally {
        if (toggleVersions.get(key) === version) setCheckToggles(v => {
          const next = { ...v, [id]: { ...v[id] } }; delete next[id]![itemId]; return next;
        });
      }
    });
  }
  async function queueDelete(id: string) {
    await flush(id);
    if (state(id) === "conflict" || state(id) === "failed") throw new Error("Resolve unsaved edits before deleting.");
    const snapshot = await load(id);
    if (deleting().has(id)) return;
    setDeleting(v => new Set([...v, id]));
    addUndo(id, "delete", `Deletion queued: “${snapshot.title}”`, async () => { setDeleting(v => { const next = new Set(v); next.delete(id); return next; }); }, async () => {
      await enqueue(id, async () => {
        try {
          await getBridge().notes.delete({ id, expectedRev: revisionString(snapshot.rev) });
          batch(() => {
            setRows(v => v.filter(row => row.id !== id));
            setRecords(v => { const next = { ...v }; delete next[id]; return next; });
          });
        } catch (error) { report(id, parseNoteFailure(error)); }
        finally { setDeleting(v => { const next = new Set(v); next.delete(id); return next; }); }
      });
    });
  }
  async function create(input: CreateNoteJSON) {
    const response = await getBridge().notes.create(input);
    if (!response.note) throw new Error("The core did not acknowledge the new note.");
    return accept(response.note, true);
  }
  async function refresh() {
    const current = ++generation; setLoading(true); setLoadError("");
    try {
      const bridge = getBridge(), all: NoteRow[] = [], seen = new Set<string>();
      let cursor = "";
      do {
        const result = await bridge.notes.list({ limit: 500, cursor, order: "updated" });
        if (current !== generation) return;
        all.push(...(result.notes ?? []).map(rowFromJSON)); cursor = result.nextCursor ?? "";
        if (cursor && seen.has(cursor)) throw new Error("The core returned a repeated list cursor.");
        seen.add(cursor);
      } while (cursor);
      if (current === generation) {
        setRows(all.map(row => { const cached = records()[row.id]; return cached && BigInt(cached.rev) >= BigInt(revisionString(row.rev)) ? cached : row; }));
        // Do not overwrite unsaved drafts; clean details are invalidated by the same event.
        await Promise.all(Object.keys(records()).filter(id => !drafts()[id] && !inflight()[id] && !queues.has(id) && !deleting().has(id)).map(id => load(id, true).catch(error => report(id, parseNoteFailure(error)))));
      }
    } catch (error) { if (current === generation) setLoadError(errorText(error)); }
    finally { if (current === generation) setLoading(false); }
  }
  async function refreshMetadata() {
    const now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from); to.setDate(to.getDate() + 8);
    void getBridge().schedule.listOccurrences({ from: from.toISOString(), to: to.toISOString(), limit: 10000 }).then(result => { setOccurrences(result.occurrences ?? []); setScheduleError(""); }).catch(error => setScheduleError(errorText(error)));
    const results = await Promise.allSettled([getBridge().spaces.list({}), getBridge().tags.list({}), getBridge().activity.list({ limit: 100 })]);
    batch(() => {
      if (results[0].status === "fulfilled") setSpaces(results[0].value.spaces ?? []);
      if (results[1].status === "fulfilled") setTags(results[1].value.tags ?? []);
      if (results[2].status === "fulfilled") setActivity(results[2].value.events ?? []);
      setMetadataError(results.filter(value => value.status === "rejected").map(value => errorText(value.reason)).join("; "));
    });
  }
  /** Creates a tag and returns its id, or undefined when the core refused it. */
  async function createTag(name: string): Promise<string | undefined> {
    try {
      const response = await getBridge().tags.create({ name: name.trim() });
      await refreshMetadata();
      return response.tag?.id;
    } catch (value) {
      setMetadataError(errorText(value));
      return undefined;
    }
  }
  const onPageHide = () => cancelQueuedDeletes();
  function connect() {
    users++;
    if (!unsubscribe) {
      try {
        unsubscribe = getBridge().onChange(event => {
          if (!event.resync && !event.changes.some(change => ["note", "notes", "check_item", "checklist", "tag", "space", "activity", "schedule"].includes(change.entity))) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => { void refresh(); void refreshMetadata().catch(error => setMetadataError(errorText(error))); }, 100);
        });
        window.addEventListener("pagehide", onPageHide);
        void refresh(); void refreshMetadata().catch(error => setMetadataError(errorText(error)));
      } catch (error) { setLoadError(errorText(error)); }
    }
    return () => {
      users--;
      if (users === 0) {
        unsubscribe?.(); unsubscribe = undefined; if (refreshTimer) clearTimeout(refreshTimer);
        window.removeEventListener("pagehide", onPageHide);
      }
      // Draft saves and undo timers intentionally survive route/detail unmounts.
    };
  }
  function dispose() {
    generation++; unsubscribe?.(); unsubscribe = undefined;
    window.removeEventListener("pagehide", onPageHide);
    if (refreshTimer) clearTimeout(refreshTimer);
    timers.forEach(clearTimeout); timers.clear();
    cancelQueuedDeletes();
    undos().forEach(item => clearTimeout(item.timer));
    setUndos([]);
  }
  return { rows: visibleRows, record, state, errors, drafts, spaces, tags, activity, loading, loadError, metadataError, occurrences, scheduleError, undos, deleting,
    load, edit: (id: string, patch: Patch) => edit(id, { patch }), editChecklist: (id: string, checklist: ChecklistInput[]) => edit(id, { checklist }),
    editTags: (id: string, tagIds: string[]) => edit(id, { tagIds }), flush, resolve, toggle, toggleChecklist, queueDelete, create, createTag, refresh, refreshMetadata, connect, undo, cancelQueuedDeletes, dispose };
}
export type NotesStore = ReturnType<typeof createNotesStore>;
export const notesStore = createNotesStore();
