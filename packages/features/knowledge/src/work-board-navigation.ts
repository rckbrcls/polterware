export type WorkBoardNavigation = {
  selectedId: string;
  isOpen: boolean;
};

export function initialWorkBoardNavigation(): WorkBoardNavigation {
  return { selectedId: "", isOpen: false };
}

export function openWorkBoard(selectedId: string): WorkBoardNavigation {
  return { selectedId, isOpen: true };
}

/** Returning to the list keeps the last board selected for the next open. */
export function backToWorkBoards(current: WorkBoardNavigation): WorkBoardNavigation {
  return { ...current, isOpen: false };
}
