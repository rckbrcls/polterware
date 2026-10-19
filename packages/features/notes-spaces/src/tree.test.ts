import { describe, expect, it } from "vitest";
import {
  buildSpaceTree,
  canMoveSpace,
  cascadeDeleteIds,
  deletePreviewCopy,
  spaceAncestors,
  moveTargetOptions,
  readExpandedSpaceIds,
  siblingOrder,
  type SpaceNode,
} from "./tree";

const spaces: SpaceNode[] = [
  { id: "a", parentId: "", name: "Alpha", color: "", icon: "brain", sortOrder: 1 },
  { id: "b", parentId: "a", name: "Beta", color: "", icon: "folder", sortOrder: 0 },
  { id: "c", parentId: "b", name: "Gamma", color: "", icon: "book", sortOrder: 0 },
];

describe("space tree helpers", () => {
  it("builds a sorted hierarchy and promotes orphaned nodes to roots", () => {
    const tree = buildSpaceTree([...spaces, { ...spaces[0]!, id: "orphan", parentId: "missing" }]);
    expect(tree.map((node) => node.id)).toEqual(["a", "orphan"]);
    expect(tree[0]?.children[0]?.children[0]?.id).toBe("c");
  });

  it("rejects self and descendant moves and allows a root parent", () => {
    expect(canMoveSpace(spaces, "a", "a")).toBe(false);
    expect(canMoveSpace(spaces, "a", "c")).toBe(false);
    expect(canMoveSpace(spaces, "c", "a")).toBe(true);
    expect(canMoveSpace(spaces, "b", "")).toBe(true);
  });

  it("reads persisted expansion state safely", () => {
    expect(readExpandedSpaceIds({ getItem: () => '["a","b"]' })).toEqual(["a", "b"]);
    expect(readExpandedSpaceIds({ getItem: () => "invalid" })).toEqual([]);
  });

  it("matches core cascade ids and delete copy from {deletedSpaceIds, movedNoteCount}", () => {
    expect(cascadeDeleteIds(spaces, "a")).toEqual(["a", "b", "c"]);
    expect(deletePreviewCopy({ deletedSpaceIds: ["a", "b", "c"], movedNoteCount: 4 })).toBe(
      "Deletes 2 child Spaces; 4 notes move to Inbox.",
    );
  });

  it("walks ancestors and reorders siblings without wrapping", () => {
    expect(spaceAncestors(spaces, "c").map((space) => space.id)).toEqual(["a", "b"]);
    expect(siblingOrder(spaces, "a", "b", 1)).toBeUndefined();
    expect(siblingOrder(
      [
        { id: "x", parentId: "p", name: "X", color: "", icon: "brain", sortOrder: 0 },
        { id: "y", parentId: "p", name: "Y", color: "", icon: "brain", sortOrder: 1 },
      ],
      "p",
      "x",
      1,
    )).toEqual(["y", "x"]);
  });

  it("disables cyclic Move to targets in the option list", () => {
    const options = moveTargetOptions(spaces, "a");
    expect(options.find((option) => option.value === "")?.disabled).toBe(false);
    expect(options.find((option) => option.value === "a")?.disabled).toBe(true);
    expect(options.find((option) => option.value === "c")?.disabled).toBe(true);
    expect(options.find((option) => option.value === "b")?.disabled).toBe(true);
  });
});
