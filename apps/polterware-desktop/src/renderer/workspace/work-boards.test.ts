import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkspace, loadWorkBoards, pickWorkspaceExtensions, setActiveScope } from "./load";

describe("workspace Work boards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setActiveScope({ nodeIds: [] });
  });

  it("loads project views without sending the card scope or interpreting opaque config", async () => {
    const listBoards = vi.fn().mockResolvedValue({ boards: [
      { id: "board", projectId: "project", name: "Delivery", configJson: '{"version":2,"future":true}' },
    ] });
    vi.stubGlobal("window", { polterware: { core: { work: { listBoards } } } });
    setActiveScope({ nodeIds: ["component"] });
    expect(await loadWorkBoards("project")).toEqual([
      { id: "board", projectId: "project", name: "Delivery", position: 0, configJson: '{"version":2,"future":true}' },
    ]);
    expect(listBoards).toHaveBeenCalledWith({ projectId: "project" });
  });

  it("keeps the implicit default out of stored workspace rows and preserves views on shell refresh", () => {
    const workspace = emptyWorkspace();
    expect(workspace.workBoards).toEqual([]);
    workspace.workBoards = [{ id: "board", projectId: "project", name: "Delivery", position: 0, configJson: '{"version":1}' }];
    expect(pickWorkspaceExtensions(workspace).workBoards).toBe(workspace.workBoards);
  });

  it("propagates a failed read instead of reporting an empty collection", async () => {
    vi.stubGlobal("window", { polterware: { core: { work: { listBoards: vi.fn().mockRejectedValue(new Error("Core unavailable")) } } } });
    await expect(loadWorkBoards("project")).rejects.toThrow("Core unavailable");
  });
});
