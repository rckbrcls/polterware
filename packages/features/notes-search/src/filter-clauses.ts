import type { FilterClause, FilterField } from "@polterware/frontend-design-system";
import type { DuePreset, SearchFilters, SpaceJSON, TagJSON, UpdatedPreset } from "./model";

export const DUE_OPTIONS: { id: DuePreset; label: string }[] = [
  { id: "any", label: "Any due date" }, { id: "overdue", label: "Overdue" }, { id: "today", label: "Due today" },
  { id: "next7", label: "Next 7 days" }, { id: "month", label: "This month" }, { id: "custom", label: "Custom due range" },
];
export const UPDATED_OPTIONS: { id: UpdatedPreset; label: string }[] = [
  { id: "any", label: "Any update" }, { id: "today", label: "Updated today" }, { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" }, { id: "custom", label: "Custom updated range" },
];

/**
 * Search filters run in the core, which takes inclusion lists only and caps results, so
 * these fields offer no `is not` and keep one pill each. Clause ids are the field ids.
 */
export function searchFilterFields(spaces: readonly SpaceJSON[], tags: readonly TagJSON[]): FilterField[] {
  const shared = { negatable: false, repeatable: false } as const;
  return [
    { ...shared, id: "space", label: "Space", kind: "single", options: spaces.map(space => ({ id: space.id ?? "", label: space.name ?? "Unnamed Space" })) },
    {
      ...shared, id: "children", label: "Space", menuLabel: "Exclude child Spaces", kind: "boolean", section: "flags",
      operators: [{ id: "is", label: "excludes" }], options: [{ id: "children", label: "child Spaces" }],
    },
    { ...shared, id: "tags", label: "Tag", kind: "multi", options: tags.map(tag => ({ id: tag.id ?? "", label: tag.name ?? "Unnamed tag" })) },
    { ...shared, id: "due", label: "Due", kind: "single", options: DUE_OPTIONS.filter(option => option.id !== "any") },
    { ...shared, id: "updated", label: "Updated", kind: "single", options: UPDATED_OPTIONS.filter(option => option.id !== "any") },
  ];
}

function clause(field: string, values: readonly string[]): FilterClause {
  return { id: field, field, operator: "is", values };
}

export function filtersToClauses(filters: SearchFilters): FilterClause[] {
  const clauses: FilterClause[] = [];
  if (filters.spaceId) clauses.push(clause("space", [filters.spaceId]));
  if (!filters.includeDescendants) clauses.push(clause("children", ["children"]));
  if (filters.tagIds.length > 0) clauses.push(clause("tags", filters.tagIds));
  if (filters.due !== "any") clauses.push(clause("due", [filters.due]));
  if (filters.updated !== "any") clauses.push(clause("updated", [filters.updated]));
  return clauses;
}

/** The search filters a clause list describes; custom date bounds survive while their preset stays custom. */
export function clausesToFilters(clauses: readonly FilterClause[], current: SearchFilters): Partial<SearchFilters> {
  const values = (field: string) => clauses.filter(item => item.field === field).flatMap(item => item.values);
  const due = (values("due")[0] ?? "any") as DuePreset;
  const updated = (values("updated")[0] ?? "any") as UpdatedPreset;
  return {
    spaceId: values("space")[0] ?? "",
    includeDescendants: values("children").length === 0,
    tagIds: [...new Set(values("tags"))],
    due,
    dueFrom: due === "custom" ? current.dueFrom : "",
    dueTo: due === "custom" ? current.dueTo : "",
    updated,
    updatedFrom: updated === "custom" ? current.updatedFrom : "",
    updatedTo: updated === "custom" ? current.updatedTo : "",
  };
}
