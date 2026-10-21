import { For, Show, createEffect, createMemo, onCleanup, untrack } from "solid-js";
import {
  Bot,
  DataTable,
  DetailPanel,
  PageEmpty,
  Skeleton,
  StatusChip,
  User,
  FileText,
  History,
  Settings,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import type {
  AgentRunDetail,
  ChangeEnvelopeView,
  ProjectChangeRow,
} from "./agents-types";
import {
  driftFindingSeverityTone,
  parseDriftStepPayload,
} from "./drift-step-payload";

export type ChangeActorFilter = "all" | "human" | "agent";

const HISTORY_SCOPE = "agents:history";

function actorTone(actorKind: string) {
  return actorKind === "human" ? "syncing" : "muted";
}

function runTone(status: string) {
  return status === "completed" ? "ok" : "warn";
}

function ActorIcon(props: { actorKind: string; size?: number }) {
  return (
    <Show when={props.actorKind === "human"} fallback={<Bot size={props.size ?? 14} />}>
      <User size={props.size ?? 14} />
    </Show>
  );
}

/** Unified Change History feed (B9): human + agent justified mutations, detail in the page panel. */
export function AgentRunHistoryCard(props: {
  changes: ProjectChangeRow[];
  selectedStepId: string;
  detail: AgentRunDetail | undefined;
  busy: boolean;
  onSelect: (stepId: string, agentRunId: string) => void;
  onClear: () => void;
}) {
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  createEffect(() => {
    const targets = props.changes.map((change) => ({
      scopeId: HISTORY_SCOPE,
      entityId: change.stepId,
      entityKind: "change",
    }));
    detailPanelStore.getState().registerCollection({
      scopeId: HISTORY_SCOPE,
      status: props.busy && props.changes.length === 0 ? "loading" : "ready",
      targets,
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(HISTORY_SCOPE));

  // The panel store owns selection; mirror it into the page so it loads the run.
  createEffect(() => {
    const target = activeTarget();
    const stepId = target?.scopeId === HISTORY_SCOPE ? target.entityId : "";
    if (stepId === untrack(() => props.selectedStepId)) return;
    const change = untrack(() => props.changes).find((row) => row.stepId === stepId);
    if (change) props.onSelect(change.stepId, change.agentRunId);
    else props.onClear();
  });

  const selectedChange = createMemo(() =>
    props.changes.find((change) => change.stepId === props.selectedStepId),
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-auto">
        <DataTable.Root rows={props.changes} getRowId={(change) => change.stepId}>
          <DataTable.Table aria-label="Unified change history">
            <DataTable.Header>
              <DataTable.ColumnHeader id="summary" sortBy={(change) => change.summary}>
                Change
              </DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="actor" sortBy={(change) => change.actorKind}>
                Actor
              </DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="status" sortBy={(change) => change.runStatus}>
                Run
              </DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="when" sortBy={(change) => change.createdAt}>
                When
              </DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {(change) => (
                <DataTable.Row
                  row={change}
                  rowId={change.stepId}
                  class={props.selectedStepId === change.stepId ? "pw-data-table-row--active" : undefined}
                  onActivate={() =>
                    detailPanelStore.getState().activateTarget({
                      scopeId: HISTORY_SCOPE,
                      entityId: change.stepId,
                      entityKind: "change",
                    })
                  }
                  aria-label={`Open change ${change.summary || change.stepId}`}
                >
                  <DataTable.Cell>
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span class="shrink-0 text-[var(--color-text-muted)]">
                        <ActorIcon actorKind={change.actorKind} />
                      </span>
                      <div class="min-w-0">
                        <div class="truncate">{change.summary || "—"}</div>
                        <Show when={change.runTask && change.runTask !== change.summary}>
                          <div class="truncate text-[11.5px] text-[var(--color-text-muted)]">{change.runTask}</div>
                        </Show>
                      </div>
                    </div>
                  </DataTable.Cell>
                  <DataTable.Cell>
                    <span class="truncate text-[var(--color-text-secondary)]">
                      {change.agentLabel || (change.actorKind === "human" ? "Human" : "Agent")}
                    </span>
                  </DataTable.Cell>
                  <DataTable.Cell>
                    <StatusChip tone={runTone(change.runStatus)} label={change.runStatus || "open"} />
                  </DataTable.Cell>
                  <DataTable.Cell>
                    <span class="whitespace-nowrap tabular-nums text-[var(--color-text-muted)]" title={formatWhen(change.createdAt)}>
                      {formatAgo(change.createdAt)}
                    </span>
                  </DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
            <DataTable.Empty>
              <Show
                when={!props.busy}
                fallback={
                  <div class="pw-page-skeleton__rows p-3" role="status" aria-label="Loading…">
                    <For each={[0, 1, 2, 3]}>
                      {() => (
                        <div class="pw-page-skeleton__row">
                          <Skeleton class="h-3 w-[40%]" />
                          <Skeleton class="h-3 w-[16%]" />
                          <Skeleton class="ml-auto h-3 w-[10%]" />
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                <PageEmpty
                  title="No justified changes yet"
                  description="Human Desktop saves and MCP audited writes appear here with summary and rationale."
                />
              </Show>
            </DataTable.Empty>
          </DataTable.Table>
        </DataTable.Root>
      </div>

      <Show when={selectedChange()}>
        {(change) => <ChangeDetail change={change()} detail={props.detail} selectedStepId={props.selectedStepId} />}
      </Show>
    </div>
  );
}

function ChangeDetail(props: {
  change: ProjectChangeRow;
  detail: AgentRunDetail | undefined;
  selectedStepId: string;
}) {
  const detail = () =>
    props.detail?.run.id === props.change.agentRunId ? props.detail : undefined;
  const envelope = createMemo(() => {
    const steps = detail()?.steps ?? [];
    const selected = steps.find((step) => step.id === props.selectedStepId)
      ?? steps.find((step) => step.kind === "change");
    return parseChangeEnvelope(selected?.payloadJson ?? props.change.payloadJson);
  });

  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<ActorIcon actorKind={props.change.actorKind} size={16} />}
            title={envelope().summary || props.change.summary || "Change"}
          />
          <DetailPanel.Section title="Rationale" icon={<FileText size={14} />}>
            <Show
              when={envelope().rationale.trim()}
              fallback={
                <p class="pw-detail-panel__text" data-empty>
                  No rationale recorded.
                </p>
              }
            >
              <p class="pw-detail-panel__text whitespace-pre-wrap">{envelope().rationale}</p>
            </Show>
          </DetailPanel.Section>
          <DetailPanel.Section title="Audit chain" icon={<History size={14} />}>
            <Show
              when={detail()}
              fallback={
                <div class="flex flex-col gap-2" role="status" aria-label="Loading audit chain…">
                  <Skeleton class="h-3 w-[55%]" />
                  <Skeleton class="h-3 w-[40%]" />
                </div>
              }
            >
              {(run) => (
                <ol class="m-0 flex list-none flex-col gap-3 p-0 text-[12.5px]">
                  <For each={run().steps}>
                    {(step) => {
                      const drift = step.kind === "drift" ? parseDriftStepPayload(step.payloadJson) : undefined;
                      const selected = () => step.id === props.selectedStepId;
                      return (
                        <li
                          class="flex flex-col gap-1 rounded-[var(--radius-item)] px-2 py-1.5"
                          classList={{ "bg-[var(--color-surface-selected)]": selected() }}
                          aria-current={selected() ? "step" : undefined}
                        >
                          <div class="flex items-baseline justify-between gap-3">
                            <span class="text-[11.5px] font-medium text-[var(--color-text-secondary)]">
                              {stepKindLabel(step.kind)}
                            </span>
                            <span class="text-[11.5px] tabular-nums text-[var(--color-text-muted)]" title={formatWhen(step.createdAt)}>
                              {formatAgo(step.createdAt)}
                            </span>
                          </div>
                          <p class="m-0 text-[var(--color-text-primary)]">{step.summary || "—"}</p>
                          <Show when={drift && drift.findings.length > 0}>
                            <ul class="m-0 mt-1 flex list-none flex-col gap-2 p-0">
                              <For each={drift!.findings}>
                                {(finding) => (
                                  <li class="flex flex-col gap-0.5">
                                    <div class="flex flex-wrap items-center gap-1.5">
                                      <StatusChip
                                        tone={driftFindingSeverityTone(finding.severity)}
                                        label={finding.severity || "finding"}
                                      />
                                      <Show when={finding.type}>
                                        <span class="font-mono text-[11px] text-[var(--color-text-muted)]">{finding.type}</span>
                                      </Show>
                                    </div>
                                    <span class="text-[12px]">{finding.summary || "—"}</span>
                                    <Show when={finding.subjectIds.length > 0}>
                                      <span class="font-mono text-[11px] text-[var(--color-text-muted)] pw-selectable">
                                        {finding.subjectIds.join(", ")}
                                      </span>
                                    </Show>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ol>
              )}
            </Show>
          </DetailPanel.Section>
        </DetailPanel.Main>
        <DetailPanel.Rail>
          <DetailPanel.Section title="Properties" icon={<Settings size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Actor"
                value={<StatusChip tone={actorTone(props.change.actorKind)} label={props.change.actorKind || "agent"} />}
              />
              <DetailPanel.Property label="Agent" value={props.change.agentLabel || null} />
              <DetailPanel.Property
                label="Run"
                value={<StatusChip tone={runTone(props.change.runStatus)} label={props.change.runStatus || "open"} />}
              />
              <DetailPanel.Property label="Task" value={props.change.runTask || null} />
              <DetailPanel.Property label="When" value={formatWhen(props.change.createdAt)} />
              <DetailPanel.Property label="Tool" value={envelope().tool || null} mono />
              <DetailPanel.Property
                label="Subjects"
                value={envelope().subjectIds.length > 0 ? envelope().subjectIds.join(", ") : null}
                mono
              />
              <DetailPanel.Property
                label="Paths"
                value={envelope().paths.length > 0 ? envelope().paths.join(", ") : null}
                mono
              />
              <DetailPanel.Property label="Run id" value={props.change.agentRunId || null} mono />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Rail>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}

function stepKindLabel(kind: string): string {
  if (!kind) return "Step";
  return kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll("_", " ");
}

function parseChangeEnvelope(payloadJson: string): ChangeEnvelopeView {
  try {
    const raw = JSON.parse(payloadJson || "{}") as Record<string, unknown>;
    const subjectIds = Array.isArray(raw.subject_ids)
      ? raw.subject_ids.flatMap((value) => typeof value === "string" && value ? [value] : [])
      : [];
    const paths = Array.isArray(raw.paths)
      ? raw.paths.flatMap((value) => typeof value === "string" && value ? [value] : [])
      : [];
    return {
      summary: typeof raw.summary === "string" ? raw.summary : "",
      rationale: typeof raw.rationale === "string" ? raw.rationale : "",
      tool: typeof raw.tool === "string" ? raw.tool : "",
      subjectIds,
      paths,
    };
  } catch {
    return { summary: "", rationale: "", tool: "", subjectIds: [], paths: [] };
  }
}

/** Short relative time such as "5m ago"; falls back to the date after a week. */
function formatAgo(value: string, now = Date.now()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value || "—";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
}

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
