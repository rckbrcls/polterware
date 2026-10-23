import { describe, expect, it, vi } from "vitest";
import { createShellBridge, type ShellWireBridge } from "@polterware/feature-notes-shell";
import { loadDeletePreview, toSpaceNode, wireRev } from "./bridge";

function wire(spacesJson: unknown, notes = { total: 0 }): ShellWireBridge {
  return {
    spaces: { list: async () => ({ spaces: spacesJson }) },
    notes: { list: async () => notes },
    tags: {},
    reminders: {},
    search: {},
    onChange: () => () => {},
    app: { onDeepLink: () => () => {}, getDeepLink: async () => null },
  } as unknown as ShellWireBridge;
}

describe("spaces wire bridge", () => {
  it("parses protobuf JSON and sends expectedRev as a decimal string", async () => {
    const update = vi.fn(async () => ({ space: { id: "a", name: "Renamed", rev: "2" } }));
    const api = createShellBridge({
      ...wire([{ id: "a", name: "Alpha", parentId: "", color: "#7EA8F0", icon: "brain", sortOrder: 0, rev: "1" }]),
      spaces: {
        list: async () => ({ spaces: [{ id: "a", name: "Alpha", parentId: "", color: "#7EA8F0", icon: "brain", sortOrder: 0, rev: "1" }] }),
        update,
      },
    } as unknown as ShellWireBridge);
    const listed = await api.spaces.list({});
    expect(listed.spaces[0]?.rev).toBe(1n);
    await api.spaces.update({ id: "a", expectedRev: wireRev(listed.spaces[0]?.rev), name: "Renamed" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ expectedRev: "1" }));
  });

  it("builds a delete preview with the same shape as the delete response", async () => {
    const api = createShellBridge(wire(
      [
        { id: "a", name: "Alpha", parentId: "", rev: "1" },
        { id: "b", name: "Beta", parentId: "a", rev: "1" },
      ],
      { total: 3 },
    ));
    const listed = await api.spaces.list({});
    const preview = await loadDeletePreview(api, listed.spaces.map(toSpaceNode), "a");
    expect(preview).toEqual({ deletedSpaceIds: ["a", "b"], movedNoteCount: 3 });
  });
});
