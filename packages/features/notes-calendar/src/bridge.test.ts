import { describe, expect, it, vi } from "vitest";
import { ListOccurrencesRequestSchema, ListOccurrencesResponseSchema, SettingsSchema, SetScheduleRequestSchema } from "@polterware/notes-contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";
import { createCalendarBridge, revisionString, type CalendarWireBridge } from "./bridge";

describe("protobuf JSON calendar bridge", () => {
  it("keeps RFC 3339 timestamps and rejects fields outside the frozen contract", async () => {
    const set = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({
        schedule: { noteId: "note-1", fireAt: "2026-10-03T21:30:00.000Z" },
      });
      expect(input).not.toHaveProperty("expectedRev");
      return { schedule: { noteId: "note-1", fireAt: "2026-10-03T21:30:00.000Z", tz: "UTC" } };
    });
    const list = vi.fn(async (input?: unknown) => {
      expect(input).toMatchObject({ from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" });
      return { occurrences: [{ noteId: "note-1", title: "Read", occurrenceAt: "2026-10-03T21:30:00.000Z" }] };
    });
    const bridge = createCalendarBridge({
      notes: {},
      spaces: {},
      schedule: { set, listOccurrences: list },
      settings: {},
      onChange: () => () => {},
    } as unknown as CalendarWireBridge);
    await bridge.schedule.set({ schedule: { noteId: "note-1", fireAt: "2026-10-03T21:30:00.000Z", tz: "UTC" } });
    const listed = await bridge.schedule.listOccurrences({ from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" });
    expect(listed).toMatchObject({ occurrences: [{ occurrenceAt: "2026-10-03T21:30:00.000Z" }] });
    await expect(bridge.schedule.set({ schedule: { noteId: "note-1" }, expectedRev: "2" } as never)).rejects.toThrow("expectedRev");
    expect(set).toHaveBeenCalledOnce();
  });

  it("round-trips ListOccurrences and Set through protobuf JSON", () => {
    const list = toJson(ListOccurrencesRequestSchema, fromJson(ListOccurrencesRequestSchema, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
      includeCompleted: true,
    }));
    expect(typeof (list as { from: string }).from).toBe("string");
    const set = toJson(SetScheduleRequestSchema, fromJson(SetScheduleRequestSchema, {
      schedule: { noteId: "note-1", fireAt: "2026-10-03T21:30:00.000Z", tz: "UTC" },
    }));
    expect(typeof (set as { schedule: { fireAt: string } }).schedule.fireAt).toBe("string");
  });

  it("normalizes missing revisions to 0 without using numbers", () => {
    expect(revisionString(undefined)).toBe("0");
    expect(revisionString(9007199254740993n)).toBe("9007199254740993");
  });
  it("round-trips calendarWeekStart and occurrence.tz as declared contract fields", () => {
    expect(toJson(SettingsSchema, fromJson(SettingsSchema, { calendarWeekStart: "sun" }))).toMatchObject({ calendarWeekStart: "sun" });
    const json = toJson(ListOccurrencesResponseSchema, fromJson(ListOccurrencesResponseSchema, { occurrences: [{ noteId: "note-1", occurrenceAt: "2026-10-04T01:00:00.000Z", tz: "America/Sao_Paulo" }] }));
    expect(json).toMatchObject({ occurrences: [{ tz: "America/Sao_Paulo" }] });
  });

});
