import { describe, expect, it } from "vitest";
import type { WorkspaceMilestone } from "@polterware/feature-shell";
import { ALL_WORK, BACKLOG, cardsInView, listedMilestones, moveMilestone, selectedMilestoneView } from "./milestones";

const milestone = (id: string, position: number, archivedAt = ""): WorkspaceMilestone => ({
  id, position, name: id, slug: id, projectId: "project", goal: "", exitCriteria: [], targetDate: "", state: "planned", archivedAt,
});

describe("milestone views", () => {
  it("lists unarchived milestones by position then id without mutating the source", () => {
    const items = [milestone("z", 4), milestone("b", 1), milestone("a", 1), milestone("gone", 0, "2026-10-01")];
    expect(listedMilestones(items).map((item) => item.id)).toEqual(["a", "b", "z"]);
    expect(items.map((item) => item.id)).toEqual(["z", "b", "a", "gone"]);
  });

  it("opens All work, the Backlog, or a listed milestone", () => {
    const items = [milestone("a", 0), milestone("gone", 1, "2026-10-01")];
    expect(selectedMilestoneView(items, "")).toBe(ALL_WORK);
    expect(selectedMilestoneView(items, BACKLOG.id)).toBe(BACKLOG);
    expect(selectedMilestoneView(items, "a")).toBe(items[0]);
    expect(selectedMilestoneView(items, "gone")).toBe(ALL_WORK);
    expect(selectedMilestoneView(items, "missing")).toBe(ALL_WORK);
  });

  it("shows every card, the cards with no milestone, or one milestone's cards", () => {
    const cards = [{ id: "1", milestoneId: "a" }, { id: "2", milestoneId: "" }, { id: "3" }];
    expect(cardsInView(cards, ALL_WORK.id).map((card) => card.id)).toEqual(["1", "2", "3"]);
    expect(cardsInView(cards, BACKLOG.id).map((card) => card.id)).toEqual(["2", "3"]);
    expect(cardsInView(cards, "a").map((card) => card.id)).toEqual(["1"]);
  });

  it("moves listed milestones using the full permutation, never the implicit views", () => {
    const items = [milestone("c", 2), milestone("a", 0), milestone("b", 1)];
    expect(moveMilestone(items, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveMilestone(items, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveMilestone(items, "", 1)).toBeNull();
    expect(moveMilestone(items, BACKLOG.id, 1)).toBeNull();
    expect(moveMilestone(items, "a", -1)).toBeNull();
  });
});
