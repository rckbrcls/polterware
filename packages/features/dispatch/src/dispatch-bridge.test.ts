import { describe, expect, it } from "vitest";
import { worktreeDisplayStatus } from "./dispatch-bridge";

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
