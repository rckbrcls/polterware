import { batch, createSignal } from "solid-js";
import { browserBridge } from "./bridge";
import {
  DROP_PATH_REFUSED, MAX_RECORDING_BYTES, MICROPHONE_DENIED, MICROPHONE_UNAVAILABLE, RECORDING_OVERSIZE,
  errorText, previewUrl, recordingFileName, reorderIds, revisionString,
  type AttachmentJSON, type AttachmentsBridge, type MicrophoneState, type SaveState,
} from "./model";

export type AttachmentsStore = ReturnType<typeof createAttachmentsStore>;

export function createAttachmentsStore(getBridge: () => AttachmentsBridge = browserBridge) {
  const [items, setItems] = createSignal<AttachmentJSON[]>([]);
  const [state, setState] = createSignal<SaveState>("live");
  const [error, setError] = createSignal("");
  const [microphone, setMicrophone] = createSignal<MicrophoneState>("idle");
  const [fetchTitles, setFetchTitles] = createSignal(false);
  const [noteRev, setNoteRev] = createSignal("0");
  const [recording, setRecording] = createSignal(false);
  let unsubscribe: (() => void) | undefined;
  let users = 0;
  let activeNote = "";

  function fail(value: unknown) {
    batch(() => { setState("failed"); setError(errorText(value)); });
  }
  async function refreshRev(noteId: string) {
    const result = await getBridge().notes.get({ id: noteId });
    setNoteRev(revisionString(result.note?.rev));
  }
  async function load(noteId: string) {
    if (!noteId) {
      batch(() => { setItems([]); setState("unavailable"); setError("Select a note to attach files."); });
      return;
    }
    activeNote = noteId;
    setState("queued");
    try {
      const [listed, settings] = await Promise.all([
        getBridge().attachments.list({ noteId }),
        getBridge().settings.get({}),
        refreshRev(noteId),
      ]);
      if (activeNote !== noteId) return;
      batch(() => {
        setItems(listed.attachments ?? []);
        setFetchTitles(settings.settings?.linksFetchTitles ?? false);
        setState("live");
        setError("");
      });
    } catch (value) {
      if (activeNote !== noteId) return;
      batch(() => { setState("unavailable"); setError(errorText(value)); setItems([]); });
    }
  }
  async function importPaths(noteId: string, paths: readonly string[]): Promise<string[]> {
    if (!paths.length) return [];
    const before = new Set(items().map(item => item.id));
    setState("queued");
    const messages: string[] = [];
    try {
      await refreshRev(noteId);
      const expectedRev = noteRev();
      for (const sourcePath of paths) {
        try {
          await getBridge().attachments.importFromPath({ noteId, sourcePath, name: sourcePath.split("/").pop() ?? "", expectedRev });
        } catch (value) { messages.push(errorText(value)); }
      }
      await load(noteId);
      if (messages.length) batch(() => { setState("failed"); setError(messages.join(" ")); });
      return items().filter(item => item.id && !before.has(item.id)).map(item => item.id!);
    } catch (value) { fail(value); }
    return [];
  }
  async function addLink(noteId: string, url: string, title: string): Promise<string[]> {
    const before = new Set(items().map(item => item.id));
    setState("queued");
    try {
      await refreshRev(noteId);
      await getBridge().attachments.addLink({ noteId, url, title, expectedRev: noteRev() });
      await load(noteId);
      return items().filter(item => item.id && !before.has(item.id)).map(item => item.id!);
    } catch (value) { fail(value); }
    return [];
  }
  async function remove(noteId: string, id: string) {
    setState("queued");
    try {
      await getBridge().attachments.delete({ id });
      await load(noteId);
    } catch (value) { fail(value); }
  }
  async function move(noteId: string, index: number, direction: -1 | 1) {
    const orderedIds = reorderIds(items().map(item => item.id ?? ""), index, direction);
    setState("queued");
    try {
      const result = await getBridge().attachments.reorder({ noteId, orderedIds });
      batch(() => { setItems(result.attachments ?? []); setState("live"); setError(""); });
    } catch (value) { fail(value); }
  }
  async function reveal(item: AttachmentJSON) {
    const url = previewUrl(item.relPath);
    if (!url) { fail(new Error("Preview is unavailable for this attachment.")); return; }
    try { await getBridge().app.revealInFinder(url); }
    catch (value) { fail(value); }
  }
  async function pickAndImport(noteId: string): Promise<string[]> {
    try {
      const paths = await getBridge().app.pickFiles();
      return await importPaths(noteId, paths);
    } catch (value) { fail(value); }
    return [];
  }
  async function importDropped(noteId: string, files: FileList | File[]): Promise<string[]> {
    const list = [...files];
    if (!list.length) return [];
    setState("queued");
    try {
      const granted = await getBridge().app.pathsForDroppedFiles(list);
      const refused = list.length - granted.length;
      if (!granted.length) {
        batch(() => { setState("failed"); setError(DROP_PATH_REFUSED); });
        return [];
      }
      const ids = await importPaths(noteId, granted);
      if (refused > 0) {
        const coreError = error();
        batch(() => { setState("failed"); setError([coreError, DROP_PATH_REFUSED].filter(Boolean).join(" ")); });
      }
      return ids;
    } catch (value) { fail(value); }
    return [];
  }
  async function importRecording(noteId: string, blob: Blob): Promise<string[]> {
    if (blob.size > MAX_RECORDING_BYTES) {
      fail(new Error(RECORDING_OVERSIZE));
      return [];
    }
    setState("queued");
    try {
      const name = recordingFileName(blob.type);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength > MAX_RECORDING_BYTES) {
        fail(new Error(RECORDING_OVERSIZE));
        return [];
      }
      const sourcePath = await getBridge().app.writeTempFile(bytes, name);
      return await importPaths(noteId, [sourcePath]);
    } catch (value) { fail(value); }
    return [];
  }
  async function requestMicrophone(): Promise<MicrophoneState> {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicrophone("unavailable"); return "unavailable";
    }
    try {
      const granted = await getBridge().app.startMicrophone();
      const next: MicrophoneState = granted ? "granted" : "denied";
      setMicrophone(next);
      return next;
    } catch {
      setMicrophone("unavailable");
      return "unavailable";
    }
  }
  function microphoneCopy(value: MicrophoneState) {
    if (value === "denied") return MICROPHONE_DENIED;
    if (value === "unavailable") return MICROPHONE_UNAVAILABLE;
    return "";
  }
  function connect() {
    users += 1;
    if (users === 1) {
      try { unsubscribe = getBridge().onChange(event => {
        if (event.resync || event.changes.some(change => change.entity === "attachment" || change.entity === "note" || change.entity === "setting")) {
          if (activeNote) void load(activeNote);
        }
      }); } catch { /* Core offline: load() reports unavailable. */ }
    }
    return () => {
      users -= 1;
      if (users <= 0) { users = 0; unsubscribe?.(); unsubscribe = undefined; }
    };
  }
  function dispose() {
    users = 0; unsubscribe?.(); unsubscribe = undefined;
    batch(() => { setItems([]); setState("live"); setError(""); setMicrophone("idle"); setRecording(false); });
  }
  return {
    items, state, error, microphone, fetchTitles, noteRev, recording, setRecording,
    load, importPaths, addLink, remove, move, reveal, pickAndImport, importDropped, importRecording,
    requestMicrophone, microphoneCopy, connect, dispose, fail,
  };
}

export const attachmentsStore = createAttachmentsStore();
