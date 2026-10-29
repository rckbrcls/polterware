import type { DataTableGroup } from "@polterware/frontend-design-system";

/** The local calendar day of a timestamp, as `YYYY-MM-DD`; empty for an unreadable one. */
export function activityDayId(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", the weekday within the last week, then the date (with the year once it differs). */
export function activityDayLabel(dayId: string, now = new Date()): string {
  const [year, month, day] = dayId.split("-").map(Number);
  if (!year || !month || !day) return "Earlier";
  const date = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(year === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** One group per day the rows touch, newest day first. */
export function activityDayGroups(createdAt: readonly string[], now = new Date()): DataTableGroup[] {
  const ids = [...new Set(createdAt.map(activityDayId))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : b.localeCompare(a)));
  return ids.map((id) => ({ id, label: id ? activityDayLabel(id, now) : "Earlier" }));
}
