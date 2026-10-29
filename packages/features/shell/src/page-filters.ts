import { createMemo, createSignal, untrack } from "solid-js";
import {
  createSavedFilters,
  pushToast,
  sameClauses,
  type FilterClause,
  type FilterField,
  type SavedFilterRecord,
  type SavedFiltersApi,
} from "@polterware/frontend-design-system";
import { activeProjectId } from "@polterware/frontend-state";
import type { ScopeFilterEnvironment, ScopeFilterNode, ScopeFilterToken } from "./scope-filter";
import { clausesToScopeTokens, isScopeFieldId, scopeFilterFields, scopeTokensToClauses } from "./scope-filter-menu";

type CoreSavedFilters = {
  list: (payload: { projectId: string; surface: string }) => Promise<unknown>;
  save: (payload: { projectId: string; surface: string; name: string; payloadJson: string }) => Promise<unknown>;
  delete: (payload: { id: string }) => Promise<unknown>;
};

function coreSavedFilters(): CoreSavedFilters | undefined {
  const root = globalThis as { polterware?: { core?: { savedFilters?: CoreSavedFilters } } };
  return root.polterware?.core?.savedFilters;
}

function records(response: unknown): SavedFilterRecord[] {
  const filters = (response as { filters?: unknown } | undefined)?.filters;
  if (!Array.isArray(filters)) return [];
  return filters.flatMap((item): SavedFilterRecord[] => {
    const { id, name, payloadJson } = (item ?? {}) as Record<string, unknown>;
    return typeof id === "string" && typeof name === "string"
      ? [{ id, name, payloadJson: typeof payloadJson === "string" ? payloadJson : "{}" }]
      : [];
  });
}

/** Saved filters of one page in the Polterware store; an empty project id means an app-level page. */
export function polterwareSavedFiltersApi(projectId: string, surface: string): SavedFiltersApi | undefined {
  const core = coreSavedFilters();
  if (!core) return undefined;
  return {
    list: async () => records(await core.list({ projectId, surface })),
    save: (name, payloadJson) => core.save({ projectId, surface, name, payloadJson }),
    delete: (id) => core.delete({ id }),
  };
}

export type PageFilterScope = {
  tokens: () => readonly ScopeFilterToken[];
  nodes: () => readonly ScopeFilterNode[];
  environments: () => readonly ScopeFilterEnvironment[];
  allowEnv: boolean;
  onTokensChange: (tokens: ScopeFilterToken[]) => void;
};

export type PageFiltersOptions = {
  /** Saved filter surface id, for example `inbox` or `work.cards`. */
  surface: string;
  /** App-level page (Projects): its saved filters belong to no project. */
  appLevel?: boolean;
  /** Page-local fields. */
  fields: () => FilterField[];
  /** Shared scope selection, shown as scope fields before the page's own. */
  scope?: PageFilterScope;
};

/**
 * Filter state of one page: its own clauses, the shell-owned scope tokens as scope clauses,
 * and its saved filters in the store. Pass `fields`, `clauses`, `onClausesChange` and
 * `saved` to both `FilterPopover` and `ActiveFilterBar`; filter records with `pageClauses`.
 */
export function createPageFilters(options: PageFiltersOptions) {
  const [pageClauses, setPageClauses] = createSignal<FilterClause[]>([]);
  const scopeFields = createMemo(() =>
    options.scope
      ? scopeFilterFields({ nodes: options.scope.nodes(), environments: options.scope.environments(), allowEnv: options.scope.allowEnv })
      : [],
  );
  const fields = createMemo(() => [...scopeFields(), ...options.fields()]);
  const clauses = createMemo(() => [
    ...(options.scope ? scopeTokensToClauses(options.scope.tokens()) : []),
    ...pageClauses(),
  ]);

  const onClausesChange = (next: FilterClause[]) => {
    setPageClauses(next.filter((clause) => !isScopeFieldId(clause.field)));
    const scope = options.scope;
    if (!scope) return;
    const nextScope = next.filter((clause) => isScopeFieldId(clause.field));
    const current = scopeTokensToClauses(untrack(scope.tokens));
    if (!sameClauses(current, nextScope)) scope.onTokensChange(clausesToScopeTokens(nextScope, untrack(scopeFields)));
  };

  const api = createMemo(() => {
    const projectId = options.appLevel ? "" : activeProjectId();
    return options.appLevel || projectId ? polterwareSavedFiltersApi(projectId, options.surface) : undefined;
  });
  const saved = createSavedFilters({
    api,
    clauses,
    onApply: (applied) => onClausesChange(applied),
    onError: (message) => pushToast(`Saved filters failed: ${message}`, "danger"),
  });

  return {
    fields,
    clauses,
    pageClauses,
    onClausesChange,
    saved,
    clear: () => onClausesChange([]),
    /** Drops the page's own clauses and keeps the shared scope. */
    clearPage: () => setPageClauses([]),
  };
}

export type PageFilters = ReturnType<typeof createPageFilters>;
