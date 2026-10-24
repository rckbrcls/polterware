import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from "solid-js";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  Bot,
  Button,
  DataTable,
  DetailPanel,
  Field,
  FileText,
  Gauge,
  GitBranch,
  Input,
  Layers,
  PageContent,
  PageEmpty,
  PageToolbar,
  Play,
  RefreshCw,
  Route,
  Select,
  Settings,
  Skeleton,
  StatusChip,
  Stop,
  Tabs,
  Terminal,
  ToolbarIconButton,
  pushToast,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import {
  dispatchBridge,
  dispatchStatusTone,
  formatUsedPercent,
  mapCheckTiersProblems,
  mapDispatchAgents,
  mapDispatchQuotaSnapshots,
  mapDispatchResult,
  mapDispatchRun,
  mapDispatchRuns,
  mapDispatchTiers,
  mapDispatchWorktrees,
} from "./dispatch-bridge";
import type {
  DispatchAgentView,
  DispatchQuotaSnapshotView,
  DispatchRunEventView,
  DispatchRunView,
  DispatchTab,
  DispatchTierView,
  DispatchWatchEventView,
  DispatchWorktreeView,
} from "./dispatch-types";

export * from "./dispatch-types";
export * from "./dispatch-bridge";

const DISPATCH_RUNS_SCOPE = "dispatch:runs";

const DISPATCH_TABS: { id: DispatchTab; label: string }[] = [
  { id: "runs", label: "Runs" },
  { id: "worktrees", label: "Worktrees" },
  { id: "pace", label: "Pace" },
  { id: "tiers", label: "Tiers & Agents" },
];

const DEFAULT_TIER_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

function normalizeDispatchTab(tab?: string): DispatchTab {
  if (tab === "worktrees" || tab === "pace" || tab === "tiers") return tab;
  return "runs";
}

function isRunActive(status: string): boolean {
  const s = status.toLowerCase();
  return s === "pending" || s === "running";
}

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/** Short summary panel for a dispatch event on Activity (no live output). */
export function DispatchEventSummaryDetail(props: {
  event: DispatchRunEventView;
  run?: DispatchRunView;
}) {
  const status = () => props.run?.status || props.event.kind;
  const tier = () => props.run?.tier || props.event.tier || "—";
  const agent = () => props.run?.agent || props.event.agent || "—";
  const model = () => props.run?.model || "—";
  const card = () => props.run?.cardSlug || "—";
  const verification = () => props.run?.verification || (props.event.kind === "verified" ? "passed" : "—");
  const error = () => props.run?.error || (props.event.kind === "failed" ? props.event.text : "");

  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<Route size={16} />}
            title={props.event.text || `Dispatch ${props.event.kind}`}
          />
          <DetailPanel.Section title="Dispatch summary" icon={<FileText size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Status"
                value={<StatusChip tone={dispatchStatusTone(status())} label={status()} />}
              />
              <DetailPanel.Property label="Tier" value={tier()} />
              <DetailPanel.Property label="Agent" value={agent()} />
              <DetailPanel.Property label="Model" value={model()} mono />
              <DetailPanel.Property label="Card" value={card()} mono />
              <DetailPanel.Property label="Verification" value={verification()} />
              <DetailPanel.Property label="Error" value={error() || "—"} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Main>
        <DetailPanel.Rail>
          <DetailPanel.Section title="Event" icon={<Settings size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Kind"
                value={<StatusChip tone={dispatchStatusTone(props.event.kind)} label={props.event.kind} />}
              />
              <DetailPanel.Property label="Run id" value={props.event.runId || "—"} mono />
              <DetailPanel.Property label="When" value={formatWhen(props.event.at)} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Rail>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}

/** Dispatch surface: Runs, Worktrees, Pace, and Tiers & Agents. */
export function DispatchPage(props: {
  projectId: string;
  tab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [localTab, setLocalTab] = createSignal<DispatchTab>(normalizeDispatchTab(props.tab));
  const activeTab = () => (props.tab ? normalizeDispatchTab(props.tab) : localTab());

  const [busy, setBusy] = createSignal(false);
  const [runs, setRuns] = createSignal<DispatchRunView[]>([]);
  const [worktrees, setWorktrees] = createSignal<DispatchWorktreeView[]>([]);
  const [quotaSnapshots, setQuotaSnapshots] = createSignal<DispatchQuotaSnapshotView[]>([]);
  const [tiers, setTiers] = createSignal<DispatchTierView[]>([]);
  const [agents, setAgents] = createSignal<DispatchAgentView[]>([]);
  const [tierProblems, setTierProblems] = createSignal<string[]>([]);

  const [selectedRunId, setSelectedRunId] = createSignal("");
  const [selectedRunDetail, setSelectedRunDetail] = createSignal<DispatchRunView | undefined>();
  const [selectedRunResult, setSelectedRunResult] = createSignal("");
  const [liveEvents, setLiveEvents] = createSignal<DispatchWatchEventView[]>([]);

  const [draftTier, setDraftTier] = createSignal("normal");
  const [draftAgent, setDraftAgent] = createSignal("");
  const [draftCard, setDraftCard] = createSignal("");
  const [draftPrompt, setDraftPrompt] = createSignal("");
  const [starting, setStarting] = createSignal(false);
  const [cancellingId, setCancellingId] = createSignal("");

  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  createEffect(() => {
    if (activeTab() !== "runs") {
      detailPanelStore.getState().unregisterCollection(DISPATCH_RUNS_SCOPE);
      return;
    }
    const targets = runs().map((run) => ({
      scopeId: DISPATCH_RUNS_SCOPE,
      entityId: run.id,
      entityKind: "change",
    }));
    detailPanelStore.getState().registerCollection({
      scopeId: DISPATCH_RUNS_SCOPE,
      status: busy() && runs().length === 0 ? "loading" : "ready",
      targets,
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(DISPATCH_RUNS_SCOPE));

  const loadRunDetail = async (id: string) => {
    const bridge = dispatchBridge();
    if (!bridge || !id) {
      setSelectedRunDetail(undefined);
      setSelectedRunResult("");
      return;
    }
    try {
      const [rawRun, rawResult] = await Promise.all([
        bridge.getRun({ id }),
        bridge.result({ id, section: "summary", offset: 0, limit: 200 }).catch(() => ({})),
      ]);
      setSelectedRunDetail(mapDispatchRun(rawRun));
      setSelectedRunResult(mapDispatchResult(rawResult).content);
    } catch {
      setSelectedRunDetail(runs().find((item) => item.id === id));
      setSelectedRunResult("");
    }
  };

  createEffect(() => {
    const target = activeTarget();
    const id = target?.scopeId === DISPATCH_RUNS_SCOPE ? target.entityId : "";
    if (id === untrack(() => selectedRunId())) return;
    setSelectedRunId(id);
    if (id) void loadRunDetail(id);
    else {
      setSelectedRunDetail(undefined);
      setSelectedRunResult("");
    }
  });

  // Live output stream on Dispatch > Runs only.
  createEffect(() => {
    if (activeTab() !== "runs") {
      setLiveEvents([]);
      return;
    }
    const runId = selectedRunId() || runs()[0]?.id || "";
    const bridge = dispatchBridge();
    if (!bridge || !runId) {
      setLiveEvents([]);
      return;
    }
    setLiveEvents([]);
    const unsubscribe = bridge.watchRun({ id: runId, afterSeq: 0 }, (event) => {
      setLiveEvents((prev) => [...prev, event]);
    });
    onCleanup(() => unsubscribe());
  });

  const refresh = async () => {
    const bridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if (!bridge) {
      setRuns([]);
      setWorktrees([]);
      setQuotaSnapshots([]);
      setTiers([]);
      setAgents([]);
      setTierProblems([]);
      return;
    }
    setBusy(true);
    try {
      const [rawRuns, rawWorktrees, rawQuota, rawTiers, rawAgents, rawCheck] = await Promise.all([
        projectId ? bridge.listRuns({ projectId, limit: 50 }) : Promise.resolve({ runs: [] }),
        projectId ? bridge.listWorktrees({ projectId }) : Promise.resolve({ worktrees: [] }),
        bridge.listQuota({ agent: "", since: "" }),
        bridge.listTiers({}),
        bridge.listAgents({}),
        bridge.checkTiers({}),
      ]);
      const nextRuns = mapDispatchRuns(rawRuns);
      setRuns(nextRuns);
      setWorktrees(mapDispatchWorktrees(rawWorktrees));
      setQuotaSnapshots(mapDispatchQuotaSnapshots(rawQuota));
      setTiers(mapDispatchTiers(rawTiers));
      setAgents(mapDispatchAgents(rawAgents));
      setTierProblems(mapCheckTiersProblems(rawCheck));

      const currentId = selectedRunId();
      if (currentId && nextRuns.some((item) => item.id === currentId)) {
        await loadRunDetail(currentId);
      } else if (currentId) {
        setSelectedRunId("");
        setSelectedRunDetail(undefined);
        setSelectedRunResult("");
      }
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load dispatch data.", "danger");
    } finally {
      setBusy(false);
    }
  };

  createEffect(
    on(
      () => props.projectId,
      () => {
        setRuns([]);
        setWorktrees([]);
        setSelectedRunId("");
        setSelectedRunDetail(undefined);
        setSelectedRunResult("");
        setLiveEvents([]);
        void refresh();
      },
      { defer: true },
    ),
  );

  onMount(() => void refresh());

  const handleStartRun = async () => {
    const bridge = dispatchBridge();
    const projectId = props.projectId.trim();
    const prompt = draftPrompt().trim();
    if (!bridge || !projectId || !prompt) return;
    setStarting(true);
    try {
      const started = mapDispatchRun(
        await bridge.startRun({
          projectId,
          tier: draftTier(),
          prompt,
          ...(draftCard().trim() ? { cardSlug: draftCard().trim() } : {}),
          ...(draftAgent().trim() ? { agent: draftAgent().trim() } : {}),
        }),
      );
      setDraftPrompt("");
      await refresh();
      if (started) {
        detailPanelStore.getState().activateTarget({
          scopeId: DISPATCH_RUNS_SCOPE,
          entityId: started.id,
          entityKind: "change",
        });
      }
      pushToast("Dispatch run started.", "success");
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not start dispatch run.", "danger");
    } finally {
      setStarting(false);
    }
  };

  const handleCancelRun = async (id: string) => {
    const bridge = dispatchBridge();
    if (!bridge || !id) return;
    setCancellingId(id);
    try {
      await bridge.cancelRun({ id });
      await refresh();
      pushToast("Dispatch run cancelled.", "success");
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not cancel dispatch run.", "danger");
    } finally {
      setCancellingId("");
    }
  };

  const selectedRun = createMemo(
    () => selectedRunDetail() ?? runs().find((item) => item.id === selectedRunId()),
  );

  const tierSelectOptions = createMemo(() => {
    const dynamic = tiers().map((tier) => ({ value: tier.name, label: `${tier.name} (${tier.agent})` }));
    return dynamic.length > 0 ? dynamic : DEFAULT_TIER_OPTIONS;
  });

  const agentSelectOptions = createMemo(() => [
    { value: "", label: "Auto (from tier)" },
    ...agents().map((agent) => ({ value: agent.name, label: agent.name })),
  ]);

  const watchedRunId = () => selectedRunId() || runs()[0]?.id || "";

  return (
    <EntityDetailHost>
      <PageToolbar.Root>
        <PageToolbar.Tabs>
          <Tabs
            items={DISPATCH_TABS}
            value={activeTab()}
            onChange={(value) => {
              const next = normalizeDispatchTab(value);
              setLocalTab(next);
              props.onTabChange?.(next);
            }}
            aria-label="Dispatch"
          />
        </PageToolbar.Tabs>
        <PageToolbar.Actions>
          <ToolbarIconButton label="Refresh" disabled={busy()} onClick={() => void refresh()}>
            <RefreshCw size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>

      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <Switch>
          <Match when={activeTab() === "runs"}>
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="flex flex-wrap items-end gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-4 py-3">
                <Field label="Tier" class="w-36">
                  <Select
                    aria-label="Tier"
                    options={tierSelectOptions()}
                    value={draftTier()}
                    onChange={setDraftTier}
                  />
                </Field>
                <Field label="Agent" class="w-40">
                  <Select
                    aria-label="Agent"
                    options={agentSelectOptions()}
                    value={draftAgent()}
                    onChange={setDraftAgent}
                  />
                </Field>
                <Field label="Card" class="w-40">
                  <Input
                    aria-label="Card"
                    placeholder="Optional card slug"
                    value={draftCard()}
                    onInput={(event) => setDraftCard(event.currentTarget.value)}
                  />
                </Field>
                <Field label="Prompt" class="min-w-[220px] flex-1">
                  <Input
                    aria-label="Prompt"
                    placeholder="Describe the task to dispatch…"
                    value={draftPrompt()}
                    onInput={(event) => setDraftPrompt(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleStartRun();
                      }
                    }}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={starting() || !draftPrompt().trim() || !props.projectId.trim()}
                  onClick={() => void handleStartRun()}
                >
                  <Play size={14} />
                  {starting() ? "Starting…" : "Start run"}
                </Button>
              </div>

              <div class="min-h-0 flex-1 overflow-auto">
                <DataTable.Root rows={runs()} getRowId={(run) => run.id}>
                  <DataTable.Table aria-label="Dispatch runs">
                    <DataTable.Header>
                      <DataTable.ColumnHeader id="prompt" sortBy={(run) => run.prompt || run.id}>
                        Run
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="status" sortBy={(run) => run.status}>
                        Status
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="tier" sortBy={(run) => run.tier}>
                        Tier
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="agent" sortBy={(run) => run.agent}>
                        Agent
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="model" sortBy={(run) => run.model}>
                        Model
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="card" sortBy={(run) => run.cardSlug}>
                        Card
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="actions" width="96px" align="right" sortable={false} resizable={false}>
                        <span class="sr-only">Actions</span>
                      </DataTable.ColumnHeader>
                    </DataTable.Header>
                    <DataTable.Body>
                      {(run) => (
                        <DataTable.Row
                          row={run}
                          rowId={run.id}
                          class={selectedRunId() === run.id ? "pw-data-table-row--active" : undefined}
                          onActivate={() =>
                            detailPanelStore.getState().activateTarget({
                              scopeId: DISPATCH_RUNS_SCOPE,
                              entityId: run.id,
                              entityKind: "change",
                            })
                          }
                          aria-label={`Open run ${run.id}`}
                        >
                          <DataTable.Cell>
                            <div class="min-w-0">
                              <div class="truncate font-medium">{run.prompt || run.id}</div>
                              <div class="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                                {run.id}
                              </div>
                            </div>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <StatusChip tone={dispatchStatusTone(run.status)} label={run.status} />
                          </DataTable.Cell>
                          <DataTable.Cell>{run.tier || "—"}</DataTable.Cell>
                          <DataTable.Cell>{run.agent || "—"}</DataTable.Cell>
                          <DataTable.Cell>
                            <span class="font-mono text-[12px] text-[var(--color-text-secondary)]">
                              {run.model || "—"}
                            </span>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <span class="font-mono text-[12px] text-[var(--color-text-muted)]">
                              {run.cardSlug || "—"}
                            </span>
                          </DataTable.Cell>
                          <DataTable.Cell align="right" onClick={(event: MouseEvent) => event.stopPropagation()}>
                            <Show when={isRunActive(run.status)}>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={cancellingId() === run.id}
                                onClick={() => void handleCancelRun(run.id)}
                              >
                                <Stop size={12} />
                                Cancel
                              </Button>
                            </Show>
                          </DataTable.Cell>
                        </DataTable.Row>
                      )}
                    </DataTable.Body>
                    <DataTable.Empty>
                      <Show
                        when={!busy()}
                        fallback={
                          <div class="pw-page-skeleton__rows p-3" role="status" aria-label="Loading…">
                            <For each={[0, 1, 2]}>
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
                          title="No dispatch runs yet"
                          description="Start a run above to delegate a task to a worker agent."
                        />
                      </Show>
                    </DataTable.Empty>
                  </DataTable.Table>
                </DataTable.Root>
              </div>

              <div
                class="flex h-44 shrink-0 flex-col border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]"
                role="region"
                aria-label="Live run output"
              >
                <div class="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-1.5 text-[11.5px] text-[var(--color-text-secondary)]">
                  <span class="inline-flex items-center gap-1.5 font-medium">
                    <Terminal size={13} />
                    Live output
                  </span>
                  <span class="font-mono text-[11px] text-[var(--color-text-muted)]">
                    {watchedRunId() || "No run selected"}
                  </span>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-[12px] text-[var(--color-text-secondary)]">
                  <Show
                    when={liveEvents().length > 0}
                    fallback={
                      <p class="m-0 text-[var(--color-text-muted)]">
                        {watchedRunId()
                          ? "Waiting for live stream events…"
                          : "Select or start a run to stream live output."}
                      </p>
                    }
                  >
                    <For each={liveEvents()}>
                      {(item) => (
                        <div class="whitespace-pre-wrap py-0.5">
                          <span class="text-[var(--color-text-muted)]">[{item.kind || "log"}] </span>
                          <span>{item.text}</span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>

              <Show when={selectedRun()}>
                {(run) => (
                  <DispatchRunDetail
                    run={run()}
                    resultContent={selectedRunResult()}
                    cancelling={cancellingId() === run().id}
                    onCancel={() => void handleCancelRun(run().id)}
                  />
                )}
              </Show>
            </div>
          </Match>

          <Match when={activeTab() === "worktrees"}>
            <div class="min-h-0 flex-1 overflow-auto">
              <DataTable.Root rows={worktrees()} getRowId={(wt) => wt.id || wt.path}>
                <DataTable.Table aria-label="Dispatch worktrees">
                  <DataTable.Header>
                    <DataTable.ColumnHeader id="path" sortBy={(wt) => wt.path}>
                      Path
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="branch" sortBy={(wt) => wt.branch}>
                      Branch
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="status" sortBy={(wt) => wt.status}>
                      Status
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="card" sortBy={(wt) => wt.cardSlug}>
                      Card
                    </DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body>
                    {(wt) => (
                      <DataTable.Row row={wt} rowId={wt.id || wt.path}>
                        <DataTable.Cell>
                          <span class="font-mono text-[12px]">{wt.path || "—"}</span>
                        </DataTable.Cell>
                        <DataTable.Cell>
                          <span class="inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--color-text-secondary)]">
                            <GitBranch size={13} />
                            {wt.branch || "—"}
                          </span>
                        </DataTable.Cell>
                        <DataTable.Cell>
                          <StatusChip tone={dispatchStatusTone(wt.status)} label={wt.status || "unknown"} />
                        </DataTable.Cell>
                        <DataTable.Cell>
                          <span class="font-mono text-[12px] text-[var(--color-text-muted)]">
                            {wt.cardSlug || "—"}
                          </span>
                        </DataTable.Cell>
                      </DataTable.Row>
                    )}
                  </DataTable.Body>
                  <DataTable.Empty>
                    <PageEmpty
                      title="No dispatch worktrees"
                      description="Isolated git worktrees created by dispatch runs appear here."
                    />
                  </DataTable.Empty>
                </DataTable.Table>
              </DataTable.Root>
            </div>
          </Match>

          <Match when={activeTab() === "pace"}>
            <div class="min-h-0 flex-1 overflow-auto">
              <DataTable.Root
                rows={quotaSnapshots()}
                getRowId={(snap) => `${snap.agent}:${snap.provider}:${snap.window}:${snap.sampledAt}`}
              >
                <DataTable.Table aria-label="Quota snapshots">
                  <DataTable.Header>
                    <DataTable.ColumnHeader id="agent" sortBy={(snap) => snap.agent}>
                      Agent
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="provider" sortBy={(snap) => snap.provider}>
                      Provider
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="window" sortBy={(snap) => snap.window}>
                      Window
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="used" sortBy={(snap) => snap.usedPercent ?? -1}>
                      Used
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="source" sortBy={(snap) => snap.source}>
                      Source
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="confidence" sortBy={(snap) => snap.confidence}>
                      Confidence
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="resetsAt" sortBy={(snap) => snap.resetsAt}>
                      Resets at
                    </DataTable.ColumnHeader>
                    <DataTable.ColumnHeader id="sampledAt" sortBy={(snap) => snap.sampledAt}>
                      Sampled at
                    </DataTable.ColumnHeader>
                  </DataTable.Header>
                  <DataTable.Body>
                    {(snap) => (
                      <DataTable.Row
                        row={snap}
                        rowId={`${snap.agent}:${snap.provider}:${snap.window}:${snap.sampledAt}`}
                      >
                        <DataTable.Cell>{snap.agent}</DataTable.Cell>
                        <DataTable.Cell>{snap.provider || "—"}</DataTable.Cell>
                        <DataTable.Cell>{snap.window || "—"}</DataTable.Cell>
                        <DataTable.Cell>
                          <Show
                            when={snap.usedPercent !== undefined}
                            fallback={<StatusChip tone="unknown" label="unknown" />}
                          >
                            <span class="tabular-nums">{formatUsedPercent(snap.usedPercent)}</span>
                          </Show>
                        </DataTable.Cell>
                        <DataTable.Cell>{snap.source || "—"}</DataTable.Cell>
                        <DataTable.Cell>
                          <StatusChip
                            tone={dispatchStatusTone(snap.confidence)}
                            label={snap.confidence || "unknown"}
                          />
                        </DataTable.Cell>
                        <DataTable.Cell>{formatWhen(snap.resetsAt)}</DataTable.Cell>
                        <DataTable.Cell>{formatWhen(snap.sampledAt)}</DataTable.Cell>
                      </DataTable.Row>
                    )}
                  </DataTable.Body>
                  <DataTable.Empty>
                    <PageEmpty
                      title="No quota snapshots"
                      description="Agent pace and quota snapshots appear here once sampled."
                    />
                  </DataTable.Empty>
                </DataTable.Table>
              </DataTable.Root>
            </div>
          </Match>

          <Match when={activeTab() === "tiers"}>
            <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-4 py-3">
                <div class="flex items-center gap-2">
                  <Gauge size={15} />
                  <span class="text-[13px] font-medium">Tier configuration check</span>
                </div>
                <StatusChip
                  tone={tierProblems().length === 0 ? "ok" : "warn"}
                  label={tierProblems().length === 0 ? "Healthy" : `${tierProblems().length} problem(s)`}
                />
                <Show when={tierProblems().length > 0}>
                  <ul class="m-0 w-full list-disc pl-5 text-[12px] text-[var(--color-text-secondary)]">
                    <For each={tierProblems()}>{(problem) => <li>{problem}</li>}</For>
                  </ul>
                </Show>
              </div>

              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                  <Layers size={14} />
                  <span>Tiers</span>
                </div>
                <DataTable.Root rows={tiers()} getRowId={(tier) => `${tier.name}:${tier.position}`}>
                  <DataTable.Table aria-label="Dispatch tiers">
                    <DataTable.Header>
                      <DataTable.ColumnHeader id="position" sortBy={(tier) => tier.position}>
                        #
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="name" sortBy={(tier) => tier.name}>
                        Tier
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="provider" sortBy={(tier) => tier.provider}>
                        Provider
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="agent" sortBy={(tier) => tier.agent}>
                        Agent
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="model" sortBy={(tier) => tier.model}>
                        Model
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="speed" sortBy={(tier) => tier.speed}>
                        Speed
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="strength" sortBy={(tier) => tier.strength}>
                        Strength
                      </DataTable.ColumnHeader>
                    </DataTable.Header>
                    <DataTable.Body>
                      {(tier) => (
                        <DataTable.Row row={tier} rowId={`${tier.name}:${tier.position}`}>
                          <DataTable.Cell>
                            <span class="tabular-nums text-[var(--color-text-muted)]">{tier.position}</span>
                          </DataTable.Cell>
                          <DataTable.Cell>{tier.name}</DataTable.Cell>
                          <DataTable.Cell>{tier.provider || "—"}</DataTable.Cell>
                          <DataTable.Cell>{tier.agent || "—"}</DataTable.Cell>
                          <DataTable.Cell>
                            <span class="font-mono text-[12px]">{tier.model || "—"}</span>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <span class="tabular-nums">{tier.speed}</span>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <span class="tabular-nums">{tier.strength}</span>
                          </DataTable.Cell>
                        </DataTable.Row>
                      )}
                    </DataTable.Body>
                    <DataTable.Empty>
                      <PageEmpty title="No tiers configured" description="Configure dispatch tiers in the core." />
                    </DataTable.Empty>
                  </DataTable.Table>
                </DataTable.Root>
              </div>

              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                  <Bot size={14} />
                  <span>Agents</span>
                </div>
                <DataTable.Root rows={agents()} getRowId={(agent) => agent.name}>
                  <DataTable.Table aria-label="Dispatch agents">
                    <DataTable.Header>
                      <DataTable.ColumnHeader id="name" sortBy={(agent) => agent.name}>
                        Agent
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="bin" sortBy={(agent) => agent.bin}>
                        Binary
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="provider" sortBy={(agent) => agent.provider}>
                        Provider
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="quotaSource" sortBy={(agent) => agent.quotaSource}>
                        Quota source
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="confidence" sortBy={(agent) => agent.confidence}>
                        Confidence
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="risk" sortBy={(agent) => agent.risk}>
                        Risk
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="used" sortBy={(agent) => agent.usedPercent ?? -1}>
                        Used
                      </DataTable.ColumnHeader>
                      <DataTable.ColumnHeader id="cooldown" sortBy={(agent) => agent.cooldownUntil}>
                        Cooldown
                      </DataTable.ColumnHeader>
                    </DataTable.Header>
                    <DataTable.Body>
                      {(agent) => (
                        <DataTable.Row row={agent} rowId={agent.name}>
                          <DataTable.Cell>{agent.name}</DataTable.Cell>
                          <DataTable.Cell>
                            <span class="font-mono text-[12px]">{agent.bin || "—"}</span>
                          </DataTable.Cell>
                          <DataTable.Cell>{agent.provider || "—"}</DataTable.Cell>
                          <DataTable.Cell>{agent.quotaSource || "—"}</DataTable.Cell>
                          <DataTable.Cell>
                            <StatusChip
                              tone={dispatchStatusTone(agent.confidence)}
                              label={agent.confidence || "unknown"}
                            />
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <StatusChip
                              tone={dispatchStatusTone(agent.risk)}
                              label={agent.risk || "unknown"}
                            />
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <Show
                              when={agent.usedPercent !== undefined}
                              fallback={<StatusChip tone="unknown" label="unknown" />}
                            >
                              <span class="tabular-nums">{formatUsedPercent(agent.usedPercent)}</span>
                            </Show>
                          </DataTable.Cell>
                          <DataTable.Cell>{agent.cooldownUntil ? formatWhen(agent.cooldownUntil) : "—"}</DataTable.Cell>
                        </DataTable.Row>
                      )}
                    </DataTable.Body>
                    <DataTable.Empty>
                      <PageEmpty title="No agents registered" description="Registered worker agents appear here." />
                    </DataTable.Empty>
                  </DataTable.Table>
                </DataTable.Root>
              </div>
            </div>
          </Match>
        </Switch>
      </PageContent>
    </EntityDetailHost>
  );
}

function DispatchRunDetail(props: {
  run: DispatchRunView;
  resultContent: string;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<Route size={16} />}
            title={props.run.prompt || props.run.id}
          />
          <DetailPanel.Section title="Prompt" icon={<FileText size={14} />}>
            <p class="pw-detail-panel__text whitespace-pre-wrap">{props.run.prompt || "—"}</p>
          </DetailPanel.Section>
          <Show when={props.run.error}>
            <DetailPanel.Section title="Error" icon={<FileText size={14} />}>
              <p class="pw-detail-panel__text whitespace-pre-wrap text-[var(--color-danger)]">
                {props.run.error}
              </p>
            </DetailPanel.Section>
          </Show>
          <Show when={props.run.note || props.resultContent}>
            <DetailPanel.Section title="Summary" icon={<FileText size={14} />}>
              <p class="pw-detail-panel__text whitespace-pre-wrap">
                {props.resultContent || props.run.note}
              </p>
            </DetailPanel.Section>
          </Show>
        </DetailPanel.Main>
        <DetailPanel.Rail>
          <DetailPanel.Section
            title="Properties"
            icon={<Settings size={14} />}
            aside={
              <Show when={isRunActive(props.run.status)}>
                <Button size="sm" variant="ghost" disabled={props.cancelling} onClick={props.onCancel}>
                  <Stop size={12} />
                  Cancel
                </Button>
              </Show>
            }
          >
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Status"
                value={<StatusChip tone={dispatchStatusTone(props.run.status)} label={props.run.status} />}
              />
              <DetailPanel.Property label="Tier" value={props.run.tier || "—"} />
              <DetailPanel.Property label="Agent" value={props.run.agent || "—"} />
              <DetailPanel.Property label="Model" value={props.run.model || "—"} mono />
              <DetailPanel.Property label="Provider" value={props.run.provider || "—"} />
              <DetailPanel.Property label="Card" value={props.run.cardSlug || "—"} mono />
              <DetailPanel.Property label="Verification" value={props.run.verification || "—"} />
              <DetailPanel.Property label="Branch" value={props.run.branch || "—"} mono />
              <DetailPanel.Property label="Worktree" value={props.run.worktree || "—"} mono />
              <DetailPanel.Property label="Run id" value={props.run.id} mono />
              <DetailPanel.Property label="Started" value={formatWhen(props.run.startedAt || props.run.createdAt)} />
              <DetailPanel.Property label="Finished" value={formatWhen(props.run.finishedAt)} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Rail>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}
