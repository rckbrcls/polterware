import { describe, expect, it } from "vitest";
import { clausesToFilters, filtersToClauses, searchFilterFields } from "./filter-clauses";
import { EMPTY_FILTERS } from "./model";

describe("search filter clauses", () => {
  it("round-trips search filters through one inclusion-only clause per field", () => {
    const filters = { ...EMPTY_FILTERS, spaceId: "space-2", includeDescendants: false, tagIds: ["a", "b"], due: "custom" as const, dueFrom: "2026-10-01", dueTo: "2026-10-31" };
    const clauses = filtersToClauses(filters);
    expect(clauses.map(clause => [clause.field, clause.values])).toEqual([["space", ["space-2"]], ["children", ["children"]], ["tags", ["a", "b"]], ["due", ["custom"]]]);
    expect(clausesToFilters(clauses, filters)).toMatchObject({ spaceId: "space-2", includeDescendants: false, tagIds: ["a", "b"], due: "custom", dueFrom: "2026-10-01", updated: "any" });
    expect(clausesToFilters([], filters)).toMatchObject({ spaceId: "", includeDescendants: true, tagIds: [], due: "any", dueFrom: "" });
  });

  it("offers no negation or repeated pills", () => {
    for (const field of searchFilterFields([], [])) {
      expect(field.negatable).toBe(false);
      expect(field.repeatable).toBe(false);
    }
  });
});
