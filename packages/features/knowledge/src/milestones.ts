import type { WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";

/** Implicit views that are never stored: every card, and the cards with no milestone. */
export const ALL_WORK = { id: "", name: "All work" } as const;
export const BACKLOG = { id: "backlog", name: "Backlog" } as const;

export type MilestoneView = Pick<WorkspaceMilestone, "id" | "name"> & { slug?: string };

export type MilestoneAction =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "archive"; id: string }
  | { kind: "reorder"; id: string; milestoneIds: string[] };

/** Listed (unarchived) milestones by position, then id; the source is not mutated. */
export function listedMilestones(milestones: readonly WorkspaceMilestone[]): WorkspaceMilestone[] {
  return milestones
    .filter((item) => !item.archivedAt)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The view an id opens; an archived or unknown milestone falls back to All work. */
export function selectedMilestoneView(milestones: readonly WorkspaceMilestone[], id: string): MilestoneView {
  if (id === BACKLOG.id) return BACKLOG;
  return listedMilestones(milestones).find((item) => item.id === id) ?? ALL_WORK;
}

/** The cards a view shows: all of them, the Backlog, or one milestone's. */
export function cardsInView<T extends Pick<WorkspaceWorkCard, "milestoneId">>(cards: readonly T[], viewId: string): T[] {
  if (viewId === ALL_WORK.id) return [...cards];
  if (viewId === BACKLOG.id) return cards.filter((card) => !card.milestoneId);
  return cards.filter((card) => card.milestoneId === viewId);
}

/** Returns the full listed permutation after moving id one step; implicit views cannot move. */
export function moveMilestone(milestones: readonly WorkspaceMilestone[], id: string, direction: -1 | 1): string[] | null {
  const ids = listedMilestones(milestones).map((item) => item.id);
  const index = ids.indexOf(id);
  const target = index + direction;
  if (!id || index < 0 || target < 0 || target >= ids.length) return null;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  return ids;
}
