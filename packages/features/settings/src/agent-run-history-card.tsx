import { For, Show, createEffect, createMemo, onCleanup, untrack } from "solid-js";
import {
  DispatchEventSummaryDetail,
  dispatchStatusTone,
  type DispatchRunEventView,
  type DispatchRunView,
} from "@polterware/feature-dispatch";
import {
  DataTable,
  DetailPanel,
  PageEmpty,
  Skeleton,
  StatusChip,
  FileText,
  History,
  Settings,
} from "@polterware/frontend-design-system";
import { ActorIcon } from "@polterware/feature-shell";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import type {
  AgentRunDetail,
  ChangeEnvelopeView,
  ProjectChangeRow,
} from "./agents-types";
import { mergeActivityRows } from "./activity-rows";
import { activityDayGroups, activityDayId } from "./activity-days";

export type ChangeActorFilter = "all" | "human" | "agent";

const HISTORY_SCOPE = "agents:history";

function actorTone(actorKind: string) {
  return actorKind === "human" ? "syncing" : "muted";
}

function runTone(status: string) {
  return status === "completed" ? "ok" : "warn";
}

/** Unified Change History feed (B9): human + agent justified mutations, detail in the page panel. */
export function AgentRunHistoryCard(props: {
  changes: ProjectChangeRow[];
  dispatchEvents?: DispatchRunEventView[];
  selectedStepId: string;
  selectedDispatchEventId?: string;
  detail: AgentRunDetail | undefined;
  dispatchRun?: DispatchRunView | undefined;
  busy: boolean;
  onSelect: (stepId: string, agentRunId: string) => void;
  onSelectDispatchEvent?: (event: DispatchRunEventView) => void;
  onClear: () => void;
}) {
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);
  const dispatchEvents = () => props.dispatchEvents ?? [];

  const mergedRows = createMemo<ProjectChangeRow[]>(() => mergeActivityRows(props.changes, dispatchEvents()));
  // The feed reads by day, like Linear's: Today, Yesterday, the weekday, then the date.
  const dayGroups = createMemo(() => activityDayGroups(mergedRows().map((change) => change.createdAt)));

  createEffect(() => {
    const targets = mergedRows().map((change) => ({
      scopeId: HISTORY_SCOPE,
      entityId: change.stepId,
      entityKind: "change",
    }));
    detailPanelStore.getState().registerCollection({
      scopeId: HISTORY_SCOPE,
      status: props.busy && mergedRows().length === 0 ? "loading" : "ready",
      targets,
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(HISTORY_SCOPE));

  // The panel store owns selection; mirror it into the page so it loads the run.
  createEffect(() => {
    const target = activeTarget();
    const entityId = target?.scopeId === HISTORY_SCOPE ? target.entityId : "";
    if (entityId.startsWith("dispatch:")) {
      const eventId = entityId.slice("dispatch:".length);
      if (eventId === untrack(() => props.selectedDispatchEventId ?? "")) return;
      const event = untrack(() => dispatchEvents()).find((item) => item.id === eventId);
      if (event) props.onSelectDispatchEvent?.(event);
      else props.onClear();
      return;
    }
    if (
      entityId === untrack(() => props.selectedStepId)
      && !untrack(() => props.selectedDispatchEventId)
    ) {
      return;
    }
    const change = untrack(() => props.changes).find((row) => row.stepId === entityId);
    if (change) props.onSelect(change.stepId, change.agentRunId);
    else props.onClear();
  });

  const selectedChange = createMemo(() =>
    props.changes.find((change) => change.stepId === props.selectedStepId),
  );
  const selectedDispatchEvent = createMemo(() =>
    dispatchEvents().find((event) => event.id === props.selectedDispatchEventId),
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 flex-col overflow-auto">
        <DataTable.Root
          rows={mergedRows()}
          getRowId={(change) => change.stepId}
          density="list"
          grouping={{ by: (change) => activityDayId(change.createdAt), groups: dayGroups(), showEmpty: false }}
        >
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
              {(change) => {
                const isSelected = () =>
                  change.stepId.startsWith("dispatch:")
                    ? `dispatch:${props.selectedDispatchEventId ?? ""}` === change.stepId
                    : props.selectedStepId === change.stepId;
                return (
                  <DataTable.Row
                    row={change}
                    rowId={change.stepId}
                    class={isSelected() ? "pw-data-table-row--active" : undefined}
                    onActivate={() =>
                      detailPanelStore.getState().activateTarget({
                        scopeId: HISTORY_SCOPE,
                        entityId: change.stepId,
                        entityKind: "change",
                      })
                    }
                    aria-label={`Open change ${change.summary || change.stepId}`}
                  >
                    <DataTable.Cell
                      leading={
                        <ActorIcon
                          actorKind={change.actorKind}
                          agentKey={change.agentLabel || change.agentRunId}
                          agentLabel={change.agentLabel}
                          seedKey={change.stepId}
                          runStatus={change.runStatus}
                          avatarUrl={change.avatarUrl}
                        />
                      }
                    >
                      <div class="min-w-0">
                        <div class="truncate">{change.summary || "—"}</div>
                        <Show when={change.runTask && change.runTask !== change.summary}>
                          <div class="truncate text-[11.5px] text-[var(--color-text-muted)]">{change.runTask}</div>
                        </Show>
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <span class="truncate text-[var(--color-text-secondary)]">
                        {change.agentLabel || (change.actorKind === "human" ? "Human" : "Agent")}
                      </span>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <StatusChip
                        tone={
                          change.stepId.startsWith("dispatch:")
                            ? dispatchStatusTone(change.runStatus)
                            : runTone(change.runStatus)
                        }
                        label={change.runStatus || "open"}
                      />
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <span class="whitespace-nowrap tabular-nums text-[var(--color-text-muted)]" title={formatWhen(change.createdAt)}>
                        {formatTime(change.createdAt)}
                      </span>
                    </DataTable.Cell>
                  </DataTable.Row>
                );
              }}
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
                  title="No changes yet"
                  mood="sleeping"
                />
              </Show>
            </DataTable.Empty>
          </DataTable.Table>
        </DataTable.Root>
      </div>

      <Show when={selectedDispatchEvent()}>
        {(event) => <DispatchEventSummaryDetail event={event()} run={props.dispatchRun} />}
      </Show>

      <Show when={!selectedDispatchEvent() && selectedChange()}>
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
            icon={
              <ActorIcon
                actorKind={props.change.actorKind}
                agentKey={props.change.agentLabel || props.change.agentRunId}
                agentLabel={props.change.agentLabel}
                seedKey={props.change.stepId}
                runStatus={props.change.runStatus}
                avatarUrl={props.change.avatarUrl}
                size={16}
              />
            }
            title={envelope().summary || props.change.summary || "Change"}
          />
          <DetailPanel.Section title="Rationale" icon={<FileText size={14} />}>
            <Show
              when={envelope().rationale.trim()}
              fallback={
                <p class="pw-detail-panel__text" data-empty>
                  No reason given.
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

/** The time of day, under its day's group header. */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
