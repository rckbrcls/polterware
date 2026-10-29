import { For, Show, createMemo } from "solid-js";
import {
  Button,
  Card,
  DataTable,
  Plug,
  RefreshCw,
  StatusChip,
} from "@polterware/frontend-design-system";
import type {
  WorkspaceCatalogProvider,
  WorkspaceIntegration,
  WorkspaceIntegrationResource,
  WorkspaceIntegrationSyncRun,
} from "@polterware/feature-shell";
import { NodeIcon } from "@polterware/feature-architecture/icons";
import { providerIconKey } from "./provider-icon";

function syncTone(result: WorkspaceIntegrationSyncRun["result"]): "healthy" | "warn" | "danger" | "syncing" {
  if (result === "success") return "healthy";
  if (result === "partial") return "warn";
  if (result === "failed") return "danger";
  return "syncing";
}

function Section(props: { title: string; children: import("solid-js").JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <h3 class="m-0 px-1 text-[12px] font-medium text-[var(--color-text-muted)]">{props.title}</h3>
      <Card class="flex flex-col gap-3 !p-4">{props.children}</Card>
    </section>
  );
}

/**
 * One connected integration, reusing the connection controls, imported resources,
 * and sync history on the Connected page.
 */
export function IntegrationInlineDetail(props: {
  integration: WorkspaceIntegration;
  providers?: WorkspaceCatalogProvider[];
  resources?: WorkspaceIntegrationResource[];
  syncRuns?: WorkspaceIntegrationSyncRun[];
  status?: WorkspaceIntegration["status"];
  onBack: () => void;
  onSync?: () => void;
  onReconfigure?: () => void;
}) {
  const resources = createMemo(() => (props.resources ?? []).filter(
    (resource) => resource.integrationId === props.integration.id,
  ));
  const syncRuns = createMemo(() => (props.syncRuns ?? []).filter(
    (run) => run.integrationId === props.integration.id,
  ));
  const provider = createMemo(() => (props.providers ?? []).find(
    (item) => item.id === props.integration.providerId,
  ));

  return (
    <div class="flex flex-col gap-6 text-[12.5px]">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => props.onBack()}>
            Back
          </Button>
          <NodeIcon name={providerIconKey(props.integration)} size={16} brand={false} />
          <span class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {props.integration.name}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => props.onSync?.()}>
            <RefreshCw size={14} aria-hidden /> Refresh metadata
          </Button>
          <Button size="sm" variant="ghost" onClick={() => props.onReconfigure?.()}>
            <Plug size={14} aria-hidden /> Open CLI flow
          </Button>
        </div>
      </div>

      <Section title="Connection">
        <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
          <dt class="text-[var(--color-text-muted)]">Status</dt>
          <dd class="m-0">{props.status ?? props.integration.status}</dd>
          <dt class="text-[var(--color-text-muted)]">Connection</dt>
          <dd class="m-0">{props.integration.connectionLabel}</dd>
          <dt class="text-[var(--color-text-muted)]">Environment</dt>
          <dd class="m-0">{props.integration.environment}</dd>
          <dt class="text-[var(--color-text-muted)]">Last sync</dt>
          <dd class="m-0">{props.integration.lastSync}</dd>
          <Show when={provider()}>
            {(item) => (
              <>
                <dt class="text-[var(--color-text-muted)]">Provider</dt>
                <dd class="m-0">{item().name}</dd>
              </>
            )}
          </Show>
        </dl>
        <Show when={props.integration.summary}>
          <p class="m-0 text-[var(--color-text-secondary)]">{props.integration.summary}</p>
        </Show>
      </Section>

      <Section title="Imported resources">
        <Show
          when={resources().length > 0}
          fallback={
            <p class="m-0 text-[var(--color-text-muted)]">
              No imported resources yet. Refresh metadata imports a bounded list from the local CLI; link them to components in the Structure.
            </p>
          }
        >
          <DataTable.Root rows={resources()} getRowId={(item) => item.id}>
            <DataTable.Table aria-label={`${props.integration.name} resources`}>
              <DataTable.Header>
                <DataTable.ColumnHeader<WorkspaceIntegrationResource> id="name">Resource</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceIntegrationResource> id="kind">Kind</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceIntegrationResource> id="environment">Environment</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceIntegrationResource> id="status">Status</DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<WorkspaceIntegrationResource>>
                {(resource) => (
                  <DataTable.Row row={resource} rowId={resource.id}>
                    <DataTable.PrimaryCell icon={<Plug size={16} />} iconTone="integration" iconSeed={resource.id} title={resource.name} />
                    <DataTable.Cell>{resource.kind}</DataTable.Cell>
                    <DataTable.Cell>{resource.environment}</DataTable.Cell>
                    <DataTable.Cell><StatusChip tone="healthy" label={resource.status} /></DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </Show>
      </Section>

      <Section title="Sync history">
        <Show
          when={syncRuns().length > 0}
          fallback={
            <p class="m-0 text-[var(--color-text-muted)]">
              No sync runs yet. Refresh metadata pulls inventory through the authenticated local CLI.
            </p>
          }
        >
          <div class="flex flex-col gap-3">
            <For each={syncRuns()}>
              {(run) => (
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="m-0 text-[13px]">{run.message}</p>
                    <p class="m-0 mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {run.startedAt} · {run.imported} items
                    </p>
                  </div>
                  <StatusChip tone={syncTone(run.result)} label={run.result} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </Section>
    </div>
  );
}
