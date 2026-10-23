import { Show, createMemo, createSignal } from "solid-js";
import {
  DataTable,
  FilterPopover,
  PageLoading,
  StatusChip,
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
import { SetupWizard } from "./setup-wizard";
import { cliStateLabel, cliStateTone, matchConnectedIntegrationId } from "./setup-wizard-helpers";
import {
  IntegrationsCatalogFilterEmpty,
  IntegrationsConnectedEmpty,
} from "./integrations-empty";

export { IntegrationInlineDetail } from "./integration-inline-detail";
export { SetupWizard } from "./setup-wizard";

function normalizeTab(value?: string): "connected" | "catalog" {
  return value === "catalog" ? "catalog" : "connected";
}

function integrationTone(status: WorkspaceIntegration["status"]): "healthy" | "danger" | "warn" | "muted" {
  if (status === "connected") return "healthy";
  if (status === "error") return "danger";
  if (status === "disabled") return "warn";
  return "muted";
}

/** Connected providers and the CLI catalog, laid out for the Settings dialog. */
export function IntegrationsView(props: {
  projectId?: string;
  providers?: WorkspaceCatalogProvider[];
  integrations?: WorkspaceIntegration[];
  resources?: WorkspaceIntegrationResource[];
  syncRuns?: WorkspaceIntegrationSyncRun[];
  tab?: string;
  loading?: boolean;
  onTabChange?: (tab: string) => void;
  onConnect?: (provider: WorkspaceCatalogProvider) => void;
  onSync?: (integrationId: string) => void;
}) {
  const tab = () => normalizeTab(props.tab);
  const [setupProvider, setSetupProvider] = createSignal<string | null>(null);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const [categories, setCategories] = createSignal<readonly string[]>([]);
  const [statusOverrides, setStatusOverrides] = createSignal<Record<string, WorkspaceIntegration["status"]>>({});

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
    <Show when={!props.loading} fallback={<PageLoading layout="table" label="Loading integrations…" />}>
      <Show
        when={setupProvider() === null}
        fallback={
          <SetupWizard
            projectId={props.projectId}
            providerName={setupProvider() ?? undefined}
            providers={props.providers ?? []}
            onBack={() => setSetupProvider(null)}
            onFinish={(provider) => {
              const integrationId = matchConnectedIntegrationId(provider.name, props.integrations ?? []);
              setSetupProvider(null);
              props.onConnect?.(provider);
              if (integrationId) {
                setStatusOverrides((current) => ({ ...current, [integrationId]: "connected" }));
                props.onTabChange?.("connected");
                setSelectedId(integrationId);
              }
            }}
          />
        }
      >
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
              onReconfigure={() => setSetupProvider(selectedIntegration()!.providerId)}
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
              <DataTable.Root rows={props.integrations ?? []} getRowId={(item) => item.id} columnWidthsKey="integrations">
                <DataTable.Table aria-label="Connected integrations">
                  <DataTable.Header>
                    <DataTable.ColumnHeader<WorkspaceIntegration> id="name">Integration</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceIntegration> id="status">Status</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceIntegration> id="environment">Environment</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceIntegration> id="lastSync">Last refresh</DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body<WorkspaceIntegration>>
                    {(integration) => {
                      const status = () => statusOverrides()[integration.id] ?? integration.status;
                      return (
                        <DataTable.Row row={integration} rowId={integration.id} onActivate={() => setSelectedId(integration.id)}>
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
                        </DataTable.Row>
                      );
                    }}
                  </DataTable.Body>
                </DataTable.Table>
              </DataTable.Root>
            </Show>
          </Show>

          <Show when={tab() === "catalog"}>
            <div class="mb-3 flex justify-end">
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
            </div>
            <Show when={catalog().length > 0} fallback={<IntegrationsCatalogFilterEmpty />}>
              <DataTable.Root rows={catalog()} getRowId={(item) => item.id} columnWidthsKey="integrations-catalog">
                <DataTable.Table aria-label="CLI integration catalog">
                  <DataTable.Header>
                    <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="name">Provider</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="category">Category</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="binary">CLI</DataTable.ColumnHeader>
                    <DataTable.ColumnHeader<WorkspaceCatalogProvider> id="state">State</DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body<WorkspaceCatalogProvider>>
                    {(provider) => (
                      <DataTable.Row row={provider} rowId={provider.id} onActivate={() => setSetupProvider(provider.id)} aria-label={`Open ${provider.name} CLI flow`}>
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
    </Show>
  );
}
