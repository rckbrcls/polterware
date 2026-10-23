import { batch, createSignal } from "solid-js";
import { browserBridge, type CalendarBridge, type OccurrenceJSON } from "./bridge";
import { occurrenceDate, paddedVisibleRange, systemTimeZone, visibleRange, weekStartFromSettings, type CalendarView, type WeekStart } from "./grid";
import { errorText, isRecurring, moveSeriesAnchor, slotInstant, toOneShotSchedule, type ScheduleJSON, type SlotDraft } from "./mapping";

export type SaveState = "live" | "queued" | "failed" | "unavailable";

export type CalendarOccurrence = {
  noteId: string;
  title: string;
  occurrenceAt: string;
  fireAt: string;
  completed: boolean;
  overdue: boolean;
  allDay: boolean;
  spaceId: string;
  tz: string;
  color: string;
};

export type RangeQuery = { from: string; to: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function occurrenceFromJson(row: OccurrenceJSON, spaces: Record<string, string>, fallbackTz: string): CalendarOccurrence | undefined {
  const noteId = String(row.noteId ?? "");
  const occurrenceAt = String(row.occurrenceAt ?? "");
  if (!noteId || !occurrenceAt) return undefined;
  const spaceId = String(row.spaceId ?? "");
  return {
    noteId,
    title: String(row.title ?? "Untitled note"),
    occurrenceAt,
    fireAt: row.fireAt ?? occurrenceAt,
    completed: Boolean(row.completed),
    overdue: Boolean(row.overdue),
    allDay: Boolean(row.allDay),
    spaceId,
    tz: String(row.tz || fallbackTz),
    color: spaces[spaceId] ?? "",
  };
}

export function createCalendarStore(getBridge: () => CalendarBridge = browserBridge) {
  const [occurrences, setOccurrences] = createSignal<CalendarOccurrence[]>([]);
  const [range, setRange] = createSignal<RangeQuery>({ from: "", to: "" });
  const [weekStart, setWeekStart] = createSignal<WeekStart>("mon");
  const [displayTz, setDisplayTz] = createSignal(systemTimeZone());
  const [saveState, setSaveState] = createSignal<SaveState>("unavailable");
  const [loadError, setLoadError] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  let lastQuery: RangeQuery | undefined;
  let unsubscribe: (() => void) | undefined;
  let users = 0;

  async function loadSettings() {
    try {
      const { settings } = await getBridge().settings.get({});
      setWeekStart(weekStartFromSettings(settings));
    } catch {
      setWeekStart("mon");
    }
  }

  async function loadRange(query: RangeQuery) {
    lastQuery = query;
    setPending(true);
    setLoadError("");
    try {
      const bridge = getBridge();
      const [list, spacesResponse] = await Promise.all([
        bridge.schedule.listOccurrences({ from: query.from, to: query.to, includeCompleted: true }),
        bridge.spaces.list({}).catch(() => ({ spaces: [] })),
      ]);
      const colors: Record<string, string> = {};
      for (const space of (asRecord(spacesResponse).spaces as Record<string, unknown>[] | undefined) ?? []) {
        const id = String(space.id ?? "");
        if (id) colors[id] = String(space.color ?? "");
      }
      const rows = (list.occurrences ?? [])
        .map(row => occurrenceFromJson(row, colors, displayTz()))
        .filter((row): row is CalendarOccurrence => Boolean(row));
      batch(() => {
        setOccurrences(rows);
        setRange(query);
        setSaveState("live");
        setActionError("");
      });
    } catch (error) {
      setLoadError(errorText(error));
      setSaveState("unavailable");
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    if (lastQuery) await loadRange(lastQuery);
  }

  function connect() {
    users += 1;
    if (users === 1) {
      void loadSettings();
      try {
        unsubscribe = getBridge().onChange(event => {
          if (event.resync || event.changes.some(change => ["schedule", "note", "notes", "spaces", "settings"].includes(change.entity))) {
            void refresh();
            if (event.changes.some(change => change.entity === "settings")) void loadSettings();
          }
        });
      } catch {
        setSaveState("unavailable");
        setLoadError("Polterware Notes bridge unavailable. Open this page in Polterware Notes Desktop.");
      }
    }
    return () => {
      users -= 1;
      if (users <= 0) {
        users = 0;
        unsubscribe?.();
        unsubscribe = undefined;
      }
    };
  }

  async function ensureVisible(anchor: string, view: CalendarView, timeZone = displayTz()) {
    const visible = visibleRange(anchor, view, weekStart(), timeZone);
    // Load two periods each side so the panes a drag reveals are already in memory; a pan then never waits on the core.
    const padded = paddedVisibleRange(anchor, view, weekStart(), timeZone, 2);
    const loaded = range();
    const covered = Boolean(loaded.from) && Date.parse(loaded.from) <= Date.parse(padded.from) && Date.parse(loaded.to) >= Date.parse(padded.to);
    if (covered) return visible;
    await loadRange(padded);
    return visible;
  }

  async function createFromSlot(draft: SlotDraft, onCreated?: (id: string) => void) {
    setBusy("create");
    setSaveState("queued");
    try {
      const bridge = getBridge();
      const created = asRecord(await bridge.notes.create({ title: "Untitled note" }));
      const note = asRecord(created.note);
      const id = String(note.id ?? "");
      if (!id) throw new Error("The core did not create a note.");
      // The note already exists; keep it reachable if the schedule write fails.
      onCreated?.(id);
      const schedule = toOneShotSchedule({ ...draft, tz: draft.tz || displayTz() }, id);
      await bridge.schedule.set({ schedule });
      setSaveState("live");
      setActionError("");
      await refresh();
      return id;
    } catch (error) {
      setSaveState("failed");
      setActionError(errorText(error));
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function reschedule(occurrence: CalendarOccurrence, draft: SlotDraft, confirmSeries: boolean) {
    setBusy("reschedule");
    setSaveState("queued");
    try {
      const bridge = getBridge();
      const response = asRecord(await bridge.notes.get({ id: occurrence.noteId, include: { schedule: true } }));
      const note = asRecord(response.note);
      const schedule = asRecord(note.schedule) as ScheduleJSON;
      if (!schedule.fireAt) throw new Error("This note has no schedule to move.");
      if (isRecurring(schedule) && !confirmSeries) {
        setSaveState("live");
        return { needsSeriesConfirm: true as const };
      }
      const dropAt = slotInstant({ ...draft, tz: occurrence.tz || schedule.tz || displayTz() });
      const next = moveSeriesAnchor({ ...schedule, noteId: occurrence.noteId }, occurrence.occurrenceAt, dropAt);
      if (draft.allDay) next.allDay = true;
      await bridge.schedule.set({ schedule: next });
      setSaveState("live");
      setActionError("");
      await refresh();
      return { needsSeriesConfirm: false as const };
    } catch (error) {
      setSaveState("failed");
      setActionError(errorText(error));
      throw error;
    } finally {
      setBusy("");
    }
  }

  // Bucket once per occurrences change; every pane and day then reads its own bucket in O(1).
  let indexed: CalendarOccurrence[] | undefined;
  let buckets = new Map<string, { timed: CalendarOccurrence[]; allDay: CalendarOccurrence[] }>();
  const bucket = (date: string) => {
    const rows = occurrences();
    if (rows !== indexed) {
      indexed = rows;
      buckets = new Map();
      for (const item of rows) {
        const key = occurrenceDate(item.occurrenceAt, item.tz);
        let entry = buckets.get(key);
        if (!entry) buckets.set(key, entry = { timed: [], allDay: [] });
        (item.allDay ? entry.allDay : entry.timed).push(item);
      }
    }
    return buckets.get(date);
  };
  const forDate = (date: string) => { const entry = bucket(date); return entry ? [...entry.allDay, ...entry.timed] : []; };
  const timedOn = (date: string) => bucket(date)?.timed ?? [];
  const allDayOn = (date: string) => bucket(date)?.allDay ?? [];

  return {
    occurrences, range, weekStart, displayTz, saveState, loadError, actionError, pending, busy,
    connect, loadRange, ensureVisible, refresh, loadSettings, createFromSlot, reschedule, forDate, timedOn, allDayOn,
    setDisplayTz,
  };
}

export type CalendarStore = ReturnType<typeof createCalendarStore>;
export const calendarStore = createCalendarStore();
