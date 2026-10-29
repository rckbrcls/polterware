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
  categoryLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  meta: string;
  updatedAt: string;
  hasLinks: boolean;
  /** Principles stay above the rest of the list. */
  pinned: boolean;
};

/** The Library lists Decisions; Evidence has its own list. */
export function libraryRowsFromWorkspace(input: { decisions?: WorkspaceDecision[] }): LibraryRow[] {
  const rows = (input.decisions ?? []).map((decision): LibraryRow => ({
    id: decision.id,
    entityKind: "decision",
    title: decision.title,
    categoryLabel: decision.scope === "principle" ? "Principle" : "Decision",
    statusLabel: decision.state,
    statusTone: decisionStateTone(decision.state),
    meta: decision.owner,
    updatedAt: decision.updatedAt,
    hasLinks: decision.entityLinks.length > 0,
    pinned: decision.scope === "principle",
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
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.statusLabel)) return false;
    if (filters.linked === "linked" && !row.hasLinks) return false;
    if (filters.linked === "unlinked" && row.hasLinks) return false;
    if (!needle) return true;
    return [row.title, row.meta, row.categoryLabel, row.statusLabel].some(
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
