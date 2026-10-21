import { describe, expect, it } from "vitest";
import { diffPlan, normalizePlan } from "./plan";
import { isBackgroundReminderLaunch } from "./launch";
import type { Reminder } from "./types";
const noteId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const now = Date.parse("2026-10-04T10:00:00Z");
const item = (overrides: Partial<Reminder> = {}): Reminder => ({ id: `rem:${noteId}:1791111600000`, noteId, occurrenceAt: "2026-10-04T11:00:00.000Z", fireAt: "2026-10-04T11:00:00.000Z", title: "Synthetic reminder", body: "Synthetic body", category: "reminder", ...overrides });
describe("notification plan", () => {
  it("diffs by content and repeat descriptor while preserving foreign IDs", () => {
    const desired = normalizePlan([item()], now);
    const pending = [{ id: desired[0].id, hash: desired[0].hash, repeats: false }, { id: "one:old", hash: "old", repeats: false }, { id: "foreign:stay", hash: "", repeats: false }];
    expect(diffPlan(desired, pending)).toEqual({ changed: [], removed: ["one:old"], unchanged: 1 });
    for (const overrides of [{ title: "Changed" }, { body: "Changed" }, { category: "reminder-focus" as const }, { fireAt: "2026-10-04T12:00:00.000Z" }, { sound: "none" }, { repeat: { tz: "UTC", hour: 11, minute: 0, second: 0 } }]) {
      expect(diffPlan(normalizePlan([item(overrides)], now), pending).changed).toHaveLength(1);
    }
  });
  it("hashes repeating triggers stably when the next occurrence advances", () => {
    const repeat = { tz: "UTC", hour: 11, minute: 0, second: 0 };
    const before = normalizePlan([item({ repeat })], now)[0];
    const after = normalizePlan([item({ repeat, occurrenceAt: "2026-10-05T11:00:00.000Z", fireAt: "2026-10-05T11:00:00.000Z" })], now)[0];
    expect(before.hash).toBe(after.hash);
    expect(normalizePlan([item({ repeat: { ...repeat, tz: "America/Sao_Paulo" } })], now)[0].hash).not.toBe(before.hash);
  });
  it("hashes all-day occurrence semantics and stays stable across DST", () => {
    const repeat = { tz: "America/New_York", hour: 9, minute: 0, second: 0 };
    const a = normalizePlan([item({ repeat, fireAt: "2026-03-07T14:00:00.000Z", occurrenceAt: "2026-03-07T05:00:00.000Z" })], 0)[0];
    const b = normalizePlan([item({ repeat, fireAt: "2026-03-08T13:00:00.000Z", occurrenceAt: "2026-03-08T05:00:00.000Z" })], 0)[0];
    const timed = normalizePlan([item({ repeat, fireAt: "2026-03-07T14:00:00.000Z", occurrenceAt: "2026-03-07T14:00:00.000Z" })], 0)[0];
    expect(a.hash).toBe(b.hash); expect(a.hash).not.toBe(timed.hash);
  });
  it("caps Unicode body at 140 characters and ignores edits beyond that preview", () => {
    const body = "🌟".repeat(140);
    const a = normalizePlan([item({ body: body + "hidden note" })], now)[0];
    const b = normalizePlan([item({ body: body + "changed hidden note" })], now)[0];
    expect(Array.from(a.body)).toHaveLength(140); expect(a.hash).toBe(b.hash);
  });
  it("accepts 60 unique items, refuses a 200-item unbudgeted plan", () => {
    const items = Array.from({ length: 200 }, (_, i) => item({ id: `one:${i}` }));
    expect(normalizePlan(items.slice(0, 60), now)).toHaveLength(60);
    expect(() => normalizePlan(items, now)).toThrow("budget");
  });
  it.each([
    { id: "foreign:bad" }, { noteId: "not-a-note" }, { body: undefined },
    { fireAt: "not-a-time" }, { fireAt: "2026-10-04T09:00:00.000Z" }, { sound: "../../secret.caf" },
    { repeat: { tz: "UTC", hour: 24, minute: 0, second: 0 } },
    { repeat: { tz: "UTC", second: 70 } }, { repeat: { tz: "invalid/zone", second: 0 } },
    { repeat: { tz: "UTC" } }, { repeat: { tz: "UTC", month: 3, second: 0 } },
  ])("rejects unsafe plans before OS mutation: %j", (overrides) => {
    expect(() => normalizePlan([item(overrides as Partial<Reminder>)], now)).toThrow();
  });
  it("rejects duplicate IDs", () => { expect(() => normalizePlan([item(), item()], now)).toThrow(); });
  it("allows standalone focus and minutely/hourly/weekly native triggers", () => {
    for (const repeat of [{ tz: "UTC", second: 0 }, { tz: "UTC", minute: 15, second: 0 }, { tz: "UTC", weekday: 2, hour: 9, minute: 0, second: 0 }]) {
      expect(normalizePlan([item({ repeat })], now)[0].repeat).toEqual(repeat);
    }
    expect(normalizePlan([item({ id: "one:focus", noteId: "", category: "focus-phase" })], now)).toHaveLength(1);
  });
  it("accepts planner-shaped repeats and stable rem:repeat / rem:wdN identifiers", () => {
    const daily = normalizePlan([item({ id: `rem:${noteId}:repeat`, repeat: { tz: "UTC", hour: 11, minute: 0 } })], now)[0];
    expect(daily.repeat).toEqual({ tz: "UTC", hour: 11, minute: 0, second: 0 });
    expect(daily.hash).toBe(normalizePlan([item({ id: `rem:${noteId}:repeat`, repeat: { tz: "UTC", hour: 11, minute: 0, second: 0 } })], now)[0].hash);
    const weekly = normalizePlan([item({ id: `rem:${noteId}:wd2`, repeat: { tz: "America/Sao_Paulo", weekday: 2, hour: 9, minute: 0 } })], now)[0];
    expect(weekly.repeat).toEqual({ tz: "America/Sao_Paulo", weekday: 2, hour: 9, minute: 0, second: 0 });
    expect(normalizePlan([item({ repeat: { tz: "UTC", minute: 15 } })], now)[0].repeat).toEqual({ tz: "UTC", minute: 15, second: 0 });
  });
});
it("classifies explicit replan and actual notification ready launchInfo only", () => {
  expect(isBackgroundReminderLaunch(["--background-replan"])).toBe(true);
  expect(isBackgroundReminderLaunch([], { identifier: "one:focus", actionIdentifier: "DONE" })).toBe(true);
  expect(isBackgroundReminderLaunch(["-ApplePersistenceIgnoreState", "YES"])).toBe(false);
  expect(isBackgroundReminderLaunch([], {})).toBe(false);
  expect(isBackgroundReminderLaunch([], { identifier: "foreign", actionIdentifier: "DONE" })).toBe(false);
});
