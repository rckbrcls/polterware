import { describe, expect, it } from "vitest";
import { backToWorkBoards, initialWorkBoardNavigation, openWorkBoard } from "./work-board-navigation";

describe("Work board navigation", () => {
  it("opens a board from the list and returns without forgetting it", () => {
    const open = openWorkBoard("delivery");
    expect(open).toEqual({ selectedId: "delivery", isOpen: true });

    const list = backToWorkBoards(open);
    expect(list).toEqual({ selectedId: "delivery", isOpen: false });

    expect(openWorkBoard(list.selectedId)).toEqual(open);
    expect(initialWorkBoardNavigation()).toEqual({ selectedId: "", isOpen: false });
  });
});
