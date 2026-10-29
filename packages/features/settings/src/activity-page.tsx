import { createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import {
  dispatchBridge,
  mapDispatchHistory,
  mapDispatchRun,
  type DispatchRunEventView,
  type DispatchRunView,
} from "@polterware/feature-dispatch";
import { EntityDetailHost, createPageFilters, type EnvironmentItem, type ScopeFilterToken, type ScopeNodeItem } from "@polterware/feature-shell";
import {
  FilterPopover,
  ActiveFilterBar,
  PageContent,
  PageToolbar,
  Tabs,
  pushToast,
  matchClauses,
  type FilterField,
} from "@polterware/frontend-design-system";
import type { AgentRunDetail, ProjectChangeRow } from "./agents-types";
import { agentsBridge, mapAgentRunDetail, mapProjectChanges } from "./agents-bridge";
import { AgentRunHistoryCard, type ChangeActorFilter } from "./agent-run-history-card";

const DEFAULT_TIERS = ["easy", "normal", "hard"] as const;

/** Activity: the Unified Change History of justified project-model changes, across every surface. */
export function ActivityPage(props: {
  projectId: string;
  /** Expanded Atlas node ids. Empty leaves the change list unscoped. */
  scopeNodes?: readonly string[];
  loadChanges?: (
    projectId: string,
    filter: { actorKind?: string; limit?: number },
  ) => Promise<unknown>;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeCatalogNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [changes, setChanges] = createSignal<ProjectChangeRow[]>([]);
  const [dispatchEvents, setDispatchEvents] = createSignal<DispatchRunEventView[]>([]);
  const [knownAgents, setKnownAgents] = createSignal<string[]>([]);
  const [knownTiers, setKnownTiers] = createSignal<string[]>([...DEFAULT_TIERS]);
  const [actorFilter, setActorFilter] = createSignal<ChangeActorFilter>("all");
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

  /** Dispatch history is fetched unfiltered and narrowed by the page's clauses, so `is not` works. */
  const refreshDispatchHistory = async () => {
    const dBridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if (!dBridge || !projectId) {
      setDispatchEvents([]);
      return;
    }
    try {
      const events = mapDispatchHistory(
        await dBridge.listHistory({
          projectId,
          limit: 200,
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

  let refreshTicket = 0;
  const refresh = async (filterOverride?: ChangeActorFilter) => {
    const ticket = ++refreshTicket;
    const bridge = agentsBridge();
    const dBridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if ((!bridge && !dBridge && !props.loadChanges) || !projectId) {
      setChanges([]);
      setDispatchEvents([]);
      setRunDetail(undefined);
      setDispatchRunDetail(undefined);
      setSelectedStepId("");
      setSelectedDispatchEventId("");
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const filter = filterOverride ?? actorFilter();
      const request = {
        limit: 50,
        ...(filter === "all" ? {} : { actorKind: filter }),
      };
      const scopeNodes = [...(props.scopeNodes ?? [])];
      const [rawChanges] = await Promise.all([
        props.loadChanges
          ? props.loadChanges(projectId, request)
          : bridge
            ? bridge.listChanges({
                projectId,
                ...request,
                ...(scopeNodes.length > 0 ? { scopeNodes } : {}),
              })
            : Promise.resolve({ changes: [] }),
        refreshDispatchHistory(),
      ]);
      if (ticket !== refreshTicket) return;
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
      if (ticket === refreshTicket) setBusy(false);
    }
  };

  const fields = (): FilterField[] => [
    {
      id: "tier",
      label: "Tier",
      kind: "multi",
      options: knownTiers().map((tier) => ({ id: tier, label: tier })),
    },
    {
      id: "agent",
      label: "Agent",
      kind: "multi",
      options: knownAgents().map((agent) => ({ id: agent, label: agent })),
    },
  ];
  const filters = createPageFilters({
    surface: "activity",
    fields,
    scope: {
      tokens: () => props.scopeTokens ?? [],
      nodes: () => props.scopeCatalogNodes ?? [],
      environments: () => props.scopeEnvironments ?? [],
      allowEnv: true,
      onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
    },
  });

  const filteredDispatchEvents = createMemo(() =>
    dispatchEvents().filter((event) =>
      matchClauses(event, filters.pageClauses(), { tier: (item) => item.tier, agent: (item) => item.agent }),
    ),
  );

  // The page stays mounted across project switches: drop the previous project's rows and reload.
  createEffect(
    on(
      () => [props.projectId, (props.scopeNodes ?? []).join("\0")] as const,
      (next, prev) => {
        if (!prev || next[0] !== prev[0]) {
          setChanges([]);
          setDispatchEvents([]);
          setSelectedStepId("");
          setSelectedDispatchEventId("");
          setRunDetail(undefined);
          setDispatchRunDetail(undefined);
        }
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
          <FilterPopover
            ariaLabel="Activity filters"
            title="Filter activity"
            shortcut
            fields={filters.fields()}
            clauses={filters.clauses()}
            onClausesChange={filters.onClausesChange}
            saved={filters.saved()}
          />
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <ActiveFilterBar
        fields={filters.fields()}
        clauses={filters.clauses()}
        onClausesChange={filters.onClausesChange}
        saved={filters.saved()}
      />
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
