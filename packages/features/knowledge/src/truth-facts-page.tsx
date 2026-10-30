import { createSignal, onCleanup, onMount } from "solid-js";
import { EntityDetailHost, createPageFilters, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem, type WorkspaceCanonEntity } from "@polterware/feature-shell";
import {
  FilterPopover,
  ActiveFilterBar,
  PageContent,
  PageToolbar,
  Plus,
  SearchBar,
  StatusDot,
  Tabs,
  ToolbarIconButton,
  type FilterField,
  type TabItem,
} from "@polterware/frontend-design-system";
import { isTypingTarget, matchesShortcut } from "@polterware/frontend-state";
import { CanonFactsPanel, type CanonJustifyChange } from "./canon-facts-panel";
import { FACT_KINDS } from "./fact-kind";

/** Truth → Facts: statements about the project with their subject, scope, and evidence. */
export function TruthFactsPage(props: {
  projectId: string;
  scopeNodes?: readonly string[];
  loadFacts?: (projectId: string) => Promise<unknown>;
  loadEvidence?: (projectId: string) => Promise<unknown>;
  tab: string;
  tabs: TabItem[];
  tabsLabel: string;
  onTabChange?: (tab: string) => void;
  justifyChange: CanonJustifyChange;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeCatalogNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
  /** Canon entities, to name and pick a Fact's subject. */
  entities?: readonly WorkspaceCanonEntity[];
}) {
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [createToken, setCreateToken] = createSignal(0);

  // C opens the composer for a new fact, like the toolbar "+".
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
    {
      id: "kind",
      label: "Kind",
      kind: "multi",
      icon: () => <StatusDot tone="ok" showLabel={false} />,
      options: FACT_KINDS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: () => <StatusDot tone={option.tone} showLabel={false} />,
      })),
    },
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
            placeholder="Search facts"
            value={query()}
            onInput={setQuery}
            aria-label="Search facts"
          />
          <FilterPopover
            ariaLabel="Fact filters"
            title="Filter facts"
            shortcut
            fields={filters.fields()}
            clauses={filters.clauses()}
            onClausesChange={filters.onClausesChange}
            saved={filters.saved()}
          />
          <ToolbarIconButton
            label="New fact"
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
      {/* A Fact opens in a dialog over the list, which stays in place. */}
      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <CanonFactsPanel
          projectId={props.projectId}
          scopeNodes={props.scopeNodes}
          entities={props.entities}
          scopeCatalogNodes={props.scopeCatalogNodes}
          loadFacts={props.loadFacts}
          loadEvidence={props.loadEvidence}
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
