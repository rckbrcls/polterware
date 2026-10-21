import { vi } from "vitest";
import type { ScheduleWireBridge } from "./bridge";
import type { ScheduleJSON } from "./mapping";

export type FakeNote = {
  id: string;
  status?: string;
  rev?: string;
  schedule?: ScheduleJSON;
  completions?: { occurrenceAt: string; completedAt?: string }[];
};

export function fakeScheduleBridge(seed: FakeNote = { id: "note-1", status: "active", rev: "1" }) {
  const note: FakeNote = { completions: [], ...seed };
  let listener: Parameters<ScheduleWireBridge["onChange"]>[0] | undefined;
  const schedule = {
    set: vi.fn(async (input?: { schedule?: ScheduleJSON }) => {
      note.schedule = { ...note.schedule, ...input?.schedule, noteId: note.id };
      return { schedule: note.schedule };
    }),
    clear: vi.fn(async () => {
      note.schedule = undefined;
      return {};
    }),
    preview: vi.fn(async (input?: { schedule?: ScheduleJSON; limit?: number }) => ({
      occurrences: input?.schedule?.fireAt ? [input.schedule.fireAt] : [],
      description: "Preview unavailable in the fixture until the core responds.",
    })),
    completeOccurrence: vi.fn(async (input?: { occurrenceAt?: string }) => {
      const occurrenceAt = input?.occurrenceAt ?? "";
      note.completions = [...(note.completions ?? []).filter(item => item.occurrenceAt !== occurrenceAt), { occurrenceAt, completedAt: new Date().toISOString() }];
      return { completion: { noteId: note.id, occurrenceAt } };
    }),
    reopenOccurrence: vi.fn(async (input?: { occurrenceAt?: string }) => {
      note.completions = (note.completions ?? []).filter(item => item.occurrenceAt !== input?.occurrenceAt);
      return {};
    }),
    setFocusRecipe: vi.fn(async (input?: { enabled?: boolean; workMin?: number; shortBreakMin?: number; longBreakMin?: number; cycles?: number; autoContinue?: boolean }) => {
      if (!note.schedule) throw new Error("Save a schedule before enabling a focus recipe.");
      note.schedule = {
        ...note.schedule,
        focusEnabled: input?.enabled,
        focusWorkMin: input?.workMin,
        focusShortBreakMin: input?.shortBreakMin,
        focusLongBreakMin: input?.longBreakMin,
        focusCycles: input?.cycles,
        focusAutoContinue: input?.autoContinue,
      };
      return { schedule: note.schedule };
    }),
  };
  const reminders = {
    status: vi.fn(async () => ({ permission: "authorized", armed: 1, planned: 1, notifierLastSeenAt: new Date().toISOString() })),
    snooze: vi.fn(async (input?: { occurrenceAt?: string; minutes?: number }) => ({
      oneOffId: "one-1",
      fireAt: new Date(Date.parse(input?.occurrenceAt ?? Date.now().toString()) + (input?.minutes ?? 10) * 60_000).toISOString(),
    })),
  };
  const wire = {
    notes: {
      get: vi.fn(async () => ({ note: { id: note.id, title: "Scheduled", status: note.status ?? "active", rev: note.rev ?? "1", content: "", completions: note.completions ?? [], ...(note.schedule ? { schedule: note.schedule } : {}) } })),
      list: vi.fn(async () => ({ notes: [], total: 0 })),
    },
    spaces: { list: vi.fn(async () => ({ spaces: [] })) },
    tags: { list: vi.fn(async () => ({ tags: [] })) },
    search: { search: vi.fn(async () => ({ hits: [] })) },
    schedule,
    reminders,
    settings: {
      get: vi.fn(async () => ({ settings: { notificationsSnoozeMinutes: 10, focusWorkMin: 25, focusShortBreakMin: 5, focusLongBreakMin: 15, focusCycles: 4, focusAutoContinue: true } })),
    },
    onChange: vi.fn(callback => {
      listener = callback;
      return () => { listener = undefined; };
    }),
    app: {
      onDeepLink: vi.fn(() => () => {}),
      getDeepLink: vi.fn(async () => null),
      requestNotificationAuthorization: vi.fn(async () => true),
    },
  } as unknown as ScheduleWireBridge;
  return {
    wire,
    note,
    emit: () => listener?.({ resync: false, changes: [{ entity: "schedule", id: note.id, op: "update" }] }),
  };
}
