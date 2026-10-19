import { vi } from "vitest";
import type { FocusBridge, FocusDefaultsJSON, FocusSessionJSON, NoteJSON, SettingsJSON } from "./bridge";

export const DEFAULTS: FocusDefaultsJSON = {
  workMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 4, autoContinue: true, sounds: true, notifications: true,
};

export const SETTINGS: SettingsJSON = {
  appearanceTheme: "dark",
  notificationsSound: "glass",
  notificationsAllDayTime: "09:00",
  notificationsSnoozeMinutes: 10,
  focusWorkMin: 25,
  focusShortBreakMin: 5,
  focusLongBreakMin: 15,
  focusCycles: 4,
  focusAutoContinue: true,
  focusSounds: true,
  focusNotifications: true,
  mapOnline: false,
  mapProvider: "",
  agentsMcpPort: 47600,
  agentsMcpEnabled: true,
  agentsAllowFileAttach: false,
  appKeepRunningInBackground: true,
  linksFetchTitles: false,
};

export function noteWithRecipe(id = "note-1"): NoteJSON {
  return {
    id, title: "Deep work", content: "", status: "active", rev: "1",
    schedule: {
      noteId: id, focusEnabled: true, focusWorkMin: 12, focusShortBreakMin: 3, focusLongBreakMin: 9, focusCycles: 2, focusAutoContinue: true,
    },
  };
}

export function fakeBridge(options: { defaults?: FocusDefaultsJSON; settings?: SettingsJSON; notes?: NoteJSON[] } = {}) {
  const defaults = { ...DEFAULTS, ...options.defaults };
  const settings = { ...SETTINGS, ...options.settings };
  const notes = new Map((options.notes ?? [noteWithRecipe()]).map(note => [note.id!, note]));
  const sessions: FocusSessionJSON[] = [];
  let oneOffs = 0;
  const armed = new Map<string, { kind: string; noteId: string; fireAt: string; title: string; body: string }>();
  let listener: Parameters<FocusBridge["onChange"]>[0] | undefined;
  const bridge: FocusBridge = {
    focus: {
      getDefaults: vi.fn(async () => ({ defaults: { ...defaults } })),
      setDefaults: vi.fn(async input => ({ defaults: { ...defaults, ...input?.defaults } })),
      recordSession: vi.fn(async input => {
        const session: FocusSessionJSON = {
          id: `session-${sessions.length + 1}`,
          noteId: input?.noteId ?? "",
          phase: input?.phase ?? "work",
          plannedS: input?.plannedS ?? 60,
          elapsedS: input?.elapsedS ?? 0,
          state: input?.state ?? "completed",
          startedAt: input?.startedAt,
          endedAt: input?.endedAt,
        };
        sessions.push(session);
        return { session };
      }),
      listSessions: vi.fn(async () => ({ sessions: sessions.map(session => ({ ...session })) })),
    },
    reminders: {
      plan: vi.fn(async () => ({ items: [] })),
      ack: vi.fn(async () => ({})),
      snooze: vi.fn(async () => ({})),
      armOneOff: vi.fn(async input => {
        const id = `one-${++oneOffs}`;
        armed.set(id, { kind: input?.kind ?? "", noteId: input?.noteId ?? "", fireAt: input?.fireAt ?? "", title: input?.title ?? "", body: input?.body ?? "" });
        return { id, fireAt: input?.fireAt };
      }),
      cancelOneOff: vi.fn(async input => { armed.delete(input?.id ?? ""); return {}; }),
      heartbeat: vi.fn(async () => ({})),
      status: vi.fn(async () => ({ planned: 0, armed: armed.size, permission: "authorized" })),
    },
    settings: {
      get: vi.fn(async () => ({ settings: { ...settings } })),
      set: vi.fn(async () => ({ settings: { ...settings } })),
    },
    notes: {
      list: vi.fn(async () => ({ notes: [], total: 0 })),
      get: vi.fn(async input => {
        const note = notes.get(input?.id ?? "");
        if (!note) throw new Error("Note not found");
        return { note: structuredClone(note) };
      }),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
      setStatus: vi.fn(async () => ({})),
      setPinned: vi.fn(async () => ({})),
      reorder: vi.fn(async () => ({})),
      toggleCheckItem: vi.fn(async () => ({})),
      replaceChecklist: vi.fn(async () => ({})),
      setTags: vi.fn(async () => ({})),
      bulkAction: vi.fn(async () => ({})),
    },
    onChange: vi.fn(callback => { listener = callback; return () => { listener = undefined; }; }),
  };
  return { bridge, sessions, armed, notes, emit: () => listener?.({ resync: false, changes: [{ entity: "focus", id: "session-1", op: "create" }] }) };
}
