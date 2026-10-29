import type { DisplayChoice } from "@polterware/frontend-design-system";
import type { WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";
import { listedMilestones } from "./milestones";
import { WORK_STAGES } from "./work-stage";

export type WorkListGrouping = "none" | "stage" | "milestone";
export type WorkListOrdering = "updated" | "title" | "stage";
export type WorkListProperty = "slug" | "stage" | "tasks" | "milestone" | "updated";
export type SortDirection = "ascending" | "descending";

/** How the Work list groups, orders, and which properties it shows; remembered per surface. */
export type WorkListDisplay = {
  grouping: WorkListGrouping;
  ordering: WorkListOrdering;
  direction: SortDirection;
  properties: WorkListProperty[];
};

export const DEFAULT_WORK_LIST_DISPLAY: WorkListDisplay = {
  grouping: "stage",
  ordering: "updated",
  direction: "descending",
  properties: ["slug", "stage", "tasks", "updated"],
};

export const WORK_LIST_GROUPINGS: readonly DisplayChoice[] = [
  { value: "none", label: "No grouping" },
  { value: "stage", label: "Stage" },
  { value: "milestone", label: "Milestone" },
];

export const WORK_LIST_ORDERINGS: readonly DisplayChoice[] = [
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title" },
  { value: "stage", label: "Stage" },
];

export const WORK_LIST_PROPERTIES: readonly DisplayChoice[] = [
  { value: "slug", label: "Slug" },
  { value: "stage", label: "Stage" },
  { value: "tasks", label: "Tasks" },
  { value: "milestone", label: "Milestone" },
  { value: "updated", label: "Updated" },
];

const has = (choices: readonly DisplayChoice[], value: unknown): boolean =>
  typeof value === "string" && choices.some((choice) => choice.value === value);

/** A remembered display with anything unknown (an older build's value) put back to the default. */
export function normalizeWorkListDisplay(raw: unknown): WorkListDisplay {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof WorkListDisplay, unknown>>;
  const properties = Array.isArray(value.properties)
    ? WORK_LIST_PROPERTIES.map((choice) => choice.value).filter((id) => (value.properties as unknown[]).includes(id))
    : DEFAULT_WORK_LIST_DISPLAY.properties;
  return {
    grouping: has(WORK_LIST_GROUPINGS, value.grouping) ? (value.grouping as WorkListGrouping) : DEFAULT_WORK_LIST_DISPLAY.grouping,
    ordering: has(WORK_LIST_ORDERINGS, value.ordering) ? (value.ordering as WorkListOrdering) : DEFAULT_WORK_LIST_DISPLAY.ordering,
    direction: value.direction === "ascending" ? "ascending" : "descending",
    properties: properties as WorkListProperty[],
  };
}

function updatedTime(card: Pick<WorkspaceWorkCard, "updatedAt" | "updatedAtIso">): number {
  const time = Date.parse(card.updatedAtIso || card.updatedAt);
  return Number.isNaN(time) ? 0 : time;
}

const stageIndex = (card: Pick<WorkspaceWorkCard, "stage">) => WORK_STAGES.findIndex((stage) => stage.id === card.stage);

/** The cards in the display's order; ties keep the store's order. */
export function orderWorkCards<T extends Pick<WorkspaceWorkCard, "title" | "stage" | "updatedAt" | "updatedAtIso">>(
  cards: readonly T[],
  ordering: WorkListOrdering,
  direction: SortDirection,
): T[] {
  const compare = (left: T, right: T): number => {
    if (ordering === "title") return left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
    if (ordering === "stage") return stageIndex(left) - stageIndex(right);
    return updatedTime(left) - updatedTime(right);
  };
  const sign = direction === "ascending" ? 1 : -1;
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => sign * compare(left.card, right.card) || left.index - right.index)
    .map((entry) => entry.card);
}

/** The group a card sits in: its stage, or its milestone ("" is the Backlog). */
export function workListGroupOf(card: Pick<WorkspaceWorkCard, "stage" | "milestoneId">, grouping: WorkListGrouping): string {
  return grouping === "milestone" ? card.milestoneId ?? "" : card.stage;
}

/** The sections for a grouping, in board order: the stages, or the Backlog and the milestones. */
export function workListGroups(
  grouping: WorkListGrouping,
  milestones: readonly WorkspaceMilestone[],
): { id: string; label: string }[] {
  if (grouping === "stage") return WORK_STAGES.map((stage) => ({ id: stage.id, label: stage.label }));
  if (grouping === "milestone") {
    return [{ id: "", label: "Backlog" }, ...listedMilestones(milestones).map((milestone) => ({ id: milestone.id, label: milestone.name }))];
  }
  return [];
}
