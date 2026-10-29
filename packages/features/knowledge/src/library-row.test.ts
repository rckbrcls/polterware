import { describe, expect, it } from "vitest";
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryRows,
  libraryFiltersActive,
  libraryRowsFromWorkspace,
  toggleFilterValue,
} from "./library-row";
import type { WorkspaceDecision } from "@polterware/feature-shell";

const decision = {
  id: "decision-1",
  title: "Local-first",
  summary: "",
  bodyMarkdown: "",
  updatedAt: "2026-01-02",
  tags: ["decision"],
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
} satisfies WorkspaceDecision;

const principle = { ...decision, id: "decision-2", title: "Evidence over opinion", scope: "principle", state: "proposed" } satisfies WorkspaceDecision;

describe("libraryRowsFromWorkspace", () => {
  it("pins principles above local decisions", () => {
    const rows = libraryRowsFromWorkspace({ decisions: [decision, principle] });
    expect(rows.map((row) => row.id)).toEqual(["decision-2", "decision-1"]);
    expect(rows[0]?.categoryLabel).toBe("Principle");
  });

  it("filters by status, linked, and query", () => {
    const rows = libraryRowsFromWorkspace({ decisions: [decision, principle] });
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, statuses: ["active"] }).map((row) => row.id)).toEqual(["decision-1"]);
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, linked: "linked" })).toHaveLength(0);
    expect(filterLibraryRows(rows, { ...EMPTY_LIBRARY_FILTERS, query: "evidence" }).map((row) => row.id)).toEqual(["decision-2"]);
  });

  it("reports active filters and toggles values", () => {
    expect(libraryFiltersActive(EMPTY_LIBRARY_FILTERS)).toBe(false);
    expect(libraryFiltersActive({ ...EMPTY_LIBRARY_FILTERS, statuses: ["active"] })).toBe(true);
    expect(toggleFilterValue(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleFilterValue(["a", "b"], "a", false)).toEqual(["b"]);
  });
});
