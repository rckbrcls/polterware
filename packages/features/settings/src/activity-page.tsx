import { For, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import {
  dispatchBridge,
  mapDispatchHistory,
  mapDispatchRun,
  type DispatchRunEventView,
  type DispatchRunView,
} from "@polterware/feature-dispatch";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  FilterChip,
  ToolbarIconButton,
  PageContent,
  PageToolbar,
  Tabs,
  RefreshCw,
  pushToast,
} from "@polterware/frontend-design-system";
import type { AgentRunDetail, ProjectChangeRow } from "./agents-types";
import { agentsBridge, mapAgentRunDetail, mapProjectChanges } from "./agents-bridge";
import { AgentRunHistoryCard, type ChangeActorFilter } from "./agent-run-history-card";

const DEFAULT_TIERS = ["easy", "normal", "hard"] as const;

/** Activity: the Unified Change History of justified project-model changes, across every surface. */
export function ActivityPage(props: { projectId: string }) {
  const [busy, setBusy] = createSignal(false);
  const [changes, setChanges] = createSignal<ProjectChangeRow[]>([]);
  const [dispatchEvents, setDispatchEvents] = createSignal<DispatchRunEventView[]>([]);
  const [knownAgents, setKnownAgents] = createSignal<string[]>([]);
  const [knownTiers, setKnownTiers] = createSignal<string[]>([...DEFAULT_TIERS]);
  const [actorFilter, setActorFilter] = createSignal<ChangeActorFilter>("all");
  const [dispatchAgentFilter, setDispatchAgentFilter] = createSignal("");
  const [dispatchTierFilter, setDispatchTierFilter] = createSignal("");
  const [selectedStepId, setSelectedStepId] = createSignal("");
  const [selectedDispatchEventId, setSelectedDispatchEventId] = createSignal("");
  const [runDetail, setRunDetail] = createSignal<AgentRunDetail | undefined>();
  const [dispatchRunDetail, setDispatchRunDetail] = createSignal<DispatchRunView | undefined>();

  const loadRunDetail = async (id: string) => {
    const bridge = agentsBridge();
    if (!bridge || !id) {
      setRunDetail(undefined);
      return;
    }
    try {
      setRunDetail(mapAgentRunDetail(await bridge.getAgentRun({ id })));
    } catch (error: unknown) {
      setRunDetail(undefined);
      pushToast(error instanceof Error ? error.message : "Could not load agent run.", "danger");
    }
  };

  const loadDispatchRunSummary = async (runId: string) => {
    const dBridge = dispatchBridge();
    if (!dBridge || !runId) {
      setDispatchRunDetail(undefined);
      return;
    }
    try {
      setDispatchRunDetail(mapDispatchRun(await dBridge.getRun({ id: runId })));
    } catch {
      setDispatchRunDetail(undefined);
    }
  };

  const refreshDispatchHistory = async (agentOverride?: string, tierOverride?: string) => {
    const dBridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if (!dBridge || !projectId) {
      setDispatchEvents([]);
      return;
    }
    const agent = agentOverride ?? dispatchAgentFilter();
    const tier = tierOverride ?? dispatchTierFilter();
    try {
      const events = mapDispatchHistory(
        await dBridge.listHistory({
          projectId,
          limit: 50,
          ...(agent ? { agent } : {}),
          ...(tier ? { tier } : {}),
        }),
      );
      setDispatchEvents(events);
      setKnownAgents((prev) => {
        const next = new Set(prev);
        for (const item of events) {
          if (item.agent) next.add(item.agent);
        }
        return [...next];
      });
      setKnownTiers((prev) => {
        const next = new Set([...DEFAULT_TIERS, ...prev]);
        for (const item of events) {
          if (item.tier) next.add(item.tier);
        }
        return [...next];
      });
    } catch {
      setDispatchEvents([]);
    }
  };

  const refresh = async (filterOverride?: ChangeActorFilter) => {
    const bridge = agentsBridge();
    const dBridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if ((!bridge && !dBridge) || !projectId) {
      setChanges([]);
      setDispatchEvents([]);
      setRunDetail(undefined);
      setDispatchRunDetail(undefined);
      setSelectedStepId("");
      setSelectedDispatchEventId("");
      return;
    }
    setBusy(true);
    try {
      const filter = filterOverride ?? actorFilter();
      const [rawChanges] = await Promise.all([
        bridge
          ? bridge.listChanges({
              projectId,
              limit: 50,
              ...(filter === "all" ? {} : { actorKind: filter }),
            })
          : Promise.resolve({ changes: [] }),
        refreshDispatchHistory(),
      ]);
      const nextChanges = mapProjectChanges(rawChanges);
      setChanges(nextChanges);
      // Keep the user's selection across refreshes; never auto-open the first change.
      const current = selectedStepId();
      const selected = nextChanges.find((change) => change.stepId === current);
      setSelectedStepId(selected?.stepId ?? "");
      if (selected?.agentRunId) await loadRunDetail(selected.agentRunId);
      else setRunDetail(undefined);
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load change history.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const filteredDispatchEvents = createMemo(() => {
    const agent = dispatchAgentFilter();
    const tier = dispatchTierFilter();
    return dispatchEvents().filter(
      (event) => (!agent || event.agent === agent) && (!tier || event.tier === tier),
    );
  });

  // The page stays mounted across project switches: drop the previous project's rows and reload.
  createEffect(
    on(
      () => props.projectId,
      () => {
        setChanges([]);
        setDispatchEvents([]);
        setSelectedStepId("");
        setSelectedDispatchEventId("");
        setRunDetail(undefined);
        setDispatchRunDetail(undefined);
        void refresh();
      },
      { defer: true },
    ),
  );

  onMount(() => void refresh());

  return (
    <EntityDetailHost>
      <PageToolbar.Root>
        <PageToolbar.Tabs>
          <Tabs
            items={[
              { id: "all", label: "All" },
              { id: "human", label: "Human" },
              { id: "agent", label: "Agent" },
            ]}
            value={actorFilter()}
            onChange={(value) => {
              const filter = value as ChangeActorFilter;
              setActorFilter(filter);
              void refresh(filter);
            }}
            aria-label="Activity actor"
          />
        </PageToolbar.Tabs>
        <PageToolbar.Actions>
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dispatch tier filter">
            <FilterChip
              selected={dispatchTierFilter() === ""}
              onClick={() => {
                setDispatchTierFilter("");
                void refreshDispatchHistory(dispatchAgentFilter(), "");
              }}
            >
              All tiers
            </FilterChip>
            <For each={knownTiers()}>
              {(tier) => (
                <FilterChip
                  selected={dispatchTierFilter() === tier}
                  onClick={() => {
                    const next = dispatchTierFilter() === tier ? "" : tier;
                    setDispatchTierFilter(next);
                    void refreshDispatchHistory(dispatchAgentFilter(), next);
                  }}
                >
                  {tier}
                </FilterChip>
              )}
            </For>
          </div>
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dispatch agent filter">
            <FilterChip
              selected={dispatchAgentFilter() === ""}
              onClick={() => {
                setDispatchAgentFilter("");
                void refreshDispatchHistory("", dispatchTierFilter());
              }}
            >
              All agents
            </FilterChip>
            <For each={knownAgents()}>
              {(agent) => (
                <FilterChip
                  selected={dispatchAgentFilter() === agent}
                  onClick={() => {
                    const next = dispatchAgentFilter() === agent ? "" : agent;
                    setDispatchAgentFilter(next);
                    void refreshDispatchHistory(next, dispatchTierFilter());
                  }}
                >
                  {agent}
                </FilterChip>
              )}
            </For>
          </div>
          <ToolbarIconButton label="Refresh" disabled={busy()} onClick={() => void refresh()}>
            <RefreshCw size={14} />
          </ToolbarIconButton>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <AgentRunHistoryCard
          changes={changes()}
          dispatchEvents={filteredDispatchEvents()}
          selectedStepId={selectedStepId()}
          selectedDispatchEventId={selectedDispatchEventId()}
          detail={runDetail()}
          dispatchRun={dispatchRunDetail()}
          busy={busy()}
          onSelect={(stepId, agentRunId) => {
            setSelectedDispatchEventId("");
            setDispatchRunDetail(undefined);
            setSelectedStepId(stepId);
            void loadRunDetail(agentRunId);
          }}
          onSelectDispatchEvent={(event) => {
            setSelectedStepId("");
            setRunDetail(undefined);
            setSelectedDispatchEventId(event.id);
            void loadDispatchRunSummary(event.runId);
          }}
          onClear={() => {
            setSelectedStepId("");
            setSelectedDispatchEventId("");
            setRunDetail(undefined);
            setDispatchRunDetail(undefined);
          }}
        />
      </PageContent>
    </EntityDetailHost>
  );
}
