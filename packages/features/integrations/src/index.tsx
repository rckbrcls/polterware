import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import {
  Button,
  DataTable,
  FilterPopover,
  FileText,
  PageContent,
  PageLoading,
  PageToolbar,
  Plug,
  StatusChip,
  Tabs,
} from "@polterware/frontend-design-system";
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

/** Connected providers and the CLI catalog as tabs of one Desktop route. */
export function IntegrationsView(props: {
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
  const [categories, setCategories] = createSignal<readonly string[]>([]);
  const [statusOverrides, setStatusOverrides] = createSignal<Record<string, WorkspaceIntegration["status"]>>({});

  createEffect(on(tab, (next) => {
    if (next === "catalog") setSelectedId(null);
  }, { defer: true }));

  const catalog = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return (props.providers ?? []).filter((provider) => {
      if (categories().length > 0 && !categories().includes(provider.category)) return false;
      if (!needle) return true;
      return [provider.name, provider.description, provider.category, provider.binary]
        .some((value) => value.toLowerCase().includes(needle));
    });
  });

  const selectedIntegration = createMemo(() =>
    (props.integrations ?? []).find((integration) => integration.id === selectedId()),
  );

  return (
    <>
      <Show when={tab() === "catalog" || !selectedIntegration()}>
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
          <PageToolbar.Actions>
            <Show when={tab() === "connected"}>
              <Button size="icon" variant="texture" textureTone="neutral" aria-label="Connect provider" onClick={() => props.onOpenConnect?.()}>
                <Plug size={14} aria-hidden />
              </Button>
            </Show>
            <Show when={tab() === "catalog"}>
              <FilterPopover
                ariaLabel="Integration catalog filters"
                title="Provider category"
                search={{ placeholder: "Search providers…", value: query(), onInput: setQuery }}
                active={categories().length > 0}
                onClear={() => setCategories([])}
                groups={[{
                  id: "category",
                  label: "Category",
                  options: [...new Set((props.providers ?? []).map((provider) => provider.category))].map((category) => ({
                    id: category,
                    label: category,
                    checked: categories().includes(category),
                    onCheckedChange: (checked: boolean) => setCategories((current) =>
                      checked ? [...current, category] : current.filter((value) => value !== category),
                    ),
                  })),
                }]}
              />
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>
      </Show>
      <PageContent class={`flex min-h-0 flex-1 flex-col gap-4 overflow-auto ${tab() === "connected" && selectedIntegration() ? "p-4" : "p-0"}`}>
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
                <DataTable.Root class="[&_.pw-data-table-scroll]:px-2" rows={props.integrations ?? []} getRowId={(item) => item.id} columnWidthsKey="integrations">
                  <DataTable.Table aria-label="Connected integrations">
                    <DataTable.Header>
                      <DataTable.ColumnHeader<WorkspaceIntegration> id="name" minWidth={240}>Integration</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceIntegration> id="status" width="8rem">Status</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceIntegration> id="environment" width="10rem">Environment</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceIntegration> id="lastSync" width="10rem">Last refresh</DataTable.ColumnHeader>
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

            <Show when={tab() === "catalog"}>
              <Show when={catalog().length > 0} fallback={<IntegrationsCatalogFilterEmpty />}>
                <DataTable.Root class="[&_.pw-data-table-scroll]:px-2" rows={catalog()} getRowId={(item) => item.id} columnWidthsKey="integrations-catalog">
                  <DataTable.Table aria-label="CLI integration catalog">
                    <DataTable.Header>
                      <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="name" width="18rem" minWidth={240}>Provider</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="category" width="9rem">Category</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="binary">CLI</DataTable.ColumnHeader>
                      <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="state" width="9rem">State</DataTable.ColumnHeader>
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
                          <DataTable.Cell><code>{provider.authCommands.join(" · ")}</code></DataTable.Cell>
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
      </PageContent>
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
