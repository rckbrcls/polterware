import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  agendaHeading,
  clockLabel,
  dayHours,
  formatGmtOffset,
  monthDates,
  occurrenceDate,
  placeTimed,
  rangeTitle,
  shiftedAnchor,
  startOfWeek,
  timeLabel,
  visibleRange,
  wallClockToUtc,
  weekDates,
  weekStartFromSettings,
  weekdayLabels,
} from "./grid";

describe("week and month layout", () => {
  it.each([
    { date: "2026-10-04", weekStart: "sun" as const, start: "2026-10-04" },
    { date: "2026-10-04", weekStart: "mon" as const, start: "2026-09-28" },
    { date: "2026-10-05", weekStart: "mon" as const, start: "2026-10-05" },
    { date: "2026-10-05", weekStart: "sun" as const, start: "2026-10-04" },
  ])("starts the week containing $date on $weekStart at $start", ({ date, weekStart, start }) => {
    expect(startOfWeek(date, weekStart)).toBe(start);
    expect(weekDates(date, weekStart)[0]).toBe(start);
    expect(weekDates(date, weekStart)).toHaveLength(7);
  });

  it("builds a 42-cell month grid from the week-start rule", () => {
    const sunday = monthDates("2026-10-15", "sun");
    expect(sunday).toHaveLength(42);
    expect(sunday[0]).toBe("2026-09-27");
    expect(sunday[41]).toBe("2026-11-07");
    const monday = monthDates("2026-10-15", "mon");
    expect(monday[0]).toBe("2026-09-28");
    expect(monday[41]).toBe("2026-11-08");
  });

  it("shifts anchors by day, week, month, schedule, and year without leaving the civil calendar", () => {
    expect(shiftedAnchor("2026-10-04", "day", 1)).toBe("2026-10-05");
    expect(shiftedAnchor("2026-10-04", "week", -1)).toBe("2026-09-27");
    expect(shiftedAnchor("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftedAnchor("2026-10-05", "schedule", 1)).toBe("2026-10-19");
    expect(shiftedAnchor("2026-10-05", "year", 1)).toBe("2027-10-05");
    expect(shiftedAnchor("2028-02-29", "year", 1)).toBe("2029-02-28");
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
  });

  it("titles a week that spans two months", () => {
    const title = rangeTitle("2026-10-01", "week", "mon");
    expect(title.leading).toBe("September – October");
    expect(title.trailing).toBe("2026");
  });

  it("orders weekday labels from the week-start setting", () => {
    expect(weekdayLabels("sun")[0]).toBe("Sun");
    expect(weekdayLabels("mon")[0]).toBe("Mon");
    expect(weekStartFromSettings({ calendarWeekStart: "sun" })).toBe("sun");
    expect(weekStartFromSettings({})).toBe("mon");
  });
});

describe("visible range stays on the painted cells", () => {
  it("requests only the day being shown", () => {
    const range = visibleRange("2026-10-04", "day", "mon", "UTC");
    expect(range.from).toBe("2026-10-04T00:00:00.000Z");
    expect(range.to).toBe("2026-10-05T00:00:00.000Z");
    expect(range.dates).toEqual(["2026-10-04"]);
  });

  it("requests only the Monday week for October 4 2026", () => {
    const range = visibleRange("2026-10-04", "week", "mon", "UTC");
    expect(range.from).toBe("2026-09-28T00:00:00.000Z");
    expect(range.to).toBe("2026-10-05T00:00:00.000Z");
    expect(range.dates).toHaveLength(7);
  });

  it("requests only the 42-cell month grid", () => {
    const range = visibleRange("2026-10-15", "month", "mon", "UTC");
    expect(range.from).toBe("2026-09-28T00:00:00.000Z");
    expect(range.to).toBe("2026-11-09T00:00:00.000Z");
    expect(range.dates).toHaveLength(42);
  });

  it("requests the civil year and a six-week schedule window", () => {
    const year = visibleRange("2026-10-05", "year", "mon", "UTC");
    expect(year.from).toBe("2026-01-01T00:00:00.000Z");
    expect(year.to).toBe("2027-01-01T00:00:00.000Z");
    expect(year.dates).toHaveLength(365);
    expect(rangeTitle("2026-10-05", "year", "mon")).toEqual({ leading: "2026", trailing: "" });
    const schedule = visibleRange("2026-10-05", "schedule", "mon", "UTC");
    expect(schedule.dates).toHaveLength(42);
    expect(schedule.from).toBe("2026-10-05T00:00:00.000Z");
    expect(schedule.to).toBe("2026-11-16T00:00:00.000Z");
    expect(rangeTitle("2026-10-05", "schedule", "mon")).toEqual({ leading: "October 5 – November 15", trailing: "2026" });
  });
});

describe("clock labels and timed placement", () => {
  it("formats 12-hour labels, agenda headings, and GMT offsets", () => {
    expect(clockLabel(0)).toBe("12 AM");
    expect(clockLabel(13)).toBe("1 PM");
    expect(timeLabel(8, 5)).toBe("8:05 AM");
    expect(agendaHeading("2026-10-05")).toBe("5 Oct, Mon");
    expect(formatGmtOffset("GMT-03:00")).toBe("GMT-3");
    expect(formatGmtOffset("GMT+5:30")).toBe("GMT+5:30");
    expect(formatGmtOffset("GMT−3")).toBe("GMT-3");
  });

  it("packs overlapping events side by side and reuses a column after a gap", () => {
    expect(placeTimed([{ start: 0, end: 10 }, { start: 0, end: 10 }])).toEqual([
      { index: 0, column: 0, columns: 2 },
      { index: 1, column: 1, columns: 2 },
    ]);
    expect(placeTimed([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toEqual([
      { index: 0, column: 0, columns: 1 },
      { index: 1, column: 0, columns: 1 },
    ]);
  });
});

describe("America/New_York DST weeks", () => {
  const tz = "America/New_York";

  it("keeps 02:30 EST the day before spring-forward", () => {
    expect(wallClockToUtc("2026-03-07", "02:30", tz)).toBe("2026-03-07T07:30:00.000Z");
  });

  it("shifts a skipped 02:30 on the spring-forward to 03:30 EDT", () => {
    expect(wallClockToUtc("2026-03-08", "02:30", tz)).toBe("2026-03-08T07:30:00.000Z");
  });

  it("picks the earlier 01:30 on the fall-back day", () => {
    expect(wallClockToUtc("2026-11-01", "01:30", tz)).toBe("2026-11-01T05:30:00.000Z");
  });

  it.each([
    { date: "2026-03-07", hours: 24, missing: [] as number[], extra: [] as number[] },
    { date: "2026-03-08", hours: 23, missing: [2], extra: [] as number[] },
    { date: "2026-03-09", hours: 24, missing: [] as number[], extra: [] as number[] },
    { date: "2026-10-31", hours: 24, missing: [] as number[], extra: [] as number[] },
    { date: "2026-11-01", hours: 25, missing: [] as number[], extra: [1] },
    { date: "2026-11-02", hours: 24, missing: [] as number[], extra: [] as number[] },
  ])("$date in America/New_York has $hours hours", ({ date, hours, missing, extra }) => {
    const slots = dayHours(date, tz);
    expect(slots).toHaveLength(hours);
    for (const hour of missing) expect(slots.some(slot => slot.hour === hour)).toBe(false);
    for (const hour of extra) expect(slots.filter(slot => slot.hour === hour)).toHaveLength(2);
    expect(Date.parse(slots[slots.length - 1]!.startUtc) - Date.parse(slots[0]!.startUtc)).toBe((hours - 1) * 3_600_000);
  });

  it("lays out the spring-forward week as six 24-hour days and one 23-hour Sunday", () => {
    const week = weekDates("2026-03-08", "sun");
    expect(week[0]).toBe("2026-03-08");
    const lengths = week.map(date => dayHours(date, tz).length);
    expect(lengths).toEqual([23, 24, 24, 24, 24, 24, 24]);
  });

  it("lays out the fall-back week as six 24-hour days and one 25-hour Sunday", () => {
    const week = weekDates("2026-11-01", "sun");
    expect(week[0]).toBe("2026-11-01");
    const lengths = week.map(date => dayHours(date, tz).length);
    expect(lengths).toEqual([25, 24, 24, 24, 24, 24, 24]);
  });

  it("assigns an all-day occurrence to the civil date in its own timezone", () => {
    expect(occurrenceDate("2026-10-03T03:00:00.000Z", "America/Sao_Paulo")).toBe("2026-10-03");
    expect(occurrenceDate("2026-10-03T03:00:00.000Z", "UTC")).toBe("2026-10-03");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});
