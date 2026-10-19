import { describe, expect, it } from "vitest";
import { fromJson } from "@bufbuild/protobuf";
import { SetScheduleRequestSchema } from "@polterware/notes-contracts";
import { createCalendarBridge } from "./bridge";
import { fakeCalendarBridge } from "./fake-bridge";
import { paddedVisibleRange, visibleRange } from "./grid";
import { createCalendarStore } from "./store";

function threeMonths() {
  const rows = [];
  for (let day = 1; day <= 90; day += 1) {
    const date = new Date(Date.UTC(2026, 8, 28 + day, 12, 0, 0));
    const iso = date.toISOString();
    rows.push({
      noteId: `note-${day}`,
      title: day % 7 === 0 ? `Recurring ${day}` : `One-shot ${day}`,
      occurrenceAt: iso,
      fireAt: iso,
      allDay: day % 5 === 0,
      spaceId: day % 2 === 0 ? "space-1" : "",
      tz: "UTC",
    });
  }
  return rows;
}

describe("calendar store against a fake preload bridge", () => {
  it("groups the visible month and pages across a neighbor window", async () => {
    const fake = fakeCalendarBridge({ occurrences: threeMonths() });
    const store = createCalendarStore(() => createCalendarBridge(fake.wire));
    const query = visibleRange("2026-10-15", "month", "mon", "UTC");
    await store.loadRange({ from: query.from, to: query.to });
    expect(fake.schedule.listOccurrences).toHaveBeenCalledWith({
      from: "2026-09-28T00:00:00.000Z",
      to: "2026-11-09T00:00:00.000Z",
      includeCompleted: true,
    });
    expect(store.range()).toEqual({ from: query.from, to: query.to });
    expect(store.occurrences().length).toBeGreaterThan(30);
    expect(store.forDate("2026-10-03").some(item => item.title.startsWith("One-shot") || item.title.startsWith("Recurring"))).toBe(true);
    const first = fake.schedule.listOccurrences.mock.calls.length;
    await store.ensureVisible("2026-10-15", "month", "UTC");
    expect(fake.schedule.listOccurrences.mock.calls.length).toBe(first + 1);
    const october = fake.schedule.listOccurrences.mock.calls.at(-1)?.[0] as { from: string; to: string };
    const octoberWindow = paddedVisibleRange("2026-10-15", "month", "mon", "UTC", 2);
    expect(october.from).toBe(octoberWindow.from);
    expect(october.to).toBe(octoberWindow.to);
    await store.ensureVisible("2026-10-15", "month", "UTC");
    expect(fake.schedule.listOccurrences.mock.calls.length).toBe(first + 1);
    await store.ensureVisible("2026-11-15", "month", "UTC");
    expect(fake.schedule.listOccurrences.mock.calls.length).toBe(first + 2);
    const november = fake.schedule.listOccurrences.mock.calls.at(-1)?.[0] as { from: string; to: string };
    const novemberWindow = paddedVisibleRange("2026-11-15", "month", "mon", "UTC", 2);
    expect(november.from).toBe(novemberWindow.from);
    expect(november.to).toBe(novemberWindow.to);
  });

  it("quick-creates a one-shot using only the frozen SetScheduleRequest fields", async () => {
    const fake = fakeCalendarBridge();
    const store = createCalendarStore(() => createCalendarBridge(fake.wire));
    const id = await store.createFromSlot({ date: "2026-10-03", time: "21:30", allDay: false, tz: "UTC" });
    expect(id).toBe("created-1");
    expect(fake.wire.notes.create).toHaveBeenCalledWith({ title: "Untitled note" });
    expect(fake.schedule.set).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        noteId: "created-1",
        fireAt: "2026-10-03T21:30:00.000Z",
        allDay: false,
        freq: "",
      }),
    });
    expect(() => fromJson(SetScheduleRequestSchema, fake.schedule.set.mock.calls[0]?.[0] as never)).not.toThrow();
  });

  it("asks before moving a recurring series and then shifts the series anchor", async () => {
    const fake = fakeCalendarBridge({
      notes: [{
        id: "note-1",
        title: "Standup",
        rev: "4",
        schedule: { noteId: "note-1", fireAt: "2026-03-01T12:00:00.000Z", tz: "America/Sao_Paulo", freq: "daily", every: 1, allDay: false },
      }],
      occurrences: [{ noteId: "note-1", title: "Standup", occurrenceAt: "2026-03-03T12:00:00.000Z", tz: "America/Sao_Paulo" }],
    });
    const store = createCalendarStore(() => createCalendarBridge(fake.wire));
    const occurrence = {
      noteId: "note-1",
      title: "Standup",
      occurrenceAt: "2026-03-03T12:00:00.000Z",
      fireAt: "2026-03-03T12:00:00.000Z",
      completed: false,
      overdue: false,
      allDay: false,
      spaceId: "",
      tz: "America/Sao_Paulo",
      color: "",
    };
    const first = await store.reschedule(occurrence, { date: "2026-03-03", time: "15:00", allDay: false, tz: "America/Sao_Paulo" }, false);
    expect(first.needsSeriesConfirm).toBe(true);
    expect(fake.schedule.set).not.toHaveBeenCalled();
    await store.reschedule(occurrence, { date: "2026-03-03", time: "15:00", allDay: false, tz: "America/Sao_Paulo" }, true);
    expect(fake.schedule.set).toHaveBeenCalledWith({
      schedule: expect.objectContaining({ fireAt: "2026-03-01T18:00:00.000Z", freq: "daily" }),
    });
  });

  it("reads week start from settings.get", async () => {
    const fake = fakeCalendarBridge({ weekStart: "sun" });
    const store = createCalendarStore(() => createCalendarBridge(fake.wire));
    await store.loadSettings();
    expect(store.weekStart()).toBe("sun");
    expect(fake.wire.settings.get).toHaveBeenCalled();
  });
  it("uses typed occurrence.tz to keep all-day civil dates in the schedule timezone", async () => {
    const fake = fakeCalendarBridge({ occurrences: [{ noteId: "note-zone", title: "All day", occurrenceAt: "2026-10-04T01:00:00.000Z", fireAt: "2026-10-04T01:00:00.000Z", allDay: true, tz: "America/Sao_Paulo" }] });
    const store = createCalendarStore(() => createCalendarBridge(fake.wire));
    await store.loadRange({ from: "2026-10-03T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z" });
    expect(store.occurrences()[0]?.tz).toBe("America/Sao_Paulo");
    expect(store.forDate("2026-10-03")[0]?.noteId).toBe("note-zone");
    expect(store.forDate("2026-10-04")).toEqual([]);
  });

});
