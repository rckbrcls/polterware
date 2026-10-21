import { vi } from "vitest";
import type { CalendarWireBridge, OccurrenceJSON } from "./bridge";
import type { ScheduleJSON } from "./mapping";

export type FakeOccurrence = OccurrenceJSON & { noteId: string; title: string; occurrenceAt: string };

export type FakeNote = {
  id: string;
  title: string;
  rev: string;
  schedule?: ScheduleJSON;
};

export function fakeCalendarBridge(seed: {
  occurrences?: FakeOccurrence[];
  notes?: FakeNote[];
  spaces?: { id: string; name: string; color: string }[];
  weekStart?: "mon" | "sun";
} = {}) {
  const occurrences = [...(seed.occurrences ?? [])];
  const notes = new Map((seed.notes ?? []).map(note => [note.id, { ...note }]));
  for (const occurrence of occurrences) {
    if (!notes.has(occurrence.noteId)) notes.set(occurrence.noteId, { id: occurrence.noteId, title: occurrence.title, rev: "1" });
  }
  let listener: Parameters<CalendarWireBridge["onChange"]>[0] | undefined;
  const schedule = {
    listOccurrences: vi.fn(async (input?: { from?: string; to?: string; includeCompleted?: boolean }) => {
      const from = Date.parse(input?.from ?? "");
      const to = Date.parse(input?.to ?? "");
      return {
        occurrences: occurrences.filter(item => {
          const at = Date.parse(item.occurrenceAt);
          if (!Number.isFinite(from) || !Number.isFinite(to)) return true;
          return at >= from && at < to && (input?.includeCompleted || !item.completed);
        }),
      };
    }),
    set: vi.fn(async (input?: { schedule?: ScheduleJSON }) => {
      const id = input?.schedule?.noteId ?? "";
      const note = notes.get(id);
      if (note) {
        note.schedule = { ...note.schedule, ...input?.schedule, noteId: id };
        note.rev = String(BigInt(note.rev) + 1n);
      }
      return { schedule: input?.schedule };
    }),
  };
  const wire = {
    notes: {
      create: vi.fn(async (input?: { title?: string }) => {
        const note: FakeNote = { id: `created-${notes.size + 1}`, title: input?.title ?? "Untitled note", rev: "1" };
        notes.set(note.id, note);
        return { note };
      }),
      get: vi.fn(async (input?: { id?: string }) => {
        const note = notes.get(input?.id ?? "");
        if (!note) throw new Error("Note unavailable. It may have been deleted.");
        return { note: { ...note } };
      }),
    },
    spaces: {
      list: vi.fn(async () => ({ spaces: seed.spaces ?? [{ id: "space-1", name: "Home", color: "#7EA8F0" }] })),
    },
    schedule,
    settings: {
      get: vi.fn(async () => ({ settings: { calendarWeekStart: seed.weekStart ?? "mon" } })),
    },
    onChange: vi.fn(callback => {
      listener = callback;
      return () => { listener = undefined; };
    }),
  } as unknown as CalendarWireBridge;
  return {
    wire,
    schedule,
    occurrences,
    notes,
    emit: () => listener?.({ resync: false, changes: [{ entity: "schedule", id: "note-1", op: "update" }] }),
  };
}
