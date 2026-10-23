import { describe, expect, it } from "vitest";
import { wallClockToUtc } from "./grid";
import { isRecurring, moveSeriesAnchor, toOneShotSchedule, validateSlot } from "./mapping";

describe("one-shot slot → Schedule mapping", () => {
  it.each([
    {
      name: "timed UTC slot",
      draft: { date: "2026-10-03", time: "21:30", allDay: false, tz: "UTC" },
      fireAt: "2026-10-03T21:30:00.000Z",
    },
    {
      name: "Sao Paulo morning",
      draft: { date: "2026-03-01", time: "09:00", allDay: false, tz: "America/Sao_Paulo" },
      fireAt: "2026-03-01T12:00:00.000Z",
    },
    {
      name: "all-day Sao Paulo date",
      draft: { date: "2026-10-03", time: "09:00", allDay: true, tz: "America/Sao_Paulo" },
      fireAt: "2026-10-03T03:00:00.000Z",
    },
    {
      name: "spring-forward gap in America/New_York",
      draft: { date: "2026-03-08", time: "02:30", allDay: false, tz: "America/New_York" },
      fireAt: wallClockToUtc("2026-03-08", "02:30", "America/New_York"),
    },
  ])("$name", ({ draft, fireAt }) => {
    const input = toOneShotSchedule(draft, "note-1");
    expect(input).toMatchObject({
      noteId: "note-1",
      active: true,
      fireAt,
      tz: draft.tz,
      allDay: draft.allDay,
      freq: "",
      every: 1,
      weekdayMask: 0,
      endType: "never",
    });
  });

  it("rejects an incomplete slot", () => {
    expect(validateSlot({ date: "", time: "09:00", allDay: false })).toBe("A start date is required.");
    expect(validateSlot({ date: "2026-10-03", time: "", allDay: false })).toBe("A start time is required.");
  });
});

describe("series-anchor move", () => {
  it("shifts a one-shot fireAt by the drop delta", () => {
    const next = moveSeriesAnchor(
      { noteId: "note-1", fireAt: "2026-10-03T21:30:00.000Z", tz: "UTC", freq: "" },
      "2026-10-03T21:30:00.000Z",
      "2026-10-04T10:00:00.000Z",
    );
    expect(next.fireAt).toBe("2026-10-04T10:00:00.000Z");
    expect(next.freq).toBe("");
  });

  it("moves the whole recurring series from the current occurrence", () => {
    const next = moveSeriesAnchor(
      { noteId: "note-1", fireAt: "2026-03-01T12:00:00.000Z", tz: "America/Sao_Paulo", freq: "daily", every: 1 },
      "2026-03-03T12:00:00.000Z",
      "2026-03-03T15:00:00.000Z",
    );
    expect(next.fireAt).toBe("2026-03-01T15:00:00.000Z");
    expect(next.freq).toBe("daily");
    expect(isRecurring({ freq: "daily" })).toBe(true);
    expect(isRecurring({ freq: "" })).toBe(false);
  });
});
