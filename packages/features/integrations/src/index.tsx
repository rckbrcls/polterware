import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import {
  Button,
  DataTable,
  ActiveFilterBar,
  FilterPopover,
  FileText,
  PageContent,
  PageLoading,
  PageToolbar,
  Plug,
  SearchBar,
  StatusChip,
  Tabs,
  matchClauses,
  type FilterField,
} from "@polterware/frontend-design-system";
import { createPageFilters, type PageFilters } from "@polterware/feature-shell";
import {
  type WorkspaceCatalogProvider,
  type WorkspaceIntegration,
  type WorkspaceIntegrationResource,
  type WorkspaceIntegrationSyncRun,
} from "@polterware/feature-shell";
import { NodeIcon } from "@polterware/feature-architecture/icons";
import { IntegrationInlineDetail } from "./integration-inline-detail";
import { providerIconKey } from "./provider-icon";
import { ConnectProviderDialog } from "./connect-provider-dialog";
import { cliStateLabel, cliStateTone, matchConnectedIntegrationId } from "./setup-wizard-helpers";
import {
  IntegrationsCatalogFilterEmpty,
  IntegrationsConnectedEmpty,
} from "./integrations-empty";

export { IntegrationInlineDetail } from "./integration-inline-detail";
export { ConnectProviderDialog } from "./connect-provider-dialog";

function normalizeTab(value?: string): "connected" | "catalog" {
  if (value === "catalog") return value;
  return "connected";
}

function integrationTone(status: WorkspaceIntegration["status"]): "healthy" | "danger" | "warn" | "muted" {
  if (status === "connected") return "healthy";
  if (status === "error") return "danger";
  if (status === "disabled") return "warn";
  return "muted";
}

function toggleValue(current: readonly string[], value: string, checked: boolean): string[] {
  return checked ? [...current.filter((item) => item !== value), value] : current.filter((item) => item !== value);
}

/** One multi-select filter field over the distinct values a table has. */
function valueField(id: string, label: string, values: readonly { id: string; label: string }[]): FilterField {
  const unique = [...new Map(values.filter((value) => value.id).map((value) => [value.id, value])).values()];
  return { id, label, kind: "multi", options: unique.map((value) => ({ id: value.id, label: value.label })) };
}

/**
 * Connected providers and the CLI catalog. Embedded in Project settings, the settings rail picks
 * the tab, so the view drops its tab strip and page chrome and keeps only its search and filters.
 */
export function IntegrationsView(props: {
  embedded?: boolean;
  projectId?: string;
  providers?: WorkspaceCatalogProvider[];
  integrations?: WorkspaceIntegration[];
  resources?: WorkspaceIntegrationResource[];
  syncRuns?: WorkspaceIntegrationSyncRun[];
  tab?: string;
  loading?: boolean;
  onTabChange?: (tab: string) => void;
  connectOpen?: boolean;
  connectProviderId?: string;
  onOpenConnect?: (providerId?: string) => void;
  onCloseConnect?: () => void;
  onConnect?: (provider: WorkspaceCatalogProvider) => void;
  onSync?: (integrationId: string) => void;
}) {
  const tab = () => normalizeTab(props.tab);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const [connectedQuery, setConnectedQuery] = createSignal("");
  const [statusOverrides, setStatusOverrides] = createSignal<Record<string, WorkspaceIntegration["status"]>>({});
  const statusOf = (integration: WorkspaceIntegration) => statusOverrides()[integration.id] ?? integration.status;
  const catalogFilters = createPageFilters({
    surface: "platforms.catalog",
    fields: () => [
      valueField("category", "Category", (props.providers ?? []).map((provider) => ({ id: provider.category, label: provider.category }))),
      valueField("state", "State", (props.providers ?? []).map((provider) => ({ id: provider.state, label: cliStateLabel(provider.state) }))),
    ],
  });
  const connectedFilters = createPageFilters({
    surface: "platforms.connected",
    fields: () => [
      valueField("status", "Status", (props.integrations ?? []).map((integration) => ({ id: statusOf(integration), label: statusOf(integration) }))),
      valueField("environment", "Environment", (props.integrations ?? []).map((integration) => ({ id: integration.environment, label: integration.environment }))),
    ],
  });
  const tabFilters = (): PageFilters => (tab() === "catalog" ? catalogFilters : connectedFilters);

  createEffect(on(tab, (next) => {
    if (next === "catalog") setSelectedId(null);
  }, { defer: true }));

  const catalog = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return (props.providers ?? []).filter((provider) => {
      if (!matchClauses(provider, catalogFilters.pageClauses(), { category: (item) => item.category, state: (item) => item.state })) return false;
      if (!needle) return true;
      return [provider.name, provider.description, provider.category, provider.binary]
        .some((value) => value.toLowerCase().includes(needle));
    });
  });

  const connected = createMemo(() => {
    const needle = connectedQuery().trim().toLowerCase();
    return (props.integrations ?? []).filter((integration) => {
      const status = statusOf(integration);
      if (!matchClauses(integration, connectedFilters.pageClauses(), { status: () => status, environment: (item) => item.environment })) return false;
      if (!needle) return true;
      return [integration.name, integration.providerId, integration.environment, status]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  });

  const selectedIntegration = createMemo(() =>
    (props.integrations ?? []).find((integration) => integration.id === selectedId()),
  );

  // The settings panel is narrower than a page, so embedded tables use tighter columns and their own saved widths.
  const width = (page: string, settings: string) => (props.embedded ? settings : page);
  const minWidth = () => (props.embedded ? 160 : 240);
  const widthsKey = (key: string) => (props.embedded ? `${key}-settings` : key);

  const actions = () => (
    <>
      <Show when={tab() === "connected"}>
        <SearchBar placeholder="Search integrations…" aria-label="Search integrations" value={connectedQuery()} onInput={setConnectedQuery} />
        <FilterPopover
          ariaLabel="Connected integration filters"
          title="Filter integrations"
          shortcut={!props.embedded}
          fields={connectedFilters.fields()}
          clauses={connectedFilters.clauses()}
          onClausesChange={connectedFilters.onClausesChange}
          saved={connectedFilters.saved()}
        />
        <Button size="icon" variant="texture" textureTone="neutral" aria-label="Connect provider" onClick={() => props.onOpenConnect?.()}>
          <Plug size={14} aria-hidden />
        </Button>
      </Show>
      <Show when={tab() === "catalog"}>
        <SearchBar placeholder="Search providers…" aria-label="Search providers" value={query()} onInput={setQuery} />
        <FilterPopover
          ariaLabel="Integration catalog filters"
          title="Filter providers"
          shortcut={!props.embedded}
          fields={catalogFilters.fields()}
          clauses={catalogFilters.clauses()}
          onClausesChange={catalogFilters.onClausesChange}
          saved={catalogFilters.saved()}
        />
      </Show>
    </>
  );

  const filterBar = () => (
    <Show when={tab() === "catalog" || !selectedIntegration()}>
      <ActiveFilterBar
        fields={tabFilters().fields()}
        clauses={tabFilters().clauses()}
        onClausesChange={tabFilters().onClausesChange}
        saved={tabFilters().saved()}
      />
    </Show>
  );

  const body = () => (
    <Show when={!props.loading} fallback={<PageLoading layout="table" label="Loading integrations…" />}>
      <Show
        when={tab() !== "connected" || !selectedIntegration()}
        fallback={
          <IntegrationInlineDetail
            integration={selectedIntegration()!}
            providers={props.providers ?? []}
            resources={props.resources ?? []}
            syncRuns={props.syncRuns ?? []}
            status={statusOverrides()[selectedIntegration()!.id] ?? selectedIntegration()!.status}
            onBack={() => setSelectedId(null)}
            onReconfigure={() => props.onOpenConnect?.(selectedIntegration()!.providerId)}
            onSync={() => props.onSync?.(selectedIntegration()!.id)}
          />
        }
      >
        <Show when={tab() === "connected"}>
          <Show
            when={(props.integrations ?? []).length > 0}
            fallback={
              <IntegrationsConnectedEmpty
                onOpenCatalog={() => props.onTabChange?.("catalog")}
              />
            }
          >
            <Show when={connected().length > 0} fallback={<IntegrationsCatalogFilterEmpty />}>
            <DataTable.Root class="[&_.pw-data-table-scroll]:px-2" rows={connected()} getRowId={(item) => item.id} columnWidthsKey={widthsKey("integrations")}>
              <DataTable.Table aria-label="Connected integrations">
                <DataTable.Header>
                  <DataTable.ColumnHeader<WorkspaceIntegration> id="name" minWidth={minWidth()}>Integration</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceIntegration> id="status" width={width("8rem", "7.5rem")}>Status</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceIntegration> id="environment" width={width("10rem", "7rem")}>Environment</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceIntegration> id="lastSync" width={width("10rem", "7.5rem")}>Last refresh</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceIntegration> id="actions" width="3rem" sortable={false} resizable={false}><span class="sr-only">Actions</span></DataTable.ColumnHeader>
                </DataTable.Header>
                <DataTable.Body<WorkspaceIntegration>>
                  {(integration) => {
                    const status = () => statusOverrides()[integration.id] ?? integration.status;
                    return (
                      <DataTable.Row row={integration} rowId={integration.id} onActivate={() => props.onOpenConnect?.(integration.providerId)}>
                        <DataTable.PrimaryCell
                          icon={<NodeIcon name={providerIconKey(integration)} size={16} brand={false} />}
                          iconTone="integration"
                          iconBrand={[integration.name, providerIconKey(integration)]}
                          iconSeed={integration.id}
                          title={integration.name}
                        />
                        <DataTable.Cell><StatusChip tone={integrationTone(status())} label={status()} /></DataTable.Cell>
                        <DataTable.Cell>{integration.environment}</DataTable.Cell>
                        <DataTable.Cell class="text-[var(--color-text-muted)]">{integration.lastSync}</DataTable.Cell>
                        <DataTable.Cell>
                          <Button size="icon" variant="ghost" aria-label={`View ${integration.name} metadata`} onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(integration.id);
                          }}>
                            <FileText size={14} aria-hidden />
                          </Button>
                        </DataTable.Cell>
                      </DataTable.Row>
                    );
                  }}
                </DataTable.Body>
              </DataTable.Table>
            </DataTable.Root>
            </Show>
          </Show>
        </Show>

        <Show when={tab() === "catalog"}>
          <Show when={catalog().length > 0} fallback={<IntegrationsCatalogFilterEmpty />}>
            <DataTable.Root class="[&_.pw-data-table-scroll]:px-2" rows={catalog()} getRowId={(item) => item.id} columnWidthsKey={widthsKey("integrations-catalog")}>
              <DataTable.Table aria-label="CLI integration catalog">
                <DataTable.Header>
                  <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="name" width={width("18rem", "11rem")} minWidth={minWidth()}>Provider</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="category" width="9rem">Category</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="binary">CLI</DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="state" width={width("9rem", "7rem")}>State</DataTable.ColumnHeader>
                </DataTable.Header>
                <DataTable.Body<WorkspaceCatalogProvider>>
                  {(provider) => (
                    <DataTable.Row row={provider} rowId={provider.id} onActivate={() => props.onOpenConnect?.(provider.id)} aria-label={`Open ${provider.name} CLI flow`}>
                      <DataTable.PrimaryCell
                        icon={<NodeIcon name={providerIconKey(provider)} size={16} brand={false} />}
                        iconTone="integration"
                        iconBrand={[provider.name, providerIconKey(provider)]}
                        iconSeed={provider.id}
                        title={provider.name}
                      />
                      <DataTable.Cell>{provider.category}</DataTable.Cell>
                      <DataTable.Cell><code>{provider.authCommands.join(" / ")}</code></DataTable.Cell>
                      <DataTable.Cell><StatusChip tone={cliStateTone(provider.state)} label={cliStateLabel(provider.state)} /></DataTable.Cell>
                    </DataTable.Row>
                  )}
                </DataTable.Body>
              </DataTable.Table>
            </DataTable.Root>
          </Show>
        </Show>
      </Show>
    </Show>
  );

  return (
    <>
      <Show when={tab() === "catalog" || !selectedIntegration()}>
        <Show
          when={!props.embedded}
          fallback={<><div class="flex items-center justify-end gap-2">{actions()}</div>{filterBar()}</>}
        >
          <PageToolbar.Root>
            <PageToolbar.Tabs>
              <Tabs
                items={[
                  { id: "connected", label: "Connected" },
                  { id: "catalog", label: "Catalog" },
                ]}
                value={tab()}
                onChange={(value) => props.onTabChange?.(value)}
                aria-label="Integrations"
              />
            </PageToolbar.Tabs>
            <PageToolbar.Actions>{actions()}</PageToolbar.Actions>
          </PageToolbar.Root>
          {filterBar()}
        </Show>
      </Show>
      <Show
        when={!props.embedded}
        fallback={<div class="flex min-w-0 flex-col gap-4">{body()}</div>}
      >
        <PageContent class={`flex min-h-0 flex-1 flex-col gap-4 overflow-auto ${tab() === "connected" && selectedIntegration() ? "p-4" : "p-0"}`}>
          {body()}
        </PageContent>
      </Show>
      <ConnectProviderDialog
        open={props.connectOpen ?? false}
        projectId={props.projectId}
        providerName={props.connectProviderId}
        providers={props.providers ?? []}
        onClose={() => props.onCloseConnect?.()}
        onFinish={(provider) => {
          const integrationId = matchConnectedIntegrationId(provider.name, props.integrations ?? []);
          props.onCloseConnect?.();
          props.onConnect?.(provider);
          if (integrationId) {
            setStatusOverrides((current) => ({ ...current, [integrationId]: "connected" }));
          }
        }}
      />
    </>
  );
}
