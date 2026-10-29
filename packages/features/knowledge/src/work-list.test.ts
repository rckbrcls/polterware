import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_LIST_DISPLAY,
  normalizeWorkListDisplay,
  orderWorkCards,
  workListGroupOf,
  workListGroups,
} from "./work-list";

const cards = [
  { slug: "b", title: "Beta login", stage: "build" as const, updatedAt: "x", updatedAtIso: "2026-09-02T10:00:00Z", milestoneId: "m1" },
  { slug: "a", title: "alpha search", stage: "shape" as const, updatedAt: "x", updatedAtIso: "2026-09-03T10:00:00Z", milestoneId: "" },
  { slug: "c", title: "Card 10", stage: "build" as const, updatedAt: "x", updatedAtIso: "2026-09-01T10:00:00Z" },
];

describe("work list display", () => {
  it("orders by updated, title, or stage in either direction", () => {
    expect(orderWorkCards(cards, "updated", "descending").map((card) => card.slug)).toEqual(["a", "b", "c"]);
    expect(orderWorkCards(cards, "title", "ascending").map((card) => card.slug)).toEqual(["a", "b", "c"]);
    // Ties keep the store's order.
    expect(orderWorkCards(cards, "stage", "ascending").map((card) => card.slug)).toEqual(["a", "b", "c"]);
    expect(orderWorkCards(cards, "stage", "descending").map((card) => card.slug)).toEqual(["b", "c", "a"]);
  });

  it("groups by stage or by milestone with the Backlog first", () => {
    expect(workListGroupOf(cards[0]!, "stage")).toBe("build");
    expect(workListGroupOf(cards[2]!, "milestone")).toBe("");
    expect(workListGroups("stage", []).map((group) => group.id)).toEqual(["shape", "plan", "build", "verify", "delivered"]);
    const milestones = [
      { id: "m2", projectId: "p", slug: "two", name: "Two", goal: "", exitCriteria: [], targetDate: "", state: "planned" as const, position: 2, archivedAt: "" },
      { id: "m1", projectId: "p", slug: "one", name: "One", goal: "", exitCriteria: [], targetDate: "", state: "active" as const, position: 1, archivedAt: "" },
      { id: "m3", projectId: "p", slug: "old", name: "Old", goal: "", exitCriteria: [], targetDate: "", state: "done" as const, position: 0, archivedAt: "2026-01-01" },
    ];
    expect(workListGroups("milestone", milestones).map((group) => group.label)).toEqual(["Backlog", "One", "Two"]);
    expect(workListGroups("none", milestones)).toEqual([]);
  });

  it("puts unknown remembered values back to the default", () => {
    expect(normalizeWorkListDisplay(undefined)).toEqual(DEFAULT_WORK_LIST_DISPLAY);
    expect(normalizeWorkListDisplay({ grouping: "owner", ordering: "title", direction: "ascending", properties: ["updated", "slug", "gone"] }))
      .toEqual({ grouping: "stage", ordering: "title", direction: "ascending", properties: ["slug", "updated"] });
  });
});
