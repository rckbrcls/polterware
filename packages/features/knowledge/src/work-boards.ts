import type { WorkspaceWorkBoard } from "@polterware/feature-shell";

/** Empty id denotes the implicit view, never a stored board. */
export const DEFAULT_WORK_BOARD = { id: "", name: "Default board" } as const;

export type WorkBoardAction =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string }
  | { kind: "reorder"; id: string; boardIds: string[] };

export function orderWorkBoards(boards: readonly WorkspaceWorkBoard[]): WorkspaceWorkBoard[] {
  return [...boards].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function workBoardOptions(boards: readonly WorkspaceWorkBoard[]) {
  return [DEFAULT_WORK_BOARD, ...orderWorkBoards(boards)].map((board) => ({ value: board.id, label: board.name }));
}

export function selectedWorkBoard(boards: readonly WorkspaceWorkBoard[], id: string) {
  return boards.find((board) => board.id === id) ?? DEFAULT_WORK_BOARD;
}

/** Returns the full stored permutation; the implicit board cannot move. */
export function moveWorkBoard(boards: readonly WorkspaceWorkBoard[], id: string, direction: -1 | 1): string[] | null {
  const ids = orderWorkBoards(boards).map((board) => board.id);
  const index = ids.indexOf(id);
  const target = index + direction;
  if (!id || index < 0 || target < 0 || target >= ids.length) return null;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}
