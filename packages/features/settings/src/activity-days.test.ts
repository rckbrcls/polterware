import { describe, expect, it } from "vitest";
import { activityDayGroups, activityDayId, activityDayLabel } from "./activity-days";

describe("activity days", () => {
  const now = new Date(2026, 9, 29, 15, 0); // Thursday, 29 October 2026

  it("names a day the way Linear's feed does", () => {
    expect(activityDayLabel("2026-10-29", now)).toBe("Today");
    expect(activityDayLabel("2026-10-28", now)).toBe("Yesterday");
    expect(activityDayLabel("2026-10-26", now)).toBe("Monday");
    expect(activityDayLabel("2026-09-20", now)).toBe("September 20");
    expect(activityDayLabel("2025-12-31", now)).toBe("December 31, 2025");
  });

  it("groups rows by local day, newest first, with unreadable times last", () => {
    const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
    expect(activityDayId(local(29, 0))).toBe("2026-10-29");
    expect(activityDayGroups([local(28, 9), local(29, 23), "", local(28, 1)], now)).toEqual([
      { id: "2026-10-29", label: "Today" },
      { id: "2026-10-28", label: "Yesterday" },
      { id: "", label: "Earlier" },
    ]);
  });
});
