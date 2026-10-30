import { createSignal, onCleanup, onMount } from "solid-js";
import { EntityDetailHost, createPageFilters, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem } from "@polterware/feature-shell";
import {
  FilterPopover,
  ActiveFilterBar,
  PageContent,
  PageToolbar,
  Plus,
  SearchBar,
  Tabs,
  ToolbarIconButton,
  type FilterField,
  type TabItem,
} from "@polterware/frontend-design-system";
import { isTypingTarget, matchesShortcut } from "@polterware/frontend-state";
import { RulesPanel, type CanonJustifyChange } from "./rules-panel";

/** Knowledge → Rules: the constraints agents read in their brief, each with the parts of the project it holds for. */
export function TruthRulesPage(props: {
  projectId: string;
  scopeNodes?: readonly string[];
  loadRules?: (projectId: string) => Promise<unknown>;
  tab: string;
  tabs: TabItem[];
  tabsLabel: string;
  onTabChange?: (tab: string) => void;
  justifyChange: CanonJustifyChange;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeCatalogNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [createToken, setCreateToken] = createSignal(0);

  // C opens the composer for a new rule, like the toolbar "+".
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTypingTarget(event.target) || !matchesShortcut("shell.create", event)) return;
      if (busy() || !props.projectId.trim()) return;
      event.preventDefault();
      setCreateToken((value) => value + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const fields = (): FilterField[] => [
  ];
  const filters = createPageFilters({
    surface: "truth.facts",
    fields,
    scope: {
      tokens: () => props.scopeTokens ?? [],
      nodes: () => props.scopeCatalogNodes ?? [],
      environments: () => props.scopeEnvironments ?? [],
      allowEnv: false,
      onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
    },
  });

  return (
    <EntityDetailHost>
      <PageToolbar.Root>
        <PageToolbar.Tabs>
          <Tabs
            items={[...props.tabs]}
            value={props.tab}
            onChange={(value) => props.onTabChange?.(value)}
            aria-label={props.tabsLabel}
          />
        </PageToolbar.Tabs>
        <PageToolbar.Actions>
          <SearchBar
            placeholder="Search rules"
            value={query()}
            onInput={setQuery}
            aria-label="Search rules"
          />
          <FilterPopover
            ariaLabel="Rule filters"
            title="Filter rules"
            shortcut
            fields={filters.fields()}
            clauses={filters.clauses()}
            onClausesChange={filters.onClausesChange}
            saved={filters.saved()}
          />
          <ToolbarIconButton
            label="New rule"
            disabled={busy() || !props.projectId.trim()}
            onClick={() => setCreateToken((value) => value + 1)}
          >
            <Plus size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <ActiveFilterBar
        fields={filters.fields()}
        clauses={filters.clauses()}
        onClausesChange={filters.onClausesChange}
        saved={filters.saved()}
      />
      {/* A Rule opens in the composer over the list, which stays in place. */}
      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <RulesPanel
          projectId={props.projectId}
          scopeNodes={props.scopeNodes}
          scopeCatalogNodes={props.scopeCatalogNodes}
          loadRules={props.loadRules}
          query={query()}
          clauses={filters.pageClauses()}
          createToken={createToken()}
          busy={busy()}
          justifyChange={props.justifyChange}
          onBusyChange={setBusy}
        />
      </PageContent>
    </EntityDetailHost>
  );
}
