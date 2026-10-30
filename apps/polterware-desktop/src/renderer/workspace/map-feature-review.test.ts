import { describe, expect, it } from "vitest";
import { gateErrorLines, mapFeatureReview } from "./map-feature-review";

describe("mapFeatureReview", () => {
  it("maps impact, routes, and checks, dropping unknown steps", () => {
    const review = mapFeatureReview({
      card: {
        id: "c1",
        slug: "git-import",
        title: "Git import",
        intent: "Import HEAD as evidence",
        stage: "shape",
        tasks: [],
        questions: [{ id: "q1", text: "Merge commits?", blocking: true, state: "open" }],
        invariants: [],
      },
      underPath: "core/import",
      underTitle: "Import",
      suggested: [],
      touches: [{ path: "core", level: "domain", title: "Core" }],
      decisions: [{ ref: "Decision-0007", id: "decision-7", title: "Decision 0007 Deterministic import", status: "accepted", from: "core" }],
      inherited: [{ text: "No network calls during scan", from: "core" }],
      questions: [
        { id: "q1", text: "Merge commits?", blocking: true, route: "delegated" },
        { id: "q2", text: "How many?", route: "mystery" },
      ],
      checks: [
        { step: "contract", severity: "error", message: "blocking question open" },
        { step: "plan", severity: "hint", message: "T1 has no scope" },
        { step: "build", severity: "error", message: "dropped" },
      ],
    });

    expect(review?.card.slug).toBe("git-import");
    expect(review?.underPath).toBe("core/import");
    expect(review?.touches[0]).toEqual({ path: "core", level: "domain", title: "Core" });
    expect(review?.decisions[0]).toMatchObject({ status: "accepted", from: "core" });
    expect(review?.questions.map((q) => q.route)).toEqual(["delegated", "inbox"]);
    expect(review?.checks).toHaveLength(2);
    expect(review?.checks[0]).toEqual({ step: "contract", severity: "error", message: "blocking question open" });
  });

  it("returns null without a card", () => {
    expect(mapFeatureReview({})).toBeNull();
  });
});

describe("gateErrorLines", () => {
  it("splits a refused gate into lines without generated line numbers", () => {
    expect(
      gateErrorLines('[invalid_argument] line 0: card x is in build: the contract gate moves a card from shape; line 0: blocking question open: "a; b?"'),
    ).toEqual([
      "card x is in build: the contract gate moves a card from shape",
      'blocking question open: "a; b?"',
    ]);
  });
});
