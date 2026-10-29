import { describe, expect, it } from "vitest";
import {
  FILTER_IS,
  FILTER_IS_NOT,
  addClause,
  filterOperators,
  matchClauses,
  operatorLabel,
  parseFilterPayload,
  pluralize,
  sameClauses,
  serializeFilterPayload,
  setClauseOperator,
  toggleClauseValue,
  valueSummary,
  type FilterClause,
  type FilterField,
} from "./filter-model";

const status: FilterField = {
  id: "status",
  label: "Status",
  kind: "multi",
  options: [
    { id: "backlog", label: "Backlog" },
    { id: "planned", label: "Planned" },
    { id: "started", label: "In Progress" },
  ],
};

const scope: FilterField = { ...status, id: "scope", label: "System", negatable: false, repeatable: false };

const created: FilterField = {
  id: "created",
  label: "Created date",
  kind: "single",
  options: [{ id: "week", label: "1 week ago" }],
  operators: [
    { id: "after", label: "after" },
    { id: "before", label: "before" },
  ],
};

describe("filter model", () => {
  it("pluralizes field nouns", () => {
    expect(pluralize("Status")).toBe("statuses");
    expect(pluralize("Category")).toBe("categories");
    expect(pluralize("Tag")).toBe("tags");
    expect(pluralize("Day")).toBe("days");
  });

  it("labels operators by value count and negatability", () => {
    expect(filterOperators(status, 1).map((op) => op.label)).toEqual(["is", "is not"]);
    expect(filterOperators(status, 3).map((op) => op.label)).toEqual(["is any of", "is not"]);
    expect(filterOperators(scope, 2).map((op) => op.label)).toEqual(["is any of"]);
    expect(filterOperators(created, 1).map((op) => op.id)).toEqual(["after", "before"]);
  });

  it("adds a new clause per add on repeatable fields", () => {
    const first = addClause([], status, ["planned"]);
    const second = addClause(first.clauses, status, ["started"]);
    expect(second.clauses).toHaveLength(2);
    expect(second.clauses.map((clause) => clause.values)).toEqual([["planned"], ["started"]]);
    expect(second.id).not.toBe(first.id);
  });

  it("merges into the existing clause on non-repeatable fields", () => {
    const first = addClause([], scope, ["planned"]);
    const second = addClause(first.clauses, scope, ["started"]);
    expect(second.clauses).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.clauses[0]?.values).toEqual(["planned", "started"]);
  });

  it("uses the field's first custom operator as default", () => {
    expect(addClause([], created, ["week"]).clauses[0]?.operator).toBe("after");
  });

  it("toggles values and drops the clause when the last value goes", () => {
    const { clauses, id } = addClause([], status, ["planned"]);
    const two = toggleClauseValue(clauses, id, status, "backlog", true);
    expect(two[0]?.values).toEqual(["planned", "backlog"]);
    expect(operatorLabel(status, two[0]!)).toBe("is any of");
    expect(valueSummary(status, two[0]!)).toBe("2 statuses");
    const one = toggleClauseValue(two, id, status, "planned", false);
    expect(operatorLabel(status, one[0]!)).toBe("is");
    expect(valueSummary(status, one[0]!)).toBe("Backlog");
    expect(toggleClauseValue(one, id, status, "backlog", false)).toEqual([]);
  });

  it("matches with AND across clauses and supports is not", () => {
    const records = [
      { id: "a", status: "planned", tags: ["ui", "api"], pinned: true },
      { id: "b", status: "backlog", tags: ["api"], pinned: false },
      { id: "c", status: "started", tags: [], pinned: true },
    ];
    const accessors = {
      status: (item: (typeof records)[number]) => item.status,
      tags: (item: (typeof records)[number]) => item.tags,
      pinned: (item: (typeof records)[number]) => item.pinned,
    };
    const clauses: FilterClause[] = [
      { id: "1", field: "status", operator: FILTER_IS_NOT, values: ["backlog"] },
      { id: "2", field: "tags", operator: FILTER_IS, values: ["api", "ui"] },
    ];
    expect(records.filter((item) => matchClauses(item, clauses, accessors)).map((item) => item.id)).toEqual(["a"]);
    const repeated: FilterClause[] = [
      { id: "1", field: "tags", operator: FILTER_IS, values: ["api"] },
      { id: "2", field: "tags", operator: FILTER_IS, values: ["ui"] },
    ];
    expect(records.filter((item) => matchClauses(item, repeated, accessors)).map((item) => item.id)).toEqual(["a"]);
    const notPinned: FilterClause[] = [{ id: "1", field: "pinned", operator: FILTER_IS_NOT, values: ["pinned"] }];
    expect(records.filter((item) => matchClauses(item, notPinned, accessors)).map((item) => item.id)).toEqual(["b"]);
    const unknown: FilterClause[] = [{ id: "1", field: "scope", operator: FILTER_IS, values: ["x"] }];
    expect(records.filter((item) => matchClauses(item, unknown, accessors))).toHaveLength(3);
  });

  it("runs custom operator matchers", () => {
    const clauses: FilterClause[] = [{ id: "1", field: "age", operator: "after", values: ["2"] }];
    const matchers = { after: (values: readonly string[], target: readonly string[]) => Number(values[0]) > Number(target[0]) };
    expect(matchClauses({ age: "3" }, clauses, { age: (item) => item.age }, matchers)).toBe(true);
    expect(matchClauses({ age: "1" }, clauses, { age: (item) => item.age }, matchers)).toBe(false);
  });

  it("compares clause lists regardless of ids and order", () => {
    const a: FilterClause[] = [
      { id: "1", field: "status", operator: FILTER_IS, values: ["a", "b"] },
      { id: "2", field: "tags", operator: FILTER_IS_NOT, values: ["x"] },
    ];
    const b: FilterClause[] = [
      { id: "9", field: "tags", operator: FILTER_IS_NOT, values: ["x"] },
      { id: "8", field: "status", operator: FILTER_IS, values: ["b", "a"] },
    ];
    expect(sameClauses(a, b)).toBe(true);
    expect(sameClauses(a, setClauseOperator(b, "9", FILTER_IS))).toBe(false);
  });

  it("round-trips the saved payload and drops malformed clauses", () => {
    const clauses: FilterClause[] = [{ id: "1", field: "status", operator: FILTER_IS, values: ["a"] }];
    const json = serializeFilterPayload(clauses, { query: "ghost" });
    const parsed = parseFilterPayload(json);
    expect(sameClauses(parsed.clauses, clauses)).toBe(true);
    expect(parsed.extra).toEqual({ query: "ghost" });
    expect(JSON.parse(json).version).toBe(1);
    expect(parseFilterPayload('{"version":1,"clauses":[{"field":1},{"field":"a","operator":"is","values":[]}]}').clauses).toEqual([]);
    expect(parseFilterPayload("not json").clauses).toEqual([]);
  });
});
