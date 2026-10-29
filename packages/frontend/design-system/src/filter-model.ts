import type { JSX } from "solid-js";

/**
 * Linear-style filter model shared by `FilterPopover` and `ActiveFilterBar`.
 * A page declares its filter fields once and keeps a list of clauses; each clause is one
 * pill (field, operator, values) and clauses combine with AND. The same field may repeat
 * unless the field says otherwise.
 */

/** `multi`: checkbox list. `single`: one value, picked with a check mark. `boolean`: one option, added directly. */
export type FilterFieldKind = "multi" | "single" | "boolean";

/** Renders a fresh icon: the same option can show in a menu and a pill at once, and a DOM node cannot. */
export type FilterIcon = () => JSX.Element;

export type FilterFieldOption = {
  id: string;
  label: string;
  icon?: FilterIcon;
  /** Muted trailing text, such as a count. */
  trailing?: string;
  disabled?: boolean;
};

export type FilterOperatorDef = { id: string; label: string };

export type FilterField = {
  id: string;
  label: string;
  icon?: FilterIcon;
  /** Plural noun for the value summary ("3 statuses"); derived from the label when absent. */
  pluralLabel?: string;
  kind: FilterFieldKind;
  /** A `boolean` field has exactly one option, shown in the root menu by its label. */
  options: readonly FilterFieldOption[];
  /** Root menu row of a `boolean` field; defaults to its option's label. */
  menuLabel?: string;
  /** Operators other than is / is not (for example before / after, or has / has no with the is / is not ids); the first is the default. */
  operators?: readonly FilterOperatorDef[];
  /** Offer `is not`. Default true; fields filtered by inclusion-only reads turn it off. */
  negatable?: boolean;
  /** Each add creates a new pill. Default true; when false new values merge into the field's pill. */
  repeatable?: boolean;
  /** Root menu section; a divider separates sections. */
  section?: string;
};

export type FilterClause = {
  id: string;
  field: string;
  operator: string;
  values: readonly string[];
};

export const FILTER_IS = "is";
export const FILTER_IS_NOT = "is_not";

/** Saved filter as the UI reads it back from the store. */
export type SavedFilter = {
  id: string;
  name: string;
  clauses: readonly FilterClause[];
  extra?: Record<string, unknown>;
};

export type SavedFiltersController = {
  items: readonly SavedFilter[];
  onApply: (filter: SavedFilter) => void;
  onSave?: (name: string) => void | Promise<void>;
  onDelete?: (filter: SavedFilter) => void;
};

export type FilterPayload = {
  version: 1;
  clauses: FilterClause[];
  extra?: Record<string, unknown>;
};

let clauseCounter = 0;

export function createClauseId(): string {
  clauseCounter += 1;
  return `clause-${Date.now().toString(36)}-${clauseCounter}`;
}

/** Operators offered on a pill for the clause's current value count. */
export function filterOperators(field: FilterField, valueCount: number): FilterOperatorDef[] {
  if (field.operators && field.operators.length > 0) return [...field.operators];
  const positive = {
    id: FILTER_IS,
    label: field.kind === "multi" && valueCount > 1 ? "is any of" : "is",
  };
  return field.negatable === false ? [positive] : [positive, { id: FILTER_IS_NOT, label: "is not" }];
}

export function defaultOperator(field: FilterField): string {
  return field.operators?.[0]?.id ?? FILTER_IS;
}

export function operatorLabel(field: FilterField, clause: FilterClause): string {
  const operators = filterOperators(field, clause.values.length);
  return operators.find((operator) => operator.id === clause.operator)?.label ?? clause.operator;
}

/** English plural for a field noun: Status → statuses, Category → categories, Tag → tags. */
export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

export function clauseOptions(field: FilterField, clause: FilterClause): FilterFieldOption[] {
  return clause.values
    .map((value) => field.options.find((option) => option.id === value))
    .filter((option): option is FilterFieldOption => Boolean(option));
}

/** "Planned" for one value, "3 statuses" for several. */
export function valueSummary(field: FilterField, clause: FilterClause): string {
  const options = clauseOptions(field, clause);
  if (clause.values.length === 1) return options[0]?.label ?? clause.values[0] ?? "";
  return `${clause.values.length} ${field.pluralLabel ?? pluralize(field.label)}`;
}

/**
 * Adds values for a field: a new clause, or a merge into the field's clause when the field
 * is not repeatable. Returns the next list and the id of the clause that holds the values.
 */
export function addClause(
  clauses: readonly FilterClause[],
  field: FilterField,
  values: readonly string[],
): { clauses: FilterClause[]; id: string } {
  const existing = field.repeatable === false ? clauses.find((clause) => clause.field === field.id) : undefined;
  if (existing) {
    const merged =
      field.kind === "multi" ? [...new Set([...existing.values, ...values])] : values.slice(0, 1);
    return { clauses: setClauseValues(clauses, existing.id, merged), id: existing.id };
  }
  const id = createClauseId();
  const next: FilterClause = {
    id,
    field: field.id,
    operator: defaultOperator(field),
    values: field.kind === "multi" ? [...values] : values.slice(0, 1),
  };
  return { clauses: [...clauses, next], id };
}

/** Replaces a clause's values; an empty list removes the clause. */
export function setClauseValues(
  clauses: readonly FilterClause[],
  id: string,
  values: readonly string[],
): FilterClause[] {
  if (values.length === 0) return removeClause(clauses, id);
  return clauses.map((clause) => (clause.id === id ? { ...clause, values: [...values] } : clause));
}

export function toggleClauseValue(
  clauses: readonly FilterClause[],
  id: string,
  field: FilterField,
  value: string,
  checked: boolean,
): FilterClause[] {
  const clause = clauses.find((item) => item.id === id);
  if (!clause) return [...clauses];
  if (field.kind !== "multi") return setClauseValues(clauses, id, checked ? [value] : []);
  const values = checked
    ? clause.values.includes(value)
      ? clause.values
      : [...clause.values, value]
    : clause.values.filter((item) => item !== value);
  return setClauseValues(clauses, id, values);
}

export function setClauseOperator(
  clauses: readonly FilterClause[],
  id: string,
  operator: string,
): FilterClause[] {
  return clauses.map((clause) => (clause.id === id ? { ...clause, operator } : clause));
}

export function removeClause(clauses: readonly FilterClause[], id: string): FilterClause[] {
  return clauses.filter((clause) => clause.id !== id);
}

/** A record's value for one field: its option ids, one id, or a flag for boolean fields. */
export type FilterFieldValue = readonly string[] | string | boolean | null | undefined;
export type FilterAccessors<T> = Record<string, (item: T) => FilterFieldValue>;
/** Custom operator test: the record's values against the clause's values. */
export type FilterMatcher = (itemValues: readonly string[], clauseValues: readonly string[]) => boolean;

function itemValues(value: FilterFieldValue, clause: FilterClause): readonly string[] {
  if (typeof value === "boolean") return value ? clause.values : [];
  if (typeof value === "string") return [value];
  return value ?? [];
}

/**
 * AND across clauses. `is` keeps records holding any clause value; `is not` keeps records
 * holding none. Clauses whose field has no accessor are skipped, so a page can leave fields
 * that are applied elsewhere (such as backend scope) out of the accessors.
 */
export function matchClauses<T>(
  item: T,
  clauses: readonly FilterClause[],
  accessors: FilterAccessors<T>,
  matchers: Record<string, FilterMatcher> = {},
): boolean {
  return clauses.every((clause) => {
    const accessor = accessors[clause.field];
    if (!accessor) return true;
    const values = itemValues(accessor(item), clause);
    const custom = matchers[clause.operator];
    if (custom) return custom(values, clause.values);
    const hit = values.some((value) => clause.values.includes(value));
    return clause.operator === FILTER_IS_NOT ? !hit : hit;
  });
}

/** The clauses of one field, for pages that apply a field outside `matchClauses`. */
export function clausesFor(clauses: readonly FilterClause[], fieldId: string): FilterClause[] {
  return clauses.filter((clause) => clause.field === fieldId);
}

function clauseKey(clause: FilterClause): string {
  return `${clause.field}\u0000${clause.operator}\u0000${[...clause.values].sort().join("\u0001")}`;
}

/** Same filter regardless of clause ids and order. */
export function sameClauses(a: readonly FilterClause[], b: readonly FilterClause[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(clauseKey).sort();
  const right = b.map(clauseKey).sort();
  return left.every((key, index) => key === right[index]);
}

export function serializeFilterPayload(
  clauses: readonly FilterClause[],
  extra?: Record<string, unknown>,
): string {
  const payload: FilterPayload = {
    version: 1,
    clauses: clauses.map(({ field, operator, values }) => ({ id: "", field, operator, values: [...values] })),
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  };
  return JSON.stringify(payload);
}

/** Reads a stored payload; malformed clauses are dropped and every clause gets a fresh id. */
export function parseFilterPayload(json: string): { clauses: FilterClause[]; extra?: Record<string, unknown> } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { clauses: [] };
  }
  if (!raw || typeof raw !== "object") return { clauses: [] };
  const record = raw as { clauses?: unknown; extra?: unknown };
  const clauses = Array.isArray(record.clauses)
    ? record.clauses.flatMap((item): FilterClause[] => {
        if (!item || typeof item !== "object") return [];
        const { field, operator, values } = item as Record<string, unknown>;
        if (typeof field !== "string" || typeof operator !== "string" || !Array.isArray(values)) return [];
        const strings = values.filter((value): value is string => typeof value === "string");
        return strings.length > 0 ? [{ id: createClauseId(), field, operator, values: strings }] : [];
      })
    : [];
  const extra =
    record.extra && typeof record.extra === "object" && !Array.isArray(record.extra)
      ? (record.extra as Record<string, unknown>)
      : undefined;
  return extra ? { clauses, extra } : { clauses };
}
