import { createSignal } from "solid-js";
import { EntityDetailHost, scopeFilterMenuGroups, scopeFilterPills, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem } from "@polterware/feature-shell";
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
  type FilterPopoverGroup,
  type TabItem,
} from "@polterware/frontend-design-system";
import { CanonFactsPanel, type CanonJustifyChange } from "./canon-facts-panel";

const TRUTH_CLASSES = [
  { id: "declared", label: "Declared", tone: "syncing" },
  { id: "observed", label: "Observed", tone: "ok" },
  { id: "inferred", label: "Inferred", tone: "warn" },
  { id: "verified", label: "Verified", tone: "ok" },
] as const;

/** Truth → Facts: Canon facts and their evidence. */
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
}) {
  const [query, setQuery] = createSignal("");
  const [truthClasses, setTruthClasses] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [createToken, setCreateToken] = createSignal(0);

  const groups = (): FilterPopoverGroup[] => [
    {
      id: "truth",
      label: "Truth",
      leading: <StatusDot tone="ok" showLabel={false} />,
      options: TRUTH_CLASSES.map((option) => ({
        id: option.id,
        label: option.label,
        leading: <StatusDot tone={option.tone} showLabel={false} />,
        checked: truthClasses().includes(option.id),
        onCheckedChange: (checked: boolean) =>
          setTruthClasses((current) =>
            checked ? [...current.filter((id) => id !== option.id), option.id] : current.filter((id) => id !== option.id),
          ),
      })),
    },
  ];

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
            active={truthClasses().length > 0 || (props.scopeTokens?.length ?? 0) > 0}
            onClear={() => {
              setTruthClasses([]);
              props.onScopeTokensChange?.([]);
            }}
            groups={[
              ...scopeFilterMenuGroups({
                tokens: props.scopeTokens ?? [],
                nodes: props.scopeCatalogNodes ?? [],
                environments: props.scopeEnvironments ?? [],
                allowEnv: false,
                onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
              }),
              ...groups(),
            ]}
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
        items={scopeFilterPills(props.scopeTokens ?? [], (tokens) => props.onScopeTokensChange?.(tokens))}
        onClear={() => props.onScopeTokensChange?.([])}
      />
      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <CanonFactsPanel
          projectId={props.projectId}
          scopeNodes={props.scopeNodes}
          loadFacts={props.loadFacts}
          loadEvidence={props.loadEvidence}
          query={query()}
          truthClasses={truthClasses()}
          createToken={createToken()}
          busy={busy()}
          justifyChange={props.justifyChange}
          onBusyChange={setBusy}
        />
      </PageContent>
    </EntityDetailHost>
  );
}
