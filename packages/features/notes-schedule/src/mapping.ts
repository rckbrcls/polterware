export type RepeatFreq = "" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
export type EndKind = "never" | "until" | "count";
export type ReminderWording = "armed" | "planned" | "notifier off" | "permission denied" | "completed";

export const WEEKDAYS = [
  { bit: 0, label: "Sun", id: "sun" },
  { bit: 1, label: "Mon", id: "mon" },
  { bit: 2, label: "Tue", id: "tue" },
  { bit: 3, label: "Wed", id: "wed" },
  { bit: 4, label: "Thu", id: "thu" },
  { bit: 5, label: "Fri", id: "fri" },
  { bit: 6, label: "Sat", id: "sat" },
] as const;

export const REPEAT_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: "", label: "Does not repeat" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const END_OPTIONS: { value: EndKind; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "until", label: "Until" },
  { value: "count", label: "After N" },
];

export type ScheduleForm = {
  date: string;
  time: string;
  allDay: boolean;
  tz: string;
  freq: RepeatFreq;
  every: number;
  weekdays: boolean[];
  endType: EndKind;
  untilDate: string;
  untilTime: string;
  occurrenceCount: number;
};

export type FocusRecipeForm = {
  enabled: boolean;
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  cycles: number;
  autoContinue: boolean;
};

/** Protobuf JSON body of notes.v1.Schedule used by Set and Preview. */
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
  untilAt?: string;
  occurrenceCount?: number;
};

export type ScheduleJSON = Partial<ScheduleInput> & {
  focusEnabled?: boolean;
  focusWorkMin?: number;
  focusShortBreakMin?: number;
  focusLongBreakMin?: number;
  focusCycles?: number;
  focusAutoContinue?: boolean;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function weekdayMask(weekdays: readonly boolean[]): number {
  return weekdays.reduce((mask, on, bit) => (on ? mask | (1 << bit) : mask), 0);
}

export function weekdaysFromMask(mask: number): boolean[] {
  return WEEKDAYS.map(day => (mask & (1 << day.bit)) !== 0);
}

export function emptyWeekdays(): boolean[] {
  return WEEKDAYS.map(() => false);
}

export function defaultForm(now = new Date(), tz = systemTimeZone()): ScheduleForm {
  const wall = zoneParts(now, tz);
  return {
    date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
    time: "09:00",
    allDay: false,
    tz,
    freq: "",
    every: 1,
    weekdays: emptyWeekdays(),
    endType: "never",
    untilDate: "",
    untilTime: "09:00",
    occurrenceCount: 1,
  };
}

export function defaultFocusRecipe(): FocusRecipeForm {
  return { enabled: false, workMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 4, autoContinue: true };
}

export function timezoneOptions(current?: string): { value: string; label: string }[] {
  const system = systemTimeZone();
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const required = ["UTC", "America/Sao_Paulo", "America/New_York", "Europe/London", "Europe/Lisbon", "Asia/Tokyo", system];
  if (current) required.push(current);
  const names = [...new Set([...required, ...supported])].sort((a, b) => a.localeCompare(b));
  return names.map(value => ({ value, label: value === system ? `${value} (system)` : value }));
}

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zoneParts(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? "0");
  let hour = read("hour");
  if (hour === 24) hour = 0;
  return { year: read("year"), month: read("month"), day: read("day"), hour, minute: read("minute"), second: read("second") };
}

function offsetMs(instant: number, timeZone: string): number {
  const wall = zoneParts(new Date(instant), timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - instant;
}

function rfc3339(ms: number): string {
  return new Date(ms).toISOString();
}

function parseDateTime(date: string, time: string): { year: number; month: number; day: number; hour: number; minute: number } | undefined {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (!day || !clock) return undefined;
  const year = Number(day[1]), month = Number(day[2]), dateDay = Number(day[3]);
  const hour = Number(clock[1]), minute = Number(clock[2]);
  if (month < 1 || month > 12 || dateDay < 1 || dateDay > 31 || hour > 23 || minute > 59) return undefined;
  return { year, month, day: dateDay, hour, minute };
}

/** Wall-clock in `timeZone` → UTC instant. Gaps shift forward; folds pick the earlier instant. */
export function wallClockToUtc(date: string, time: string, timeZone: string): string {
  const parts = parseDateTime(date, time);
  if (!parts) throw new Error("A valid date and time are required.");
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  let instant = utcGuess - offsetMs(utcGuess, timeZone);
  instant = utcGuess - offsetMs(instant, timeZone);
  if (wallMatches(instant, parts, timeZone)) {
    let first = instant;
    for (let probe = instant - 4 * 3_600_000; probe < instant; probe += 60_000) {
      if (wallMatches(probe, parts, timeZone)) {
        first = probe;
        break;
      }
    }
    return rfc3339(first);
  }
  const previousDay = utcGuess - 24 * 3_600_000;
  return rfc3339(utcGuess - offsetMs(previousDay, timeZone));
}

function wallMatches(instant: number, parts: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): boolean {
  const wall = zoneParts(new Date(instant), timeZone);
  return wall.year === parts.year && wall.month === parts.month && wall.day === parts.day && wall.hour === parts.hour && wall.minute === parts.minute;
}

export function formFromSchedule(schedule: ScheduleJSON | undefined, fallbackTz = systemTimeZone()): ScheduleForm {
  const form = defaultForm(new Date(), schedule?.tz || fallbackTz);
  if (!schedule?.fireAt) return form;
  const instant = Date.parse(schedule.fireAt);
  if (Number.isNaN(instant)) return form;
  const tz = schedule.tz || fallbackTz;
  const wall = zoneParts(new Date(instant), tz);
  const until = schedule.untilAt ? zoneParts(new Date(schedule.untilAt), tz) : undefined;
  return {
    date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
    allDay: schedule.allDay ?? false,
    tz,
    freq: (REPEAT_OPTIONS.some(option => option.value === schedule.freq) ? schedule.freq : "") as RepeatFreq,
    every: Math.max(1, schedule.every ?? 1),
    weekdays: weekdaysFromMask(schedule.weekdayMask ?? 0),
    endType: schedule.endType === "until" || schedule.endType === "count" ? schedule.endType : "never",
    untilDate: until ? `${until.year}-${pad(until.month)}-${pad(until.day)}` : "",
    untilTime: until ? `${pad(until.hour)}:${pad(until.minute)}` : `${pad(wall.hour)}:${pad(wall.minute)}`,
    occurrenceCount: Math.max(1, schedule.occurrenceCount ?? 1),
  };
}

export function focusFromSchedule(schedule: ScheduleJSON | undefined): FocusRecipeForm {
  const fallback = defaultFocusRecipe();
  if (!schedule) return fallback;
  return {
    enabled: schedule.focusEnabled ?? false,
    workMin: schedule.focusWorkMin ?? fallback.workMin,
    shortBreakMin: schedule.focusShortBreakMin ?? fallback.shortBreakMin,
    longBreakMin: schedule.focusLongBreakMin ?? fallback.longBreakMin,
    cycles: schedule.focusCycles ?? fallback.cycles,
    autoContinue: schedule.focusAutoContinue ?? fallback.autoContinue,
  };
}

export function validateScheduleForm(form: ScheduleForm): string {
  if (!DATE.test(form.date)) return "A start date is required.";
  if (!form.allDay && !TIME.test(form.time)) return "A start time is required.";
  if (!form.tz) return "An IANA time zone is required.";
  if (form.every < 1) return "Every must be at least 1.";
  if (form.allDay && (form.freq === "hourly")) return "Sub-day recurrence cannot represent dates.";
  if (form.freq !== "weekly" && weekdayMask(form.weekdays) !== 0) return "Weekdays apply only to a weekly rule.";
  if (form.endType === "until" && !DATE.test(form.untilDate)) return "Until requires a valid instant and no count.";
  if (form.endType === "until" && !form.allDay && !TIME.test(form.untilTime)) return "Until requires a valid instant and no count.";
  if (form.endType === "count" && form.occurrenceCount < 1) return "Count must be positive and cannot carry until.";
  return "";
}

export function toScheduleInput(form: ScheduleForm, noteId: string): ScheduleInput {
  const error = validateScheduleForm(form);
  if (error) throw new Error(error);
  const time = form.allDay ? "00:00" : form.time;
  const input: ScheduleInput = {
    noteId,
    active: true,
    fireAt: wallClockToUtc(form.date, time, form.tz),
    tz: form.tz,
    allDay: form.allDay,
    freq: form.freq,
    every: form.every,
    weekdayMask: form.freq === "weekly" ? weekdayMask(form.weekdays) : 0,
    endType: form.endType,
  };
  if (form.endType === "until") input.untilAt = wallClockToUtc(form.untilDate, form.allDay ? "00:00" : form.untilTime || time, form.tz);
  if (form.endType === "count") input.occurrenceCount = form.occurrenceCount;
  return input;
}

export function validateFocusRecipe(form: FocusRecipeForm): string {
  if (!form.enabled) return "";
  for (const [field, value] of [["Work", form.workMin], ["Short break", form.shortBreakMin], ["Long break", form.longBreakMin]] as const) {
    if (value < 1 || value > 60) return `${field} must be between 1 and 60.`;
  }
  if (form.cycles < 1 || form.cycles > 12) return "Cycles must be between 1 and 12.";
  return "";
}

export function focusRecipeInput(form: FocusRecipeForm, noteId: string) {
  return {
    noteId,
    enabled: form.enabled,
    workMin: form.workMin,
    shortBreakMin: form.shortBreakMin,
    longBreakMin: form.longBreakMin,
    cycles: form.cycles,
    autoContinue: form.autoContinue,
  };
}

export function reminderWording(input: {
  permission?: string;
  armed?: number;
  planned?: number;
  notifierLastSeenAt?: string;
  noteStatus?: string;
  nextOccurrenceCompleted?: boolean;
  now?: number;
}): ReminderWording {
  if (input.noteStatus === "completed" || input.nextOccurrenceCompleted) return "completed";
  if (input.permission === "denied") return "permission denied";
  const authorized = ["authorized", "provisional", "ephemeral"].includes(input.permission ?? "");
  const seen = input.notifierLastSeenAt ? Date.parse(input.notifierLastSeenAt) : Number.NaN;
  const now = input.now ?? Date.now();
  if (!authorized || !Number.isFinite(seen) || now - seen > 90_000) return "notifier off";
  if ((input.armed ?? 0) > 0) return "armed";
  return "planned";
}

export function reminderTone(wording: ReminderWording): "ok" | "warn" | "danger" | "muted" | "syncing" {
  if (wording === "armed") return "ok";
  if (wording === "planned") return "syncing";
  if (wording === "completed") return "muted";
  if (wording === "permission denied") return "danger";
  return "warn";
}

export function formatOccurrence(iso: string, timeZone: string, allDay: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }),
  }).format(date);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
