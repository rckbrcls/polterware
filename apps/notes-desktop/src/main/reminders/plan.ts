import { createHash } from "node:crypto";
import { BUDGET, type NativeReminder, type PendingReminder, type Reminder, type RepeatComponents } from "./types";

export const isOwnedIdentifier = (id: string): boolean => /^(rem:|one:).+/.test(id);
export const isNoteID = (id: string): boolean => /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id);
const ranges = { month: [1, 12], day: [1, 31], weekday: [1, 7], hour: [0, 23], minute: [0, 59], second: [0, 59] } as const;
function instant(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) throw new Error("Invalid notification instant");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid notification instant");
  return date.toISOString();
}
function components(rule: RepeatComponents | null | undefined): RepeatComponents | null {
  if (rule == null) return null;
  if (typeof rule !== "object" || Array.isArray(rule) || typeof rule.tz !== "string") throw new Error("Invalid repeat descriptor");
  new Intl.DateTimeFormat("en", { timeZone: rule.tz });
  for (const key of Object.keys(rule)) if (key !== "tz" && !(key in ranges)) throw new Error("Invalid repeat component");
  const result: RepeatComponents = { tz: rule.tz };
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const value = rule[key];
    if (value === undefined) continue;
    const [min, max] = ranges[key];
    if (!Number.isInteger(value) || value < min || value > max) throw new Error("Invalid repeat component");
    result[key] = value;
  }
  // Planner DateComponents: minutely={second}, hourly={minute}, daily={hour,minute},
  // weekly={weekday,hour,minute}. Month/day are not emitted. Default second=0 so the OS
  // trigger does not wildcard seconds on hour/minute rules.
  if (result.month !== undefined || result.day !== undefined ||
      (result.weekday !== undefined && result.hour === undefined) ||
      (result.hour !== undefined && result.minute === undefined)) throw new Error("Unsupported repeat descriptor");
  if (result.second === undefined && (result.hour !== undefined || result.minute !== undefined)) result.second = 0;
  if (result.second === undefined) throw new Error("Unsupported repeat descriptor");
  return result;
}
function occurrenceWallKey(occurrenceAt: string, fireAt: string, repeat: RepeatComponents | null) {
  if (!repeat) return null;
  const format = new Intl.DateTimeFormat("en", { timeZone: repeat.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const parts = (date: string) => Object.fromEntries(format.formatToParts(new Date(date)).map(({ type, value }) => [type, value]));
  const occurrence = parts(occurrenceAt), fire = parts(fireAt);
  const day = (value: Record<string, string>) => Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day));
  return { dayOffset: (day(occurrence) - day(fire)) / 86_400_000, hour: occurrence.hour, minute: occurrence.minute, second: occurrence.second, millisecond: Date.parse(occurrenceAt) % 1000 };
}
export function normalizePlan(items: readonly Reminder[], now = Date.now()): NativeReminder[] {
  if (!Array.isArray(items) || items.length > BUDGET) throw new Error("Notification budget exceeded");
  const ids = new Set<string>();
  return items.map((item) => {
    if (typeof item.id !== "string" || !isOwnedIdentifier(item.id) || ids.has(item.id)) throw new Error("Invalid notification identifier");
    ids.add(item.id);
    if (typeof item.noteId !== "string" || (item.noteId !== "" && !isNoteID(item.noteId)) ||
        (item.category !== "focus-phase" && !isNoteID(item.noteId))) throw new Error("Invalid notification note");
    if (typeof item.title !== "string" || typeof item.body !== "string" ||
        !["reminder", "reminder-focus", "focus-phase"].includes(item.category)) throw new Error("Invalid notification content");
    const repeat = components(item.repeat);
    const fireAt = instant(item.fireAt), occurrenceAt = instant(item.occurrenceAt);
    if (!repeat && Date.parse(fireAt) <= now) throw new Error("Expired notification");
    const sound = item.sound ?? "default";
    if (sound !== "default" && sound !== "none" && !/^[A-Za-z0-9_-]+\.(caf|aiff|wav)$/.test(sound)) throw new Error("Invalid notification sound");
    const value = { id: item.id, noteId: item.noteId, occurrenceAt, fireAt,
      title: Array.from(item.title).slice(0, 500).join(""), body: Array.from(item.body).slice(0, 140).join(""), category: item.category, repeat, sound };
    // A repeating trigger is stable as Plan's next concrete occurrence advances.
    // Its occurrence key is resolved at delivery by the native calendar trigger.
    const content = { ...value, fireAt: repeat ? null : fireAt, occurrenceAt: repeat ? null : occurrenceAt, occurrenceWallKey: occurrenceWallKey(occurrenceAt, fireAt, repeat) };
    return { ...value, hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
  });
}
export function diffPlan(desired: readonly NativeReminder[], pending: readonly PendingReminder[]) {
  const hashes = new Map(pending.map((item) => [item.id, item.hash]));
  const ids = new Set(desired.map((item) => item.id));
  const changed = desired.filter((item) => hashes.get(item.id) !== item.hash);
  return { changed, removed: pending.filter((item) => isOwnedIdentifier(item.id) && !ids.has(item.id)).map((item) => item.id), unchanged: desired.length - changed.length };
}
