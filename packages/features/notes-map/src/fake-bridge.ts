import { vi } from "vitest";
import type { MapWireBridge } from "./bridge";
import { DEFAULT_RADIUS_M, type NoteJSON, type PlaceJSON, type SettingsJSON } from "./model";

export function fakeMapBridge(seed?: {
  places?: PlaceJSON[];
  notes?: NoteJSON[];
  settings?: SettingsJSON;
}) {
  const places = new Map((seed?.places ?? [{
    noteId: "note-1", name: "Home", lat: -23.5505, lng: -46.6333, radiusM: DEFAULT_RADIUS_M, event: "enter", active: true, updatedAt: "2026-10-04T12:00:00.000Z",
  }]).map(place => [place.noteId ?? "", structuredClone(place)]));
  const notes = new Map((seed?.notes ?? [{
    id: "note-1", title: "Buy milk", content: "", status: "active", rev: "3", place: places.get("note-1"),
  }]).map(note => [note.id ?? "", structuredClone(note)]));
  let settings: SettingsJSON = { mapGeocoding: false, mapOnline: false, mapProvider: "openfreemap", ...seed?.settings };
  let listener: Parameters<MapWireBridge["onChange"]>[0] | undefined;

  const wire = {
    places: {
      listInBounds: vi.fn(async (input?: { south?: number; west?: number; north?: number; east?: number }) => {
        const south = input?.south ?? -90, west = input?.west ?? -180, north = input?.north ?? 90, east = input?.east ?? 180;
        return { places: [...places.values()].filter(place => (place.lat ?? 0) >= south && (place.lat ?? 0) <= north && (place.lng ?? 0) >= west && (place.lng ?? 0) <= east) };
      }),
      set: vi.fn(async (input?: { expectedRev?: string; place?: PlaceJSON }) => {
        const note = notes.get(input?.place?.noteId ?? "");
        if (input?.expectedRev && note && input.expectedRev !== note.rev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" });
        const place = { ...input?.place, radiusM: input?.place?.radiusM ?? DEFAULT_RADIUS_M, event: input?.place?.event || "enter", active: input?.place?.active ?? true, updatedAt: new Date().toISOString() };
        places.set(place.noteId ?? "", place);
        if (note) {
          note.place = place;
          note.rev = String(BigInt(note.rev ?? "0") + 1n);
        }
        return { place };
      }),
      clear: vi.fn(async (input?: { noteId?: string; expectedRev?: string }) => {
        const note = notes.get(input?.noteId ?? "");
        if (input?.expectedRev && note && input.expectedRev !== note.rev) throw Object.assign(new Error("note rev conflict"), { code: "conflict" });
        places.delete(input?.noteId ?? "");
        if (note) {
          note.place = undefined;
          note.rev = String(BigInt(note.rev ?? "0") + 1n);
        }
        return {};
      }),
    },
    notes: {
      get: vi.fn(async (input?: { id?: string }) => {
        const note = notes.get(input?.id ?? "");
        if (!note) throw new Error("Note not found");
        return { note: structuredClone(note) };
      }),
      list: vi.fn(async (input?: { hasPlace?: boolean; limit?: number; cursor?: string }) => {
        const limit = input?.limit ?? 50;
        if (limit < 1 || limit > 500) throw new Error("must be between 1 and 500");
        const rows = [...notes.values()].filter(note => !input?.hasPlace || Boolean(note.place ?? places.get(note.id ?? "")));
        const offset = Number(input?.cursor ?? 0);
        return { notes: rows.slice(offset, offset + limit).map(note => ({ id: note.id, title: note.title, snippet: note.content, rev: note.rev })), total: rows.length, nextCursor: offset + limit < rows.length ? String(offset + limit) : "" };
      }),
    },
    settings: {
      get: vi.fn(async () => ({ settings: structuredClone(settings) })),
      set: vi.fn(async (input?: { keys?: string[]; settings?: SettingsJSON }) => {
        settings = { ...settings, ...input?.settings };
        return { settings: structuredClone(settings) };
      }),
    },
    reminders: {
      status: vi.fn(async () => ({ permission: "authorized", armed: 0, planned: 0, notifierLastSeenAt: new Date().toISOString() })),
    },
    spaces: { list: vi.fn(async () => ({ spaces: [] })) },
    tags: { list: vi.fn(async () => ({ tags: [] })) },
    search: { search: vi.fn(async () => ({ hits: [] })) },
    app: {
      onDeepLink: vi.fn(() => () => {}),
      getDeepLink: vi.fn(async () => null),
      requestNotificationAuthorization: vi.fn(async () => true),
      openDeepLink: vi.fn(async () => {}),
    },
    onChange: vi.fn(callback => {
      listener = callback;
      return () => { listener = undefined; };
    }),
  } as unknown as MapWireBridge;

  return {
    wire,
    places,
    notes,
    emit: (entity = "place", id = "note-1") => listener?.({ resync: false, changes: [{ entity, id, op: "update" }] }),
  };
}
