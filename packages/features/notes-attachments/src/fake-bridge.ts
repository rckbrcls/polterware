import { vi } from "vitest";
import type { AttachmentJSON, AttachmentsBridge } from "./model";

export const NOTE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
export const PHOTO_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
export const AUDIO_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
export const FILE_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
export const LINK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB3";

export function attachmentFixture(overrides: Partial<AttachmentJSON> = {}): AttachmentJSON {
  return {
    id: PHOTO_ID,
    noteId: NOTE_ID,
    kind: "photo",
    name: "photo.png",
    mime: "image/png",
    sizeBytes: "1024",
    relPath: `${NOTE_ID}/${PHOTO_ID}.png`,
    sortOrder: 0,
    createdAt: "2026-10-04T12:00:00.000Z",
    ...overrides,
  };
}

/** All behavior fixtures use the same JSON input/output boundary as the Electron preload. */
export function fakeBridge(seed: AttachmentJSON[] = [attachmentFixture()]) {
  const data = new Map(seed.map(item => [item.id!, structuredClone(item)]));
  let noteRev = "1";
  let listener: Parameters<AttachmentsBridge["onChange"]>[0] | undefined;
  let nextId = 10;
  function listFor(noteId: string) {
    return [...data.values()].filter(item => item.noteId === noteId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  function emit(id: string) {
    listener?.({ resync: false, changes: [{ entity: "attachment", id, op: "update" }] });
  }
  const bridge: AttachmentsBridge = {
    attachments: {
      list: vi.fn<AttachmentsBridge["attachments"]["list"]>(async input => ({ attachments: listFor(input?.noteId ?? "").map(item => structuredClone(item)) })),
      importFromPath: vi.fn<AttachmentsBridge["attachments"]["importFromPath"]>(async input => {
        if (input?.expectedRev && input.expectedRev !== noteRev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" });
        if (input?.sourcePath?.includes("oversize")) throw new Error("attachment exceeds kind size limit");
        if (input?.sourcePath?.includes("quota")) throw new Error("attachment quota exceeded");
        const id = `01ARZ3NDEKTSV4RRFFQ69G5F${String(nextId++).padStart(2, "0")}`;
        const name = input?.name || (input?.sourcePath ?? "file.bin").split("/").pop() || "file.bin";
        const photo = /\.(png|jpe?g|gif|webp)$/i.test(name);
        const audio = /\.(mp3|wav|m4a|webm)$/i.test(name);
        const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ".bin";
        const item: AttachmentJSON = {
          id, noteId: input?.noteId, kind: photo ? "photo" : audio ? "audio" : "file", name,
          mime: photo ? "image/png" : audio ? "audio/webm" : "application/octet-stream",
          sizeBytes: "12", relPath: `${input?.noteId}/${id}${ext}`, sortOrder: data.size, createdAt: "2026-10-04T12:00:00.000Z",
        };
        data.set(id, item); emit(id); return { attachment: structuredClone(item) };
      }),
      addLink: vi.fn<AttachmentsBridge["attachments"]["addLink"]>(async input => {
        if (input?.expectedRev && input.expectedRev !== noteRev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" });
        if (!input?.url?.startsWith("http://") && !input?.url?.startsWith("https://")) throw new Error("url must be an http or https URL");
        const id = `01ARZ3NDEKTSV4RRFFQ69G5F${String(nextId++).padStart(2, "0")}`;
        const item: AttachmentJSON = { id, noteId: input?.noteId, kind: "link", url: input?.url, title: input?.title || undefined, sortOrder: data.size, createdAt: "2026-10-04T12:00:00.000Z" };
        data.set(id, item); emit(id); return { attachment: structuredClone(item) };
      }),
      delete: vi.fn<AttachmentsBridge["attachments"]["delete"]>(async input => { data.delete(input?.id ?? ""); return {}; }),
      reorder: vi.fn<AttachmentsBridge["attachments"]["reorder"]>(async input => {
        (input?.orderedIds ?? []).forEach((id, sortOrder) => { const item = data.get(id); if (item) data.set(id, { ...item, sortOrder }); });
        return { attachments: listFor(input?.noteId ?? "").map(item => structuredClone(item)) };
      }),
      openInfo: vi.fn<AttachmentsBridge["attachments"]["openInfo"]>(async input => {
        const item = data.get(input?.id ?? "");
        if (!item?.relPath) throw new Error("links have no local file");
        return { id: item.id!, absolutePath: `/tmp/notes/${item.relPath}`, mime: item.mime ?? "", name: item.name ?? "", kind: item.kind ?? "" };
      }),
    },
    notes: {
      get: vi.fn(async () => ({ note: { id: NOTE_ID, title: "Note", rev: noteRev } })),
      list: vi.fn(async () => ({ notes: [], total: 0 })),
      create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})),
      setStatus: vi.fn(async () => ({})), setPinned: vi.fn(async () => ({})), reorder: vi.fn(async () => ({})),
      toggleCheckItem: vi.fn(async () => ({})), replaceChecklist: vi.fn(async () => ({})), setTags: vi.fn(async () => ({})), bulkAction: vi.fn(async () => ({})),
    } as AttachmentsBridge["notes"],
    settings: {
      get: vi.fn(async () => ({ settings: { linksFetchTitles: false } })),
      set: vi.fn(async () => ({ settings: { linksFetchTitles: false } })),
    },
    onChange: vi.fn(callback => { listener = callback; return () => { listener = undefined; }; }),
    app: {
      pickFiles: vi.fn(async () => [] as string[]),
      pathsForDroppedFiles: vi.fn(async (files: File[]) =>
        [...files].filter(file => file?.name && !file.name.includes("refused")).map(file => `/tmp/${file.name}`),
      ),
      writeTempFile: vi.fn(async (_bytes: Uint8Array, name: string) => `/tmp/tmp-import/${name}`),
      revealInFinder: vi.fn(async () => {}),
      startMicrophone: vi.fn(async () => false),
    },
  };
  return {
    bridge, data,
    setRev: (rev: string) => { noteRev = rev; },
    emit: (id = PHOTO_ID) => emit(id),
  };
}
