import { describe, expect, it } from "vitest";
import type { WorkspaceWorkBoard } from "@polterware/feature-shell";
import { DEFAULT_WORK_BOARD, moveWorkBoard, orderWorkBoards, selectedWorkBoard, workBoardOptions } from "./work-boards";

const board = (id: string, position: number): WorkspaceWorkBoard => ({ id, position, name: id, projectId: "project", configJson: '{"version":1}' });

describe("Work board views", () => {
  it("orders saved boards by position then id without mutating the source", () => {
    const boards = [board("z", 4), board("b", 1), board("a", 1)];
    expect(orderWorkBoards(boards).map((item) => item.id)).toEqual(["a", "b", "z"]);
    expect(boards.map((item) => item.id)).toEqual(["z", "b", "a"]);
  });

  it("always offers the implicit default first, including when no boards exist", () => {
    expect(workBoardOptions([])).toEqual([{ value: "", label: "Default board" }]);
    expect(workBoardOptions([board("b", -1)]).map((item) => item.value)).toEqual(["", "b"]);
    expect(selectedWorkBoard([], "")).toBe(DEFAULT_WORK_BOARD);
  });

  it("falls back to the default when a selected board was deleted or belongs to another project", () => {
    const boards = [board("a", 0)];
    expect(selectedWorkBoard(boards, "a")).toBe(boards[0]);
    expect(selectedWorkBoard(boards, "missing")).toBe(DEFAULT_WORK_BOARD);
    expect(selectedWorkBoard(boards, "")).toBe(DEFAULT_WORK_BOARD);
  });

  it("moves saved boards using the full stored permutation, excluding the default", () => {
    const boards = [board("c", 2), board("a", 0), board("b", 1)];
    expect(moveWorkBoard(boards, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveWorkBoard(boards, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveWorkBoard(boards, "", 1)).toBeNull();
    expect(moveWorkBoard(boards, "missing", 1)).toBeNull();
    expect(moveWorkBoard(boards, "a", -1)).toBeNull();
    expect(moveWorkBoard(boards, "c", 1)).toBeNull();
    expect(moveWorkBoard([], "", 1)).toBeNull();
  });
});
