import type { WorkspaceVerdict } from "@polterware/feature-shell";
import type { StatusTone } from "@polterware/frontend-design-system";

export type LibraryEntityKind = "verdict";

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

/** The Library lists Verdicts; Evidence has its own list. */
export function libraryRowsFromWorkspace(input: { verdicts?: WorkspaceVerdict[] }): LibraryRow[] {
  const rows = (input.verdicts ?? []).map((verdict): LibraryRow => ({
    id: verdict.id,
    entityKind: "verdict",
    title: verdict.title,
    categoryLabel: verdict.scope === "principle" ? "Principle" : "Verdict",
    statusLabel: verdict.state,
    statusTone: decisionStateTone(verdict.state),
    meta: verdict.owner,
    updatedAt: verdict.updatedAt,
    hasLinks: verdict.entityLinks.length > 0,
    pinned: verdict.scope === "principle",
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

/** Tone of an Verdict lifecycle state chip. */
export function decisionStateTone(state: WorkspaceVerdict["state"]): StatusTone {
  switch (state) {
    case "active":
      return "ok";
    case "challenged":
      return "warn";
    default:
      return "muted";
  }
}
