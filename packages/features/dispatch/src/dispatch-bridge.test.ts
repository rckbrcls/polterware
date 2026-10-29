import { describe, expect, it } from "vitest";
import { runReviewAction, worktreeDisplayStatus } from "./dispatch-bridge";

describe("worktree display status", () => {
  it("shows how the run ended while its worktree is still active", () => {
    expect(worktreeDisplayStatus("FAILED", "active")).toBe("FAILED");
    expect(worktreeDisplayStatus("TIMED_OUT", "active")).toBe("TIMED_OUT");
    expect(worktreeDisplayStatus("cancelled", "active")).toBe("cancelled");
    expect(worktreeDisplayStatus("ORPHANED", "active")).toBe("ORPHANED");
  });
  it("keeps the worktree status for live and finished runs", () => {
    expect(worktreeDisplayStatus("RUNNING", "active")).toBe("active");
    expect(worktreeDisplayStatus("COMPLETED", "ready")).toBe("ready");
    expect(worktreeDisplayStatus("FAILED", "abandoned")).toBe("abandoned");
    expect(worktreeDisplayStatus("FAILED", "")).toBe("");
  });
});

describe("run review action", () => {
  const run = (status: string, verification = "", mergedAt = "") => ({ status, verification, mergedAt });
  it("offers Verify on a finished run and Merge once it is verified", () => {
    expect(runReviewAction(run("completed"), true)).toBe("verify");
    expect(runReviewAction(run("failed", "verification_failed"), true)).toBe("verify");
    expect(runReviewAction(run("completed", "verified"), true)).toBe("merge");
    expect(runReviewAction(run("completed", "passed"), true)).toBe("merge");
  });
  it("offers nothing while running, after a merge, without a worktree, or when cancelled", () => {
    expect(runReviewAction(run("running"), true)).toBeNull();
    expect(runReviewAction(run("completed", "verified", "2026-10-01"), true)).toBeNull();
    expect(runReviewAction(run("completed"), false)).toBeNull();
    expect(runReviewAction(run("cancelled"), true)).toBeNull();
  });
});
