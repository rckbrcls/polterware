import { describe, expect, it } from "vitest";
import { cardRuns, gateChecks, latestHandoff, mapVerification, nextGate } from "./work-card-model";

describe("work card model", () => {
  it("names the next gate of an open stage", () => {
    expect(nextGate("shape")).toEqual({ step: "contract", target: "plan", label: "Move to Planned" });
    expect(nextGate("plan")).toEqual({ step: "plan", target: "build", label: "Start work" });
    expect(nextGate("build")).toBeUndefined();
  });

  it("keeps the review checks that bear on the next gate", () => {
    const raw = { review: { checks: [
      { step: "shape", severity: "hint", message: "no intent" },
      { step: "contract", severity: "error", message: "blocking question open" },
      { step: "plan", severity: "hint", message: "no open tasks" },
      { step: "plan", severity: "hint", message: "" },
    ] } };
    expect(gateChecks(raw, "shape").map((check) => [check.severity, check.message])).toEqual([["hint", "no intent"], ["error", "blocking question open"]]);
    expect(gateChecks(raw, "plan").map((check) => check.message)).toEqual(["no open tasks"]);
    expect(gateChecks(raw, "build")).toEqual([]);
  });

  it("reads verification, the newest handoff, and the card's runs", () => {
    expect(mapVerification({ passed: true, checks: [{ status: "pass", message: "T1 done" }, { status: "odd", message: "x" }] })).toEqual({
      passed: true, checks: [{ status: "pass", message: "T1 done" }, { status: "info", message: "x" }],
    });
    const handoffs = { handoffs: [
      { slug: "a", at: "2026-10-01T00:00:00Z", goal: "old" },
      { slug: "a", at: "2026-10-02T00:00:00Z", goal: "new", inProgress: "half" },
      { slug: "b", at: "2026-10-03T00:00:00Z", goal: "other" },
    ] };
    expect(latestHandoff(handoffs, "a")).toMatchObject({ goal: "new", inProgress: "half" });
    expect(latestHandoff(handoffs, "c")).toBeUndefined();
    const runs = { runs: [
      { id: "r1", cardSlug: "a", status: "failed", createdAt: "2026-10-01T00:00:00Z" },
      { id: "r2", cardSlug: "b", status: "running" },
      { id: "r3", cardSlug: "a", status: "merged", startedAt: "2026-10-02T00:00:00Z" },
    ] };
    expect(cardRuns(runs, "a").map((run) => run.id)).toEqual(["r3", "r1"]);
  });
});
