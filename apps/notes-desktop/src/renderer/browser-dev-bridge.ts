import { RPC_METHODS } from "../shared/channels";
import type { NotesDesktopBridge } from "../shared/bridge";

/** Loose protobuf-JSON records: the preview bridge speaks the wire shape the shell validates with `fromJson`. */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (input: Row) => unknown;

const DAY = 86_400_000;
const at = (dayOffset: number, hour = 9, minute = 0): string => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return new Date(date.getTime() + dayOffset * DAY).toISOString();
};
const ago = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

let counter = 100;
const nextId = (prefix: string): string => `${prefix}-${++counter}`;

function seed() {
  const spaces: Row[] = [
    { id: "space-personal", parentId: "", name: "Personal", color: "#6C8EF5", icon: "home", sortOrder: 1 },
    { id: "space-work", parentId: "", name: "Work", color: "#F59E6C", icon: "folder", sortOrder: 2 },
    { id: "space-notes", parentId: "space-work", name: "Polterware Notes", color: "#B38CF5", icon: "energy", sortOrder: 1 },
    { id: "space-polterware", parentId: "space-work", name: "Polterware", color: "#6CC5A0", icon: "brain", sortOrder: 2 },
    { id: "space-design", parentId: "space-notes", name: "Design", color: "#E47F9A", icon: "folder", sortOrder: 1 },
    { id: "space-health", parentId: "", name: "Health", color: "#F56C8E", icon: "check", sortOrder: 3 },
    { id: "space-reading", parentId: "", name: "Reading", color: "#E0C25A", icon: "book", sortOrder: 4 },
  ].map(space => ({ ...space, createdAt: ago(900), updatedAt: ago(40), rev: "1" }));

  const tags: Row[] = [
    { id: "tag-urgent", name: "urgent", color: "#F56C6C" },
    { id: "tag-errand", name: "errand", color: "#6CC5A0" },
    { id: "tag-idea", name: "idea", color: "#B38CF5" },
    { id: "tag-deep", name: "deep-work", color: "#6C8EF5" },
    { id: "tag-waiting", name: "waiting", color: "#E0C25A" },
  ].map(tag => ({ ...tag, usageCount: 0, createdAt: ago(800), updatedAt: ago(30), rev: "1" }));

  const base = (row: Row): Row => ({
    content: "", status: "active", pinned: false, dueAllDay: false, sortOrder: 0, autoCompleteOnChecklist: false,
    checklist: [], tags: [], attachments: [], completions: [], createdAt: ago(72), updatedAt: ago(5), rev: "1", ...row,
  });
  const check = (noteId: string, items: [string, boolean][]): Row[] => items.map(([title, done], index) => (
    { id: `${noteId}-c${index}`, noteId, title, detail: "", done, sortOrder: index, createdAt: ago(60), updatedAt: ago(10) }));
  const tag = (...ids: string[]): Row[] => ids.map(id => tags.find(item => item.id === id)!);

  const notes: Row[] = [
    base({ id: "mem-1", spaceId: "", title: "Call the dentist about the crown", content: "Ask about Thursday afternoon slots.", priority: 1, dueAt: at(0, 15), tags: tag("tag-urgent", "tag-errand"), createdAt: ago(3) }),
    base({ id: "mem-2", spaceId: "", title: "Idea: weekly review ritual", content: "Sunday evening, 20 minutes. Look at what slipped and what shipped.", tags: tag("tag-idea"), createdAt: ago(8) }),
    base({ id: "mem-3", spaceId: "", title: "Renew passport", dueAt: at(12), dueAllDay: true, priority: 2, createdAt: ago(20) }),
    base({ id: "mem-4", spaceId: "space-notes", title: "Polish the Polterware Notes shell layout", content: "Sidebar density, list rows, empty states and the detail panel header.", pinned: true, priority: 1, dueAt: at(1, 11), tags: tag("tag-deep") }),
    base({ id: "mem-5", spaceId: "space-notes", title: "Calendar week view overflow", content: "Events overlap when there are more than three in the same hour.", dueAt: at(2, 10), priority: 2 }),
    base({ id: "mem-6", spaceId: "space-notes", title: "Ship onboarding copy", status: "completed", completedAt: ago(26), updatedAt: ago(26) }),
    base({ id: "mem-7", spaceId: "space-polterware", title: "Review decision lifecycle Verdicts", content: "Check Challenged → Superseded transitions.", dueAt: at(-1, 17), priority: 2, tags: tag("tag-waiting") }),
    base({ id: "mem-8", spaceId: "space-polterware", title: "Release checklist", pinned: true, dueAt: at(3, 9),
      autoCompleteOnChecklist: true, checklist: check("mem-8", [["Bump versions", true], ["Run verify script", true], ["Tag the release", false], ["Publish notes", false]]) }),
    base({ id: "mem-9", spaceId: "space-health", title: "Morning run", content: "5 km, easy pace.",
      schedule: { noteId: "mem-9", active: true, fireAt: at(0, 7), tz: "UTC", freq: "daily", every: 1, endType: "never", focusEnabled: false } }),
    base({ id: "mem-10", spaceId: "space-health", title: "Deep work block", content: "Phone away. One task only.", tags: tag("tag-deep"),
      schedule: { noteId: "mem-10", active: true, fireAt: at(0, 14), tz: "UTC", freq: "weekly", every: 1, weekdayMask: 0b0111110, endType: "never", focusEnabled: true, focusWorkMin: 25, focusShortBreakMin: 5, focusLongBreakMin: 15, focusCycles: 4, focusAutoContinue: false } }),
    base({ id: "mem-11", spaceId: "space-reading", title: "Finish “Designing Data-Intensive Applications”", content: "Chapter 7 next.", dueAt: at(14),
      attachments: [{ id: "att-1", noteId: "mem-11", kind: "link", url: "https://dataintensive.net", title: "Book site", sortOrder: 0, createdAt: ago(100) }] }),
    base({ id: "mem-12", spaceId: "", title: "Buy groceries", content: "Oat milk, eggs, spinach, coffee.", dueAt: at(0, 18),
      place: { noteId: "mem-12", name: "Corner Market", lat: -23.5614, lng: -46.6559, radiusM: 150, event: "enter", active: true },
      checklist: check("mem-12", [["Oat milk", false], ["Eggs", false], ["Spinach", true], ["Coffee beans", false]]) }),
    base({ id: "mem-13", spaceId: "space-personal", title: "Pick up package", dueAt: at(1, 12),
      place: { noteId: "mem-13", name: "Post office", lat: -23.5505, lng: -46.6333, radiusM: 200, event: "enter", active: true } }),
    base({ id: "mem-14", spaceId: "space-personal", title: "Pay rent", dueAt: at(5), dueAllDay: true, priority: 1,
      schedule: { noteId: "mem-14", active: true, fireAt: at(5, 9), tz: "UTC", allDay: true, freq: "monthly", every: 1, endType: "never" } }),
    base({ id: "mem-16", spaceId: "space-work", title: "Quarterly planning notes", content: "Goals, risks and what we are deliberately not doing.", pinned: true, priority: 1, dueAt: at(2, 9) }),
    base({ id: "mem-17", spaceId: "space-work", title: "Weekly sync agenda", content: "Blockers first, then demos." }),
    base({ id: "mem-18", spaceId: "space-work", title: "Hiring pipeline", dueAt: at(4, 15), tags: tag("tag-waiting") }),
    base({ id: "mem-19", spaceId: "space-design", title: "Card grid proportions", content: "Square cards, folders tinted, files plain." }),
    base({ id: "mem-20", spaceId: "space-design", title: "Icon audit", content: "Hugeicons only." }),
    base({ id: "mem-15", spaceId: "space-personal", title: "Archive old photos", status: "completed", completedAt: ago(100), updatedAt: ago(100) }),
  ];
  for (const note of notes) for (const item of note.tags) item.usageCount += 1;
  return { spaces, tags, notes };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function scheduleLabel(schedule?: Row): string {
  if (!schedule || schedule.active === false) return "";
  const time = new Date(schedule.fireAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const every = schedule.every && schedule.every > 1 ? `Every ${schedule.every} ` : "";
  switch (schedule.freq) {
    case "daily": return every ? `${every}days at ${time}` : `Daily at ${time}`;
    case "weekly": {
      const days = WEEKDAYS.filter((_, index) => ((schedule.weekdayMask ?? 0) >> index) & 1).join(", ");
      return `${every ? `${every}weeks` : "Weekly"}${days ? ` on ${days}` : ""} at ${time}`;
    }
    case "monthly": return `${every ? `${every}months` : "Monthly"} at ${time}`;
    case "yearly": return `Yearly at ${time}`;
    case "hourly": return every ? `${every}hours` : "Hourly";
    default: return `Once at ${time}`;
  }
}

function occurrencesBetween(note: Row, from: number, to: number): number[] {
  const schedule = note.schedule as Row | undefined;
  if (!schedule || schedule.active === false || !schedule.fireAt) return [];
  const start = new Date(schedule.fireAt);
  const every = Math.max(1, Number(schedule.every ?? 1));
  const result: number[] = [];
  const limit = schedule.endType === "until" && schedule.untilAt ? new Date(schedule.untilAt).getTime() : Infinity;
  if (!schedule.freq) return start.getTime() >= from && start.getTime() <= to ? [start.getTime()] : [];
  const cursor = new Date(start);
  for (let guard = 0; guard < 2000 && cursor.getTime() <= Math.min(to, limit); guard++) {
    const time = cursor.getTime();
    const weekdayOk = schedule.freq !== "weekly" || !schedule.weekdayMask || ((schedule.weekdayMask >> cursor.getDay()) & 1) === 1;
    if (time >= from && weekdayOk) result.push(time);
    if (schedule.freq === "hourly") cursor.setHours(cursor.getHours() + every);
    else if (schedule.freq === "daily") cursor.setDate(cursor.getDate() + every);
    else if (schedule.freq === "weekly") cursor.setDate(cursor.getDate() + (schedule.weekdayMask ? 1 : 7 * every));
    else if (schedule.freq === "monthly") cursor.setMonth(cursor.getMonth() + every);
    else cursor.setFullYear(cursor.getFullYear() + every);
  }
  return result;
}

function createHandlers(emit: (changes: { entity: string; id: string; op: string }[]) => void): Record<string, Handler> {
  const db = seed();
  const settings: Row = {
    appearanceTheme: "dark", notificationsSound: "glass", notificationsAllDayTime: "09:00", notificationsSnoozeMinutes: 10,
    focusWorkMin: 25, focusShortBreakMin: 5, focusLongBreakMin: 15, focusCycles: 4, focusAutoContinue: false, focusSounds: true,
    focusNotifications: true, mapOnline: false, mapProvider: "osm", agentsMcpPort: 47321, agentsMcpEnabled: true,
    agentsAllowFileAttach: false, appKeepRunningInBackground: true, linksFetchTitles: false, calendarWeekStart: "monday", mapGeocoding: false,
  };
  const focusSessions: Row[] = [-2, -1, 0].flatMap(offset => [0, 1].map(slot => ({
    id: `fs-${offset}-${slot}`, noteId: "mem-10", phase: "work", plannedS: 1500, elapsedS: 1500, state: "completed",
    startedAt: at(offset, 9 + slot * 3), endedAt: at(offset, 9 + slot * 3, 25),
  })));
  const activity: Row[] = [
    { id: "act-1", at: ago(1), actor: "ui", entity: "note", entityId: "mem-4", op: "update", summary: "Pinned “Polish the Polterware Notes shell layout”" },
    { id: "act-2", at: ago(3), actor: "agent:codex", entity: "note", entityId: "mem-8", op: "create", summary: "Created “Release checklist”" },
    { id: "act-3", at: ago(26), actor: "ui", entity: "note", entityId: "mem-6", op: "status", summary: "Completed “Ship onboarding copy”" },
  ];
  const completions: Row[] = [];
  const noteById = (id: string) => db.notes.find(note => note.id === id);
  const descendants = (spaceId: string): Set<string> => {
    const ids = new Set([spaceId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const space of db.spaces) if (ids.has(space.parentId) && !ids.has(space.id)) { ids.add(space.id); grew = true; }
    }
    return ids;
  };
  const summary = (note: Row): Row => ({
    id: note.id, title: note.title, status: note.status, spaceId: note.spaceId, dueAt: note.dueAt, dueAllDay: note.dueAllDay,
    pinned: note.pinned, priority: note.priority, tagIds: note.tags.map((item: Row) => item.id), scheduleLabel: scheduleLabel(note.schedule),
    snippet: String(note.content ?? "").slice(0, 120), rev: note.rev, updatedAt: note.updatedAt, createdAt: note.createdAt, sortOrder: note.sortOrder,
  });
  const full = (note: Row): Row => ({ ...note, completions: completions.filter(item => item.noteId === note.id) });
  const touch = (note: Row, op = "update") => {
    note.updatedAt = new Date().toISOString();
    note.rev = String(Number(note.rev) + 1);
    emit([{ entity: "note", id: note.id, op }]);
    return { note: full(note) };
  };
  const timestamp = (value: unknown): number | undefined => (typeof value === "string" ? new Date(value).getTime() : undefined);
  const withNote = (id: string, apply: (note: Row) => void, op?: string) => {
    const note = noteById(id);
    if (!note) throw new Error(`Note ${id} not found`);
    apply(note);
    return touch(note, op);
  };

  return {
    "notes.list": input => {
      const include = input.includeDescendants ? descendants(input.spaceId ?? "") : new Set([input.spaceId ?? ""]);
      let rows = db.notes.filter(note => {
        if (input.status && note.status !== input.status) return false;
        if (input.inboxOnly && note.spaceId) return false;
        if (!input.inboxOnly && input.spaceId && !include.has(note.spaceId)) return false;
        if (input.pinned !== undefined && note.pinned !== input.pinned) return false;
        if (input.tagIds?.length && !input.tagIds.every((id: string) => note.tags.some((item: Row) => item.id === id))) return false;
        if (input.hasSchedule !== undefined && Boolean(note.schedule) !== input.hasSchedule) return false;
        if (input.hasPlace !== undefined && Boolean(note.place) !== input.hasPlace) return false;
        const due = timestamp(note.dueAt);
        if (input.dueFrom && (due === undefined || due < timestamp(input.dueFrom)!)) return false;
        if (input.dueTo && (due === undefined || due > timestamp(input.dueTo)!)) return false;
        if (input.query && !`${note.title} ${note.content}`.toLowerCase().includes(String(input.query).toLowerCase())) return false;
        return true;
      });
      rows = [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (input.order === "due") return (timestamp(a.dueAt) ?? Infinity) - (timestamp(b.dueAt) ?? Infinity);
        return timestamp(b.updatedAt)! - timestamp(a.updatedAt)!;
      });
      const total = rows.length;
      if (input.limit) rows = rows.slice(0, input.limit);
      return { notes: rows.map(summary), nextCursor: "", total };
    },
    "notes.get": input => {
      const note = noteById(input.id);
      if (!note) throw new Error("Note not found");
      return { note: full(note) };
    },
    "notes.create": input => {
      const id = nextId("mem");
      const note: Row = {
        id, spaceId: input.spaceId ?? "", title: input.title ?? "Untitled", content: input.content ?? "", status: "active", pinned: Boolean(input.pinned),
        priority: input.priority, dueAt: input.dueAt, dueAllDay: Boolean(input.dueAllDay), sortOrder: input.sortOrder ?? 0,
        autoCompleteOnChecklist: Boolean(input.autoCompleteOnChecklist), checklist: (input.checklist ?? []).map((item: Row, index: number) => (
          { id: item.id || `${id}-c${index}`, noteId: id, title: item.title, detail: item.detail ?? "", done: Boolean(item.done), sortOrder: index })),
        tags: (input.tagIds ?? []).map((tagId: string) => db.tags.find(item => item.id === tagId)).filter(Boolean), attachments: [], completions: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rev: "1",
      };
      db.notes.unshift(note);
      emit([{ entity: "note", id, op: "create" }]);
      return { note: full(note) };
    },
    "notes.update": input => withNote(input.id, note => {
      for (const key of ["title", "content", "spaceId", "priority", "dueAt", "dueAllDay", "sortOrder", "pinned", "autoCompleteOnChecklist"]) {
        if (input[key] !== undefined) note[key] = input[key];
      }
      if (input.clearSpaceId) note.spaceId = "";
      if (input.clearPriority) delete note.priority;
      if (input.clearDueAt) delete note.dueAt;
    }),
    "notes.delete": input => {
      db.notes.splice(db.notes.findIndex(note => note.id === input.id), 1);
      emit([{ entity: "note", id: input.id, op: "delete" }]);
      return {};
    },
    "notes.setStatus": input => withNote(input.id, note => {
      note.status = input.status;
      if (input.status === "completed") note.completedAt = new Date().toISOString(); else delete note.completedAt;
    }, "status"),
    "notes.setPinned": input => withNote(input.id, note => { note.pinned = Boolean(input.pinned); }),
    "notes.toggleCheckItem": input => withNote(input.noteId ?? input.id, note => {
      const item = note.checklist.find((entry: Row) => entry.id === (input.itemId ?? input.checkItemId));
      if (item) item.done = input.done ?? !item.done;
      if (note.autoCompleteOnChecklist && note.checklist.length && note.checklist.every((entry: Row) => entry.done)) note.status = "completed";
    }),
    "notes.replaceChecklist": input => withNote(input.noteId ?? input.id, note => {
      note.checklist = (input.items ?? input.checklist ?? []).map((item: Row, index: number) => (
        { id: item.id || nextId("chk"), noteId: note.id, title: item.title, detail: item.detail ?? "", done: Boolean(item.done), sortOrder: index }));
    }),
    "notes.setTags": input => withNote(input.noteId ?? input.id, note => {
      note.tags = (input.tagIds ?? []).map((tagId: string) => db.tags.find(item => item.id === tagId)).filter(Boolean);
    }),
    "spaces.list": () => ({ spaces: db.spaces }),
    "spaces.get": input => ({ space: db.spaces.find(space => space.id === input.id) }),
    "spaces.create": input => {
      const space = { id: nextId("space"), parentId: input.parentId ?? "", name: input.name ?? "Untitled Space", color: input.color ?? "", icon: input.icon ?? "",
        sortOrder: input.sortOrder ?? db.spaces.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rev: "1" };
      db.spaces.push(space);
      emit([{ entity: "space", id: space.id, op: "create" }]);
      return { space };
    },
    "spaces.update": input => {
      const space = db.spaces.find(item => item.id === input.id);
      if (!space) throw new Error("Space not found");
      for (const key of ["name", "parentId", "color", "icon", "sortOrder"]) if (input[key] !== undefined) space[key] = input[key];
      if (input.clearParent) space.parentId = "";
      emit([{ entity: "space", id: space.id, op: "update" }]);
      return { space };
    },
    "spaces.reorder": input => {
      const ordered: string[] = input.orderedIds ?? [];
      ordered.forEach((id, index) => {
        const space = db.spaces.find(item => item.id === id);
        if (space) space.sortOrder = index;
      });
      return { spaces: db.spaces.filter(space => space.parentId === (input.parentId ?? "")) };
    },
    "spaces.delete": input => {
      const ids = descendants(input.id);
      db.spaces = db.spaces.filter(space => !ids.has(space.id));
      let moved = 0;
      for (const note of db.notes) if (ids.has(note.spaceId)) { note.spaceId = ""; moved++; }
      emit([{ entity: "space", id: input.id, op: "delete" }]);
      return { deletedSpaceIds: [...ids], movedNoteCount: moved };
    },
    "tags.list": () => {
      for (const item of db.tags) item.usageCount = db.notes.filter(note => note.tags.some((entry: Row) => entry.id === item.id)).length;
      return { tags: db.tags };
    },
    "tags.create": input => {
      const created = { id: nextId("tag"), name: input.name, color: input.color ?? "", usageCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rev: "1" };
      db.tags.push(created);
      return { tag: created };
    },
    "schedule.set": input => withNote(input.schedule.noteId, note => { note.schedule = { active: true, ...input.schedule }; }),
    "schedule.clear": input => { withNote(input.noteId, note => { delete note.schedule; }); return {}; },
    "schedule.preview": input => {
      const note = { schedule: input.schedule };
      const times = occurrencesBetween(note, Date.now() - DAY, Date.now() + 90 * DAY).slice(0, input.limit || 5);
      return { occurrences: times.map(time => new Date(time).toISOString()), description: scheduleLabel(input.schedule) };
    },
    "schedule.listOccurrences": input => {
      const from = timestamp(input.from) ?? Date.now() - 31 * DAY;
      const to = timestamp(input.to) ?? Date.now() + 62 * DAY;
      const scope = input.spaceId ? (input.includeDescendants ? descendants(input.spaceId) : new Set([input.spaceId])) : undefined;
      const rows: Row[] = [];
      for (const note of db.notes) {
        if (note.status === "completed" && !note.schedule) continue;
        if (scope && !scope.has(note.spaceId)) continue;
        if (input.tagIds?.length && !input.tagIds.every((id: string) => note.tags.some((entry: Row) => entry.id === id))) continue;
        const times = note.schedule
          ? occurrencesBetween(note, from, to)
          : note.dueAt && !note.dueAllDay && timestamp(note.dueAt)! >= from && timestamp(note.dueAt)! <= to ? [timestamp(note.dueAt)!] : [];
        for (const time of times) {
          const done = completions.some(item => item.noteId === note.id && timestamp(item.occurrenceAt) === time) || note.status === "completed";
          if (done && !input.includeCompleted) continue;
          const stamp = new Date(time).toISOString();
          rows.push({ noteId: note.id, title: note.title, occurrenceAt: stamp, fireAt: stamp, completed: done, overdue: !done && time < Date.now(),
            allDay: Boolean(note.schedule?.allDay ?? note.dueAllDay), spaceId: note.spaceId, tz: note.schedule?.tz ?? "UTC" });
        }
      }
      rows.sort((a, b) => timestamp(a.occurrenceAt)! - timestamp(b.occurrenceAt)!);
      return { occurrences: input.limit ? rows.slice(0, input.limit) : rows };
    },
    "schedule.completeOccurrence": input => {
      const completion = { id: nextId("occ"), noteId: input.noteId, occurrenceAt: input.occurrenceAt, completedAt: new Date().toISOString() };
      completions.push(completion);
      emit([{ entity: "note", id: input.noteId, op: "update" }]);
      return { completion };
    },
    "schedule.reopenOccurrence": input => {
      const index = completions.findIndex(item => item.noteId === input.noteId && item.occurrenceAt === input.occurrenceAt);
      if (index >= 0) completions.splice(index, 1);
      emit([{ entity: "note", id: input.noteId, op: "update" }]);
      return {};
    },
    "schedule.setFocusRecipe": input => {
      const note = noteById(input.noteId);
      if (!note) throw new Error("Note not found");
      note.schedule = { ...(note.schedule ?? { noteId: note.id, active: true, fireAt: at(0, 9), tz: "UTC" }),
        focusEnabled: input.enabled, focusWorkMin: input.workMin, focusShortBreakMin: input.shortBreakMin, focusLongBreakMin: input.longBreakMin,
        focusCycles: input.cycles, focusAutoContinue: input.autoContinue };
      return { schedule: note.schedule };
    },
    "places.set": input => { const result = withNote(input.place.noteId, note => { note.place = { active: true, ...input.place }; }); return { place: result.note.place }; },
    "places.clear": input => { withNote(input.noteId, note => { delete note.place; }); return {}; },
    "places.listInBounds": input => ({
      places: db.notes.map(note => note.place).filter((place): place is Row => Boolean(place)
        && place.lat >= input.south && place.lat <= input.north && place.lng >= input.west && place.lng <= input.east),
    }),
    "attachments.list": input => ({ attachments: noteById(input.noteId)?.attachments ?? [] }),
    "attachments.addLink": input => {
      const attachment = { id: nextId("att"), noteId: input.noteId, kind: "link", url: input.url, title: input.title || input.url, sortOrder: 0, createdAt: new Date().toISOString() };
      withNote(input.noteId, note => { note.attachments.push(attachment); });
      return { attachment };
    },
    "attachments.delete": input => {
      for (const note of db.notes) note.attachments = note.attachments.filter((item: Row) => item.id !== input.id);
      emit([{ entity: "attachment", id: input.id, op: "delete" }]);
      return {};
    },
    "focus.getDefaults": () => ({ defaults: {
      workMin: settings.focusWorkMin, shortBreakMin: settings.focusShortBreakMin, longBreakMin: settings.focusLongBreakMin,
      cycles: settings.focusCycles, autoContinue: settings.focusAutoContinue, sounds: settings.focusSounds, notifications: settings.focusNotifications } }),
    "focus.setDefaults": input => ({ defaults: input.defaults }),
    "focus.recordSession": input => {
      const session = { id: nextId("fs"), ...input };
      focusSessions.push(session);
      return { session };
    },
    "focus.listSessions": () => ({ sessions: focusSessions }),
    "review.get": () => {
      const days = Array.from({ length: 28 }, (_, index) => {
        const date = new Date(Date.now() - (27 - index) * DAY);
        const completed = (index * 7) % 5;
        return { date: date.toISOString().slice(0, 10), completed, morning: Math.ceil(completed / 2), afternoon: Math.floor(completed / 2),
          evening: completed > 3 ? 1 : 0, night: 0, focusMinutes: completed * 25 };
      });
      return { from: days[0] && at(-27), to: at(0), tz: "UTC", streak: 6, completedTotal: days.reduce((sum, day) => sum + day.completed, 0),
        focusMinutes: days.reduce((sum, day) => sum + day.focusMinutes, 0), streakMood: "warm", completedMood: "steady", days: days.slice(-7), contribution: days };
    },
    "search.search": input => {
      const query = String(input.query ?? "").toLowerCase();
      if (!query) return { hits: [], notice: "" };
      const hits = db.notes.filter(note => `${note.title} ${note.content}`.toLowerCase().includes(query)).slice(0, input.limit || 20).map(note => ({
        noteId: note.id, title: note.title, score: 1, snippet: String(note.content || note.title).slice(0, 120),
        matchedIn: note.title.toLowerCase().includes(query) ? ["title"] : ["content"] }));
      return { hits, notice: "" };
    },
    "search.status": () => ({ ftsDocuments: db.notes.length }),
    "search.reindex": () => ({ notes: db.notes.length }),
    "reminders.status": () => ({ planned: 4, armed: 3, notifierLastSeenAt: new Date().toISOString(), permission: "authorized" }),
    "reminders.plan": () => ({ items: [] }),
    "reminders.armOneOff": input => ({ id: nextId("one"), fireAt: input.fireAt }),
    "reminders.snooze": input => ({ oneOffId: nextId("one"), fireAt: new Date(Date.now() + (input.minutes || 10) * 60_000).toISOString() }),
    "activity.list": () => ({ events: activity, nextCursor: "" }),
    "settings.get": () => ({ settings }),
    "settings.set": input => { Object.assign(settings, input.settings ?? {}, { appearanceTheme: "dark" }); return { settings }; },
    "agents.getInfo": () => ({ mcpPort: settings.agentsMcpPort, tokenPresent: true, token: "notes_preview_token", enabled: settings.agentsMcpEnabled,
      allowFileAttach: settings.agentsAllowFileAttach, claudeStdio: "claude mcp add pwnotes -- pwnotes mcp", claudeHttp: "claude mcp add --transport http pwnotes http://127.0.0.1:47321/mcp",
      cursorStdioJson: "{\n  \"mcpServers\": { \"pwnotes\": { \"command\": \"pwnotes\", \"args\": [\"mcp\"] } }\n}", cursorHttpJson: "{\n  \"mcpServers\": { \"pwnotes\": { \"url\": \"http://127.0.0.1:47321/mcp\" } }\n}" }),
    "agents.rotateToken": () => ({ token: "notes_preview_token_rotated" }),
    "agents.setEnabled": input => { settings.agentsMcpEnabled = input.enabled; return { enabled: input.enabled }; },
    "agents.setAllowFileAttach": input => { settings.agentsAllowFileAttach = input.allow; return { allow: input.allow }; },
  };
}

function createBrowserDevBridge(): NotesDesktopBridge {
  const listeners = new Set<(event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void>();
  const handlers = createHandlers(changes => queueMicrotask(() => listeners.forEach(listener => listener({ resync: false, changes }))));
  const bridge: Record<string, unknown> = {};
  for (const [namespace, methods] of Object.entries(RPC_METHODS)) {
    bridge[namespace] = Object.fromEntries(methods.map(method => [method, async (input: Row = {}) => {
      const handler = handlers[`${namespace}.${method}`];
      // JSON round-trip drops `undefined` keys, which protobuf-JSON decoding rejects.
      return JSON.parse(JSON.stringify(handler ? handler(input) : {}));
    }]));
  }
  bridge.onChange = (callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  };
  bridge.app = {
    name: "Polterware Notes",
    openDeepLink: async () => {},
    onDeepLink: () => () => {},
    getDeepLink: async () => null,
    pickFiles: async () => [],
    pathsForDroppedFiles: async () => [],
    writeTempFile: async () => "",
    saveZip: async () => null,
    saveBackup: async () => null,
    revealInFinder: async () => {},
    startMicrophone: async () => false,
    getInfo: async () => ({ name: "Polterware Notes", version: "0.0.0-browser", updates: "disabled" as const }),
    requestNotificationAuthorization: async () => false,
    openLog: async () => {},
    openDataFolder: async () => {},
    getReduceTransparency: async () => true,
    setReduceTransparency: async (enabled: boolean) => enabled,
    testMcpConnection: async () => ({ ok: false, error: "Unavailable in the browser preview" }),
  };
  return bridge as unknown as NotesDesktopBridge;
}

/** Installs the in-memory preview bridge, seeded with mock data, when Electron preload did not. Returns false if one already exists. */
export function installBrowserDevBridge(): boolean {
  if (window.pwnotes) return false;
  window.pwnotes = createBrowserDevBridge();
  return true;
}
