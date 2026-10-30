import { Box, Cloud, Layers, type FilterClause, type FilterField, type PropertyOption } from "@polterware/frontend-design-system";
import type { ScopeFilterEnvironment, ScopeFilterKey, ScopeFilterNode, ScopeFilterToken } from "./scope-filter";
import { dedupeScopeTokens } from "./scope-filter";
import { scopeFilterMenuSections } from "./scope-filter-menu-state";

function ScopeIcon(props: { kind: ScopeFilterKey }) {
  const Icon = props.kind === "domain" ? Layers : props.kind === "component" ? Box : Cloud;
  return <Icon size={14} aria-hidden />;
}

const SCOPE_FIELD_PREFIX = "scope-";

export function isScopeFieldId(fieldId: string): boolean {
  return fieldId.startsWith(SCOPE_FIELD_PREFIX);
}

/**
 * Scope levels as filter fields. Backend reads take scope as one inclusion-only union, so
 * these fields offer no `is not` and keep one pill per level.
 */
export function scopeFilterFields(props: {
  nodes: readonly ScopeFilterNode[];
  environments: readonly ScopeFilterEnvironment[];
  allowEnv: boolean;
}): FilterField[] {
  return scopeFilterMenuSections(props).map((section) => ({
    id: `${SCOPE_FIELD_PREFIX}${section.key}`,
    label: section.label,
    icon: () => <ScopeIcon kind={section.key} />,
    kind: "multi",
    negatable: false,
    repeatable: false,
    section: "scope",
    options: section.options.map((option) => ({
      id: option.id,
      label: option.label,
      icon: () => <ScopeIcon kind={section.key} />,
    })),
  }));
}

/**
 * The Structure nodes as context options for a `TokenPicker`: the scope filter menu's
 * groups in its order (domains, then components) with the same icons, and
 * the node id as the value. A title two nodes share shows its path instead.
 */
export function scopeContextOptions(nodes: readonly (ScopeFilterNode & { path?: string })[]): PropertyOption[] {
  const titles = new Map<string, number>();
  for (const node of nodes) titles.set(node.title, (titles.get(node.title) ?? 0) + 1);
  return scopeFilterMenuSections({ nodes, environments: [], allowEnv: false }).flatMap((section) =>
    section.options.map((option) => {
      const node = nodes.find((item) => item.id === option.id);
      const label = (titles.get(option.label) ?? 0) > 1 && node?.path ? node.path : option.label;
      return { value: option.id, label, icon: <ScopeIcon kind={section.key} /> };
    }),
  );
}

/** One clause per scope level, holding that level's tokens. */
export function scopeTokensToClauses(tokens: readonly ScopeFilterToken[]): FilterClause[] {
  const byKey = new Map<ScopeFilterKey, string[]>();
  for (const token of tokens) byKey.set(token.key, [...(byKey.get(token.key) ?? []), token.id]);
  return [...byKey].map(([key, ids]) => ({ id: `${SCOPE_FIELD_PREFIX}${key}`, field: `${SCOPE_FIELD_PREFIX}${key}`, operator: "is", values: ids }));
}

/** Scope clauses back to tokens; labels come from the fields so tokens keep their display value. */
export function clausesToScopeTokens(clauses: readonly FilterClause[], fields: readonly FilterField[]): ScopeFilterToken[] {
  const tokens: ScopeFilterToken[] = [];
  for (const clause of clauses) {
    if (!isScopeFieldId(clause.field)) continue;
    const key = clause.field.slice(SCOPE_FIELD_PREFIX.length) as ScopeFilterKey;
    const field = fields.find((item) => item.id === clause.field);
    for (const id of clause.values) {
      tokens.push({ key, id, value: field?.options.find((option) => option.id === id)?.label ?? id });
    }
  }
  return dedupeScopeTokens(tokens);
}
