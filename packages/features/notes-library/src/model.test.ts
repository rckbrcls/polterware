import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, filterRows, joinChecklist, reorderChecklist, splitChecklist, todayGroup } from "./model";
import { rowsFixture } from "./fixtures";

describe("note collection rules", () => {
  it("filters 10k fixtures below 50 ms, preserves input and puts pins first", () => {
    const rows = rowsFixture();
    const start = performance.now();
    const filtered = filterRows(rows, { ...DEFAULT_FILTER, query: "Note 1", tagId: "tag-1", inbox: true });
    const elapsed = performance.now() - start;
    expect(filtered.length).toBeGreaterThan(1000);
    expect(filtered[0]!.pinned).toBe(true);
    expect(rows[0]!.id).toBe("note-0");
    expect(elapsed).toBeLessThan(50);
    console.info(`10k filter: ${elapsed.toFixed(2)} ms`);
  });
  it.each([
    ["2026-10-03T12:00:00Z", "Overdue"], ["2026-10-04T12:00:00Z", "Today"],
    ["2026-10-11T12:00:00Z", "Upcoming 7 days"], ["2026-10-12T12:00:00Z", undefined],
  ])("groups all-day deadline %s by civil date", (dueAt, expected) => {
    expect(todayGroup({ ...rowsFixture(1)[0]!, dueAt, dueAllDay: true }, new Date(2026, 9, 4, 12))).toBe(expected);
  });
  it("moves checklist items with a keyboard action without dropping detail or completion", () => {
    const items = [{ id: "a", title: "A", detail: "Details A", done: true }, { id: "b", title: "B", detail: "Details B", done: false }];
    expect(reorderChecklist(items, 1, -1)).toEqual([{ ...items[1], sortOrder: 0 }, { ...items[0], sortOrder: 1 }]);
    expect(reorderChecklist(items, 0, -1)).toBe(items);
  });
});

describe("markdown checklist", () => {
  it("joins the note and the checklist into one document and splits it back", () => {
    const body = joinChecklist("Intro", [{ title: "One", done: false }, { title: "Two", done: true }]);
    expect(body).toBe("Intro\n\n- [ ] One\n- [x] Two");
    const { content, items } = splitChecklist(body, [{ id: "a", title: "One", detail: "d", done: false, sortOrder: 0 }]);
    expect(content).toBe("Intro");
    expect(items).toEqual([{ id: "a", title: "One", detail: "d", done: false, sortOrder: 0 }, { id: undefined, title: "Two", detail: "", done: true, sortOrder: 1 }]);
  });
  it("keeps task syntax inside code fences as text", () => {
    expect(splitChecklist("```\n- [ ] x\n```").items).toEqual([]);
  });
});
