import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkspace, loadMilestones, pickWorkspaceExtensions, setActiveScope } from "./load";

describe("workspace milestones", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setActiveScope({ nodeIds: [] });
  });

  it("loads milestones without sending the card scope and defaults unknown fields", async () => {
    const listMilestones = vi.fn().mockResolvedValue({ milestones: [
      { id: "m1", projectId: "project", slug: "beta", name: "Beta", goal: "Ship it", exitCriteria: ["Five users"], targetDate: "2026-11-30", state: "active", position: 1 },
      { id: "m2", projectId: "project", slug: "later", name: "Later", state: "someday", archivedAt: "2026-10-01T00:00:00Z" },
    ] });
    vi.stubGlobal("window", { polterware: { core: { work: { listMilestones } } } });
    setActiveScope({ nodeIds: ["component"] });
    expect(await loadMilestones("project")).toEqual([
      { id: "m1", projectId: "project", slug: "beta", name: "Beta", goal: "Ship it", exitCriteria: ["Five users"], targetDate: "2026-11-30", state: "active", position: 1, archivedAt: "" },
      { id: "m2", projectId: "project", slug: "later", name: "Later", goal: "", exitCriteria: [], targetDate: "", state: "planned", position: 0, archivedAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(listMilestones).toHaveBeenCalledWith({ projectId: "project" });
  });

  it("keeps milestones on shell refresh", () => {
    const workspace = emptyWorkspace();
    expect(workspace.milestones).toEqual([]);
    workspace.milestones = [{ id: "m1", projectId: "project", slug: "beta", name: "Beta", goal: "", exitCriteria: [], targetDate: "", state: "planned", position: 0, archivedAt: "" }];
    expect(pickWorkspaceExtensions(workspace).milestones).toBe(workspace.milestones);
  });

  it("propagates a failed read instead of reporting an empty collection", async () => {
    vi.stubGlobal("window", { polterware: { core: { work: { listMilestones: vi.fn().mockRejectedValue(new Error("Core unavailable")) } } } });
    await expect(loadMilestones("project")).rejects.toThrow("Core unavailable");
  });
});
