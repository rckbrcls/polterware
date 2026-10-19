export type CalendarView = "schedule" | "day" | "week" | "month" | "year";
import type { SettingsJSON } from "./bridge";
export type WeekStart = "mon" | "sun";

export type CivilDate = { year: number; month: number; day: number };
export type Wall = CivilDate & { hour: number; minute: number; second: number };

export type DayHour = {
  hour: number;
  fold: number;
  label: string;
  startUtc: string;
};

export type VisibleRange = {
  from: string;
  to: string;
  dates: string[];
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_CELLS = 42;
const WEEKDAYS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const SCHEDULE_DAYS = 42;
export const SCHEDULE_STEP = 14;

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatYmd(parts: CivilDate): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function parseYmd(value: string): CivilDate {
  const match = DATE.exec(value);
  if (!match) throw new Error("A valid date is required.");
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// Constructing an Intl.DateTimeFormat is expensive and zoneParts runs per occurrence per render.
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

export function zoneParts(date: Date, timeZone: string): Wall {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? "0");
  let hour = read("hour");
  if (hour === 24) hour = 0;
  return { year: read("year"), month: read("month"), day: read("day"), hour, minute: read("minute"), second: read("second") };
}

function offsetMs(instant: number, timeZone: string): number {
  const wall = zoneParts(new Date(instant), timeZone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - instant;
}

function wallMatches(instant: number, parts: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): boolean {
  const wall = zoneParts(new Date(instant), timeZone);
  return wall.year === parts.year && wall.month === parts.month && wall.day === parts.day && wall.hour === parts.hour && wall.minute === parts.minute;
}

/** Wall-clock in `timeZone` → UTC instant. Gaps shift forward; folds pick the earlier instant. */
export function wallClockToUtc(date: string, time: string, timeZone: string): string {
  const day = parseYmd(date);
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) throw new Error("A valid time is required.");
  const utcGuess = Date.UTC(day.year, day.month - 1, day.day, hour, minute, 0, 0);
  let instant = utcGuess - offsetMs(utcGuess, timeZone);
  instant = utcGuess - offsetMs(instant, timeZone);
  if (wallMatches(instant, { ...day, hour, minute }, timeZone)) {
    let first = instant;
    for (let probe = instant - 4 * 3_600_000; probe < instant; probe += 60_000) {
      if (wallMatches(probe, { ...day, hour, minute }, timeZone)) {
        first = probe;
        break;
      }
    }
    return new Date(first).toISOString();
  }
  const previousDay = utcGuess - 24 * 3_600_000;
  return new Date(utcGuess - offsetMs(previousDay, timeZone)).toISOString();
}

export function civilFromInstant(iso: string, timeZone: string): Wall {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) throw new Error("A valid instant is required.");
  return zoneParts(new Date(instant), timeZone);
}

export function addDays(date: string, amount: number): string {
  const { year, month, day } = parseYmd(date);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return formatYmd({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() });
}

export function weekdayIndex(date: string): number {
  const { year, month, day } = parseYmd(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function startOfWeek(date: string, weekStart: WeekStart): string {
  const weekday = weekdayIndex(date);
  const first = weekStart === "sun" ? 0 : 1;
  const offset = (weekday - first + 7) % 7;
  return addDays(date, -offset);
}

export function weekDates(anchor: string, weekStart: WeekStart): string[] {
  const start = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthStart(date: string): string {
  const { year, month } = parseYmd(date);
  return formatYmd({ year, month, day: 1 });
}

export function monthDates(anchor: string, weekStart: WeekStart): string[] {
  const start = startOfWeek(monthStart(anchor), weekStart);
  return Array.from({ length: MONTH_CELLS }, (_, index) => addDays(start, index));
}

export function addMonths(date: string, amount: number): string {
  const { year, month, day } = parseYmd(date);
  const cursor = new Date(Date.UTC(year, month - 1 + amount, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  return formatYmd({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: Math.min(day, last) });
}

export function addYears(date: string, amount: number): string {
  const { year, month, day } = parseYmd(date);
  const last = new Date(Date.UTC(year + amount, month, 0)).getUTCDate();
  return formatYmd({ year: year + amount, month, day: Math.min(day, last) });
}

export function yearStart(date: string): string {
  return formatYmd({ year: parseYmd(date).year, month: 1, day: 1 });
}

export function yearMonthAnchors(anchor: string): string[] {
  const year = parseYmd(anchor).year;
  return Array.from({ length: 12 }, (_, index) => formatYmd({ year, month: index + 1, day: 1 }));
}

export function yearDates(anchor: string): string[] {
  const start = yearStart(anchor);
  const end = addYears(start, 1);
  const dates: string[] = [];
  for (let cursor = start; cursor !== end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function scheduleDates(anchor: string): string[] {
  return Array.from({ length: SCHEDULE_DAYS }, (_, index) => addDays(anchor, index));
}

export function periodDates(anchor: string, view: CalendarView, weekStart: WeekStart): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return weekDates(anchor, weekStart);
  if (view === "month") return monthDates(anchor, weekStart);
  if (view === "year") return yearDates(anchor);
  return scheduleDates(anchor);
}

export function shiftedAnchor(anchor: string, view: CalendarView, direction: number): string {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  if (view === "schedule") return addDays(anchor, direction * SCHEDULE_STEP);
  if (view === "year") return addYears(anchor, direction);
  return addMonths(anchor, direction);
}

export function weekdayLabels(weekStart: WeekStart): readonly string[] {
  return weekStart === "sun" ? WEEKDAYS_SUN : WEEKDAYS_MON;
}

function spanTitle(first: CivilDate, last: CivilDate, withDays: boolean): { leading: string; trailing: string } {
  if (first.month === last.month && first.year === last.year) {
    const leading = withDays ? `${MONTH_NAMES[first.month - 1]} ${first.day} – ${last.day}` : MONTH_NAMES[first.month - 1]!;
    return { leading, trailing: String(first.year) };
  }
  if (first.year === last.year) {
    const leading = withDays
      ? `${MONTH_NAMES[first.month - 1]} ${first.day} – ${MONTH_NAMES[last.month - 1]} ${last.day}`
      : `${MONTH_NAMES[first.month - 1]} – ${MONTH_NAMES[last.month - 1]}`;
    return { leading, trailing: String(first.year) };
  }
  const leading = withDays
    ? `${MONTH_NAMES[first.month - 1]} ${first.day} ${first.year} – ${MONTH_NAMES[last.month - 1]} ${last.day} ${last.year}`
    : `${MONTH_NAMES[first.month - 1]} ${first.year} – ${MONTH_NAMES[last.month - 1]} ${last.year}`;
  return { leading, trailing: "" };
}

export function rangeTitle(anchor: string, view: CalendarView, weekStart: WeekStart): { leading: string; trailing: string } {
  if (view === "year") return { leading: String(parseYmd(anchor).year), trailing: "" };
  if (view === "week") {
    const dates = weekDates(anchor, weekStart);
    return spanTitle(parseYmd(dates[0]!), parseYmd(dates[6]!), false);
  }
  if (view === "schedule") {
    const dates = scheduleDates(anchor);
    return spanTitle(parseYmd(dates[0]!), parseYmd(dates[dates.length - 1]!), true);
  }
  const { year, month, day } = parseYmd(anchor);
  if (view === "day") return { leading: `${MONTH_NAMES[month - 1]} ${day}`, trailing: String(year) };
  return { leading: MONTH_NAMES[month - 1]!, trailing: String(year) };
}

export function monthName(date: string): string {
  return MONTH_NAMES[parseYmd(date).month - 1]!;
}

export function weekdayName(date: string, weekStart: WeekStart): string {
  const labels = weekdayLabels(weekStart);
  const first = weekStart === "sun" ? 0 : 1;
  return labels[(weekdayIndex(date) - first + 7) % 7]!;
}

export function agendaHeading(date: string): string {
  const { day, month } = parseYmd(date);
  return `${day} ${MONTH_SHORT[month - 1]}, ${WEEKDAY_SHORT[weekdayIndex(date)]}`;
}

export function clockLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12} ${suffix}`;
}

export function timeLabel(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${pad(minute)} ${suffix}`;
}

export function formatGmtOffset(name: string): string {
  const normalized = name.replace("−", "-").replace("–", "-");
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/i.exec(normalized);
  if (!match) return normalized === "GMT" ? "GMT" : normalized;
  const sign = match[1]!;
  const hour = Number(match[2]);
  const minute = match[3];
  if (!minute || minute === "00") return `GMT${sign}${hour}`;
  return `GMT${sign}${hour}:${minute}`;
}

export function gmtLabel(timeZone: string, instant = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset", hour: "numeric" }).formatToParts(instant);
    return formatGmtOffset(parts.find(part => part.type === "timeZoneName")?.value ?? "GMT");
  } catch {
    return "GMT";
  }
}

export function standardHours(): DayHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, fold: 0, label: hourLabel(hour), startUtc: "" }));
}

export type TimedPlacement = { index: number; column: number; columns: number };

/** Pack overlapping [start, end) spans into side-by-side columns. */
export function placeTimed(spans: readonly { start: number; end: number }[]): TimedPlacement[] {
  const order = spans.map((span, index) => ({ ...span, index })).sort((left, right) => left.start - right.start || left.index - right.index);
  const active: { end: number; column: number; cluster: number }[] = [];
  const drafts: { index: number; column: number; cluster: number }[] = [];
  const clusterColumns: number[] = [];
  let cluster = -1;
  for (const span of order) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index]!.end <= span.start) active.splice(index, 1);
    }
    if (active.length === 0) {
      cluster += 1;
      clusterColumns[cluster] = 0;
    }
    const used = new Set(active.map(item => item.column));
    let column = 0;
    while (used.has(column)) column += 1;
    active.push({ end: span.end, column, cluster });
    clusterColumns[cluster] = Math.max(clusterColumns[cluster] ?? 0, column + 1);
    drafts.push({ index: span.index, column, cluster });
  }
  return drafts
    .sort((left, right) => left.index - right.index)
    .map(item => ({ index: item.index, column: item.column, columns: clusterColumns[item.cluster] ?? 1 }));
}

/** Half-open UTC range that covers the previous, current, and next period. */
export function paddedVisibleRange(anchor: string, view: CalendarView, weekStart: WeekStart, timeZone: string, reach = 1): { from: string; to: string } {
  const previous = visibleRange(shiftedAnchor(anchor, view, -reach), view, weekStart, timeZone);
  const next = visibleRange(shiftedAnchor(anchor, view, reach), view, weekStart, timeZone);
  return { from: previous.from, to: next.to };
}

/** Half-open UTC range that covers every visible civil date in `timeZone`. */
export function visibleRange(anchor: string, view: CalendarView, weekStart: WeekStart, timeZone: string): VisibleRange {
  const dates = periodDates(anchor, view, weekStart);
  const from = wallClockToUtc(dates[0]!, "00:00", timeZone);
  const to = wallClockToUtc(addDays(dates[dates.length - 1]!, 1), "00:00", timeZone);
  return { from, to, dates };
}

/** Hours that exist on a civil date. Spring-forward days have 23; fall-back days have 25. */
export function dayHours(date: string, timeZone: string): DayHour[] {
  const start = Date.parse(wallClockToUtc(date, "00:00", timeZone));
  const end = Date.parse(wallClockToUtc(addDays(date, 1), "00:00", timeZone));
  const hours: DayHour[] = [];
  const seen = new Map<number, number>();
  for (let instant = start; instant < end; instant += 3_600_000) {
    const wall = zoneParts(new Date(instant), timeZone);
    const fold = seen.get(wall.hour) ?? 0;
    seen.set(wall.hour, fold + 1);
    hours.push({ hour: wall.hour, fold, label: `${pad(wall.hour)}:00`, startUtc: new Date(instant).toISOString() });
  }
  return hours;
}

export function sameMonth(date: string, anchor: string): boolean {
  const left = parseYmd(date);
  const right = parseYmd(anchor);
  return left.year === right.year && left.month === right.month;
}

export function weekStartFromSettings(settings: SettingsJSON | undefined): WeekStart {
  return settings?.calendarWeekStart === "sun" ? "sun" : "mon";
}

export function occurrenceDate(iso: string, timeZone: string): string {
  const wall = civilFromInstant(iso, timeZone);
  return formatYmd(wall);
}

export function hourLabel(hour: number): string {
  return `${pad(hour)}:00`;
}
