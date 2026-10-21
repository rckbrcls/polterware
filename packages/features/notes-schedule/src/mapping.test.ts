import { describe, expect, it } from "vitest";
import {
  defaultForm,
  formFromSchedule,
  reminderWording,
  toScheduleInput,
  validateFocusRecipe,
  validateScheduleForm,
  wallClockToUtc,
  weekdayMask,
  weekdaysFromMask,
  type RepeatFreq,
  type ScheduleForm,
} from "./mapping";

function form(partial: Partial<ScheduleForm> & Pick<ScheduleForm, "date" | "tz">): ScheduleForm {
  return {
    ...defaultForm(new Date("2026-10-04T12:00:00Z"), partial.tz),
    time: "09:00",
    allDay: false,
    freq: "",
    every: 1,
    weekdays: weekdaysFromMask(0),
    endType: "never",
    untilDate: "",
    untilTime: "09:00",
    occurrenceCount: 1,
    ...partial,
  };
}

function instant(value: string): number {
  return Date.parse(value);
}

describe("form → ScheduleInput mapping", () => {
  it.each([
    {
      id: 1,
      name: "daily every 1",
      form: form({ date: "2026-03-01", time: "09:00", tz: "America/Sao_Paulo", freq: "daily" }),
      expect: { fireAt: "2026-03-01T12:00:00.000Z", freq: "daily", every: 1, weekdayMask: 0, endType: "never", allDay: false },
    },
    {
      id: 2,
      name: "monthly count 4 from Jan 31",
      form: form({ date: "2026-01-31", time: "09:00", tz: "America/Sao_Paulo", freq: "monthly", endType: "count", occurrenceCount: 4 }),
      expect: { fireAt: "2026-01-31T12:00:00.000Z", freq: "monthly", every: 1, endType: "count", occurrenceCount: 4 },
    },
    {
      id: 3,
      name: "yearly from Feb 29",
      form: form({ date: "2028-02-29", time: "09:00", tz: "UTC", freq: "yearly" }),
      expect: { fireAt: "2028-02-29T09:00:00.000Z", freq: "yearly", tz: "UTC" },
    },
    {
      id: 4,
      name: "weekly Mon+Wed every 1",
      form: form({ date: "2026-10-05", time: "08:00", tz: "UTC", freq: "weekly", weekdays: weekdaysFromMask(10) }),
      expect: { fireAt: "2026-10-05T08:00:00.000Z", freq: "weekly", weekdayMask: 10, every: 1 },
    },
    {
      id: 5,
      name: "weekly Mon+Wed every 2",
      form: form({ date: "2026-10-05", time: "08:00", tz: "UTC", freq: "weekly", every: 2, weekdays: weekdaysFromMask(10) }),
      expect: { fireAt: "2026-10-05T08:00:00.000Z", freq: "weekly", weekdayMask: 10, every: 2 },
    },
    {
      id: 6,
      name: "weekly Mon+Wed anchored Wednesday",
      form: form({ date: "2026-10-07", time: "08:00", tz: "UTC", freq: "weekly", weekdays: weekdaysFromMask(10) }),
      expect: { fireAt: "2026-10-07T08:00:00.000Z", weekdayMask: 10 },
    },
    {
      id: 7,
      name: "weekly Mon+Wed count 3",
      form: form({ date: "2026-10-05", time: "08:00", tz: "UTC", freq: "weekly", weekdays: weekdaysFromMask(10), endType: "count", occurrenceCount: 3 }),
      expect: { fireAt: "2026-10-05T08:00:00.000Z", endType: "count", occurrenceCount: 3, weekdayMask: 10 },
    },
    {
      id: 8,
      name: "daily spring-forward anchor in America/New_York",
      form: form({ date: "2026-03-07", time: "02:30", tz: "America/New_York", freq: "daily" }),
      expect: { fireAt: "2026-03-07T07:30:00.000Z", tz: "America/New_York", freq: "daily" },
    },
    {
      id: 9,
      name: "daily fall-back earlier instant in America/New_York",
      form: form({ date: "2026-10-31", time: "01:30", tz: "America/New_York", freq: "daily" }),
      expect: { fireAt: "2026-10-31T05:30:00.000Z", tz: "America/New_York" },
    },
    {
      id: 10,
      name: "hourly every 6",
      form: form({ date: "2026-10-03", time: "22:00", tz: "America/Sao_Paulo", freq: "hourly", every: 6 }),
      expect: { fireAt: "2026-10-04T01:00:00.000Z", freq: "hourly", every: 6 },
    },
    {
      id: 11,
      name: "daily until inclusive",
      form: form({ date: "2026-10-01", time: "09:00", tz: "UTC", freq: "daily", endType: "until", untilDate: "2026-10-03", untilTime: "09:00" }),
      expect: { fireAt: "2026-10-01T09:00:00.000Z", endType: "until", untilAt: "2026-10-03T09:00:00.000Z" },
    },
    {
      id: 12,
      name: "monthly every 2 from Aug 31",
      form: form({ date: "2026-08-31", time: "09:00", tz: "UTC", freq: "monthly", every: 2 }),
      expect: { fireAt: "2026-08-31T09:00:00.000Z", freq: "monthly", every: 2 },
    },
    {
      id: 13,
      name: "one-shot",
      form: form({ date: "2026-10-03", time: "21:30", tz: "UTC", freq: "" }),
      expect: { fireAt: "2026-10-03T21:30:00.000Z", freq: "", endType: "never" },
    },
    {
      id: 14,
      name: "all-day daily",
      form: form({ date: "2026-10-03", tz: "America/Sao_Paulo", freq: "daily", allDay: true }),
      expect: { fireAt: "2026-10-03T03:00:00.000Z", allDay: true, freq: "daily" },
    },
  ])("vector $id $name", ({ form: value, expect: expected }) => {
    const input = toScheduleInput(value, "note-1");
    expect(instant(input.fireAt)).toBe(instant(expected.fireAt));
    expect(input.noteId).toBe("note-1");
    expect(input.active).toBe(true);
    expect(input.tz).toBe(expected.tz ?? value.tz);
    expect(input.freq).toBe(expected.freq ?? value.freq);
    expect(input.every).toBe(expected.every ?? value.every);
    expect(input.weekdayMask).toBe(expected.weekdayMask ?? (value.freq === "weekly" ? weekdayMask(value.weekdays) : 0));
    expect(input.endType).toBe(expected.endType ?? value.endType);
    expect(input.allDay).toBe(expected.allDay ?? value.allDay);
    if (expected.untilAt) expect(instant(input.untilAt!)).toBe(instant(expected.untilAt));
    else expect(input.untilAt).toBeUndefined();
    if (expected.occurrenceCount) expect(input.occurrenceCount).toBe(expected.occurrenceCount);
    else expect(input.occurrenceCount).toBeUndefined();
  });

  it("round-trips a saved weekly schedule back into the form", () => {
    const input = toScheduleInput(form({ date: "2026-10-05", time: "08:00", tz: "UTC", freq: "weekly", weekdays: weekdaysFromMask(10) }), "note-1");
    const restored = formFromSchedule(input);
    expect(restored.date).toBe("2026-10-05");
    expect(restored.time).toBe("08:00");
    expect(restored.freq).toBe("weekly");
    expect(weekdayMask(restored.weekdays)).toBe(10);
  });
});

describe("DST wall-clock conversion for America/New_York", () => {
  it("keeps 02:30 EST on the day before the spring-forward", () => {
    expect(wallClockToUtc("2026-03-07", "02:30", "America/New_York")).toBe("2026-03-07T07:30:00.000Z");
  });
  it("shifts a skipped 02:30 on the spring-forward to 03:30 EDT", () => {
    expect(wallClockToUtc("2026-03-08", "02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });
  it("keeps 02:30 EDT after the spring-forward", () => {
    expect(wallClockToUtc("2026-03-09", "02:30", "America/New_York")).toBe("2026-03-09T06:30:00.000Z");
  });
  it("picks the earlier 01:30 on the fall-back day", () => {
    expect(wallClockToUtc("2026-11-01", "01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("invalid combinations", () => {
  it("blocks hourly all-day schedules", () => {
    expect(validateScheduleForm(form({ date: "2026-10-03", tz: "UTC", freq: "hourly", allDay: true }))).toBe("Sub-day recurrence cannot represent dates.");
  });
  it("blocks weekday chips on a daily rule", () => {
    expect(validateScheduleForm(form({ date: "2026-10-03", tz: "UTC", freq: "daily", weekdays: weekdaysFromMask(10) }))).toBe("Weekdays apply only to a weekly rule.");
  });
  it("blocks until without a date", () => {
    expect(validateScheduleForm(form({ date: "2026-10-03", tz: "UTC", freq: "daily", endType: "until" }))).toBe("Until requires a valid instant and no count.");
  });
  it("blocks a zero occurrence count", () => {
    expect(validateScheduleForm(form({ date: "2026-10-03", tz: "UTC", freq: "daily", endType: "count", occurrenceCount: 0 }))).toBe("Count must be positive and cannot carry until.");
  });
  it("blocks a missing date", () => {
    expect(validateScheduleForm(form({ date: "", tz: "UTC" }))).toBe("A start date is required.");
  });
  it("blocks a focus recipe outside the core ranges", () => {
    expect(validateFocusRecipe({ enabled: true, workMin: 0, shortBreakMin: 5, longBreakMin: 15, cycles: 4, autoContinue: true })).toBe("Work must be between 1 and 60.");
    expect(validateFocusRecipe({ enabled: true, workMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 13, autoContinue: true })).toBe("Cycles must be between 1 and 12.");
  });
  it.each(["hourly", "daily", "weekly", "monthly", "yearly", ""] as RepeatFreq[])("accepts freq %s when the rest of the form is valid", freq => {
    const value = form({
      date: "2026-10-05",
      time: "08:00",
      tz: "UTC",
      freq,
      weekdays: freq === "weekly" ? weekdaysFromMask(10) : weekdaysFromMask(0),
    });
    expect(validateScheduleForm(value)).toBe("");
    expect(toScheduleInput(value, "note-1").freq).toBe(freq);
  });
});

describe("reminder wording from reminders.status", () => {
  const live = { permission: "authorized", armed: 2, planned: 4, notifierLastSeenAt: "2026-10-04T12:00:00.000Z", now: Date.parse("2026-10-04T12:00:10.000Z") };
  it("reports permission denied before arming counts", () => {
    expect(reminderWording({ ...live, permission: "denied" })).toBe("permission denied");
  });
  it("reports notifier off when the last heartbeat is stale", () => {
    expect(reminderWording({ ...live, notifierLastSeenAt: "2026-10-04T11:00:00.000Z" })).toBe("notifier off");
  });
  it("reports notifier off when permission is not granted", () => {
    expect(reminderWording({ ...live, permission: "not-determined" })).toBe("notifier off");
  });
  it("reports completed from the note or occurrence", () => {
    expect(reminderWording({ ...live, noteStatus: "completed" })).toBe("completed");
    expect(reminderWording({ ...live, nextOccurrenceCompleted: true })).toBe("completed");
  });
  it("reports armed when the notifier has armed items", () => {
    expect(reminderWording(live)).toBe("armed");
  });
  it("reports planned when nothing is armed yet", () => {
    expect(reminderWording({ ...live, armed: 0, planned: 3 })).toBe("planned");
  });
});
