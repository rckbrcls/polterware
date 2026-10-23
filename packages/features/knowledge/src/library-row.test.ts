import { describe, expect, it } from "vitest";
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryRows,
  libraryFiltersActive,
  libraryRowsFromWorkspace,
  toggleFilterValue,
} from "./library-row";
import type { WorkspaceVerdict } from "@polterware/feature-shell";

const verdict = {
  id: "verdict-1",
  title: "Local-first",
  summary: "",
  bodyMarkdown: "",
  updatedAt: "2026-01-02",
  tags: ["verdict"],
  status: "accepted",
  state: "active",
  scope: "decision",
  supersededBy: "",
  supersedes: [],
  reviewTrigger: "",
  statusReason: "",
  governs: [],
  owner: "Ada",
  entityLinks: [],
} satisfies WorkspaceVerdict;

const principle = { ...verdict, id: "verdict-2", title: "Evidence over opinion", scope: "principle", state: "proposed" } satisfies WorkspaceVerdict;

describe("libraryRowsFromWorkspace", () => {
  it("pins principles above local decisions", () => {
    const rows = libraryRowsFromWorkspace({ verdicts: [verdict, principle] });
    expect(rows.map((row) => row.id)).toEqual(["verdict-2", "verdict-1"]);
    expect(rows[0]?.categoryLabel).toBe("Principle");
  });

  it("filters by status, linked, and query", () => {
    const rows = libraryRowsFromWorkspace({ verdicts: [verdict, principle] });
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, statuses: ["active"] }).map((row) => row.id)).toEqual(["verdict-1"]);
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, linked: "linked" })).toHaveLength(0);
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, query: "evidence" }).map((row) => row.id)).toEqual(["verdict-2"]);
  });

  it("reports active filters and toggles values", () => {
    expect(libraryFiltersActive(EMPTY_LIBRARY_FILTERS)).toBe(false);
    expect(libraryFiltersActive({ ...EMPTY_LIBRARY_FILTERS, statuses: ["active"] })).toBe(true);
    expect(toggleFilterValue(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleFilterValue(["a", "b"], "a", false)).toEqual(["b"]);
  });
});
