import type { WorkspaceDecision } from "@polterware/feature-shell";
import type { StatusTone } from "@polterware/frontend-design-system";

export type LibraryEntityKind = "decision";

export type LibraryLinkedFilter = "any" | "linked" | "unlinked";

export type LibraryFilters = {
  statuses: readonly string[];
  linked: LibraryLinkedFilter;
  query: string;
};

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  statuses: [],
  linked: "any",
  query: "",
};

export type LibraryRow = {
  id: string;
  entityKind: LibraryEntityKind;
  title: string;
  /** Structure nodes the Decision is about; none makes it a principle for the whole project. */
  scopeNodeIds: readonly string[];
  /** The Decision's lifecycle state id; the filter matches it. */
  state: WorkspaceDecision["state"];
  statusLabel: string;
  statusTone: StatusTone;
  updatedAt: string;
  hasLinks: boolean;
  /** Principles stay above the rest of the list. */
  pinned: boolean;
};

/** What a Decision's lifecycle state reads as. */
export const DECISION_STATE_LABEL: Record<WorkspaceDecision["state"], string> = {
  proposed: "Proposed",
  active: "Active",
  challenged: "Under review",
  superseded: "Replaced",
};

/** The Library lists Decisions; docs have their own list. */
export function libraryRowsFromWorkspace(input: { decisions?: WorkspaceDecision[] }): LibraryRow[] {
  const rows = (input.decisions ?? []).map((decision): LibraryRow => ({
    id: decision.id,
    entityKind: "decision",
    title: decision.title,
    scopeNodeIds: decision.scopeNodeIds,
    state: decision.state,
    statusLabel: DECISION_STATE_LABEL[decision.state],
    statusTone: decisionStateTone(decision.state),
    updatedAt: decision.updatedAt,
    hasLinks: decision.entityLinks.length > 0,
    // A decision with no contexts is a principle: it applies to the whole project.
    pinned: decision.scopeNodeIds.length === 0,
  }));
  return [...rows.filter((row) => row.pinned), ...rows.filter((row) => !row.pinned)];
}

export function libraryFiltersActive(filters: LibraryFilters): boolean {
  return filters.statuses.length > 0 || filters.linked !== "any";
}

export function filterLibraryRows(
  rows: LibraryRow[],
  filters: LibraryFilters,
): LibraryRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.state)) return false;
    if (filters.linked === "linked" && !row.hasLinks) return false;
    if (filters.linked === "unlinked" && row.hasLinks) return false;
    if (!needle) return true;
    return [row.title, row.statusLabel, row.pinned ? "principle" : ""].some(
      (value) => value.toLowerCase().includes(needle),
    );
  });
}

export function toggleFilterValue<T extends string>(
  current: readonly T[],
  id: T,
  checked: boolean,
): T[] {
  return checked ? [...current, id] : current.filter((value) => value !== id);
}

/** Tone of a Decision lifecycle state chip. */
export function decisionStateTone(state: WorkspaceDecision["state"]): StatusTone {
  switch (state) {
    case "active":
      return "ok";
    case "challenged":
      return "warn";
    default:
      return "muted";
  }
}
