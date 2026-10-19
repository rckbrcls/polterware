import { systemTimeZone, wallClockToUtc } from "./grid";

/** Protobuf JSON body of notes.v1.Schedule used by Set. One-shot only. */
export type ScheduleInput = {
  noteId: string;
  active: boolean;
  fireAt: string;
  tz: string;
  allDay: boolean;
  freq: string;
  every: number;
  weekdayMask: number;
  endType: string;
};

export type SlotDraft = {
  date: string;
  time: string;
  allDay: boolean;
  tz?: string;
};

export type ScheduleJSON = Partial<ScheduleInput> & {
  fireAt?: string;
  tz?: string;
  allDay?: boolean;
  freq?: string;
  every?: number;
  weekdayMask?: number;
  endType?: string;
  untilAt?: string;
  occurrenceCount?: number;
};

const TIME = /^(\d{2}):(\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function revisionString(rev: string | number | bigint | undefined): string {
  if (typeof rev === "string" && rev !== "") return rev;
  if (typeof rev === "bigint") return rev.toString();
  if (typeof rev === "number" && Number.isFinite(rev)) return Math.trunc(rev).toString();
  return "0";
}

export function validateSlot(draft: SlotDraft): string {
  if (!DATE.test(draft.date)) return "A start date is required.";
  if (!draft.allDay && !TIME.test(draft.time)) return "A start time is required.";
  return "";
}

/** Maps a calendar slot to a one-shot Schedule body. Recurrence stays on W2-SCHEDULE. */
export function toOneShotSchedule(draft: SlotDraft, noteId: string): ScheduleInput {
  const issue = validateSlot(draft);
  if (issue) throw new Error(issue);
  const tz = draft.tz || systemTimeZone();
  return {
    noteId,
    active: true,
    fireAt: wallClockToUtc(draft.date, draft.allDay ? "00:00" : draft.time, tz),
    tz,
    allDay: draft.allDay,
    freq: "",
    every: 1,
    weekdayMask: 0,
    endType: "never",
  };
}

/** Moves the series (or one-shot) anchor by the delta between an occurrence and the drop instant. */
export function moveSeriesAnchor(schedule: ScheduleJSON, occurrenceAt: string, dropAt: string): ScheduleInput {
  const fireAt = Date.parse(schedule.fireAt ?? "");
  const from = Date.parse(occurrenceAt);
  const to = Date.parse(dropAt);
  if (!Number.isFinite(fireAt) || !Number.isFinite(from) || !Number.isFinite(to)) throw new Error("A valid schedule instant is required.");
  const next: ScheduleInput = {
    noteId: schedule.noteId ?? "",
    active: schedule.active ?? true,
    fireAt: new Date(fireAt + (to - from)).toISOString(),
    tz: schedule.tz || systemTimeZone(),
    allDay: schedule.allDay ?? false,
    freq: schedule.freq ?? "",
    every: Math.max(1, schedule.every ?? 1),
    weekdayMask: schedule.weekdayMask ?? 0,
    endType: schedule.endType || "never",
  };
  return next;
}

export function isRecurring(schedule: ScheduleJSON | undefined): boolean {
  return Boolean(schedule?.freq);
}

export function slotInstant(draft: SlotDraft): string {
  return wallClockToUtc(draft.date, draft.allDay ? "00:00" : draft.time, draft.tz || systemTimeZone());
}
