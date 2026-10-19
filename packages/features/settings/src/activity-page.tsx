import { createEffect, createSignal, on, onMount } from "solid-js";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  Button,
  PageContent,
  PageToolbar,
  RefreshCw,
  pushToast,
} from "@polterware/frontend-design-system";
import type { AgentRunDetail, ProjectChangeRow } from "./agents-types";
import { agentsBridge, mapAgentRunDetail, mapProjectChanges } from "./agents-bridge";
import { AgentRunHistoryCard, type ChangeActorFilter } from "./agent-run-history-card";

/** Activity: the Unified Change History of justified project-model changes, across every surface. */
export function ActivityPage(props: { projectId: string }) {
  const [busy, setBusy] = createSignal(false);
  const [changes, setChanges] = createSignal<ProjectChangeRow[]>([]);
  const [actorFilter, setActorFilter] = createSignal<ChangeActorFilter>("all");
  const [selectedStepId, setSelectedStepId] = createSignal("");
  const [runDetail, setRunDetail] = createSignal<AgentRunDetail | undefined>();

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

  const refresh = async (filterOverride?: ChangeActorFilter) => {
    const bridge = agentsBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      setChanges([]);
      setRunDetail(undefined);
      setSelectedStepId("");
      return;
    }
    setBusy(true);
    try {
      const filter = filterOverride ?? actorFilter();
      const nextChanges = mapProjectChanges(await bridge.listChanges({
        projectId,
        limit: 50,
        ...(filter === "all" ? {} : { actorKind: filter }),
      }));
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

  // The page stays mounted across project switches: drop the previous project's rows and reload.
  createEffect(
    on(
      () => props.projectId,
      () => {
        setChanges([]);
        setSelectedStepId("");
        setRunDetail(undefined);
        void refresh();
      },
      { defer: true },
    ),
  );

  onMount(() => void refresh());

  return (
    <EntityDetailHost>
      <PageToolbar.Root>
        <PageToolbar.Leading>
          <span class="pw-page-toolbar-title">Activity</span>
        </PageToolbar.Leading>
        <PageToolbar.Actions>
          <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <PageContent class="flex min-h-0 flex-1 flex-col p-0">
        <AgentRunHistoryCard
          changes={changes()}
          selectedStepId={selectedStepId()}
          detail={runDetail()}
          actorFilter={actorFilter()}
          busy={busy()}
          onActorFilter={(filter) => {
            setActorFilter(filter);
            void refresh(filter);
          }}
          onSelect={(stepId, agentRunId) => {
            setSelectedStepId(stepId);
            void loadRunDetail(agentRunId);
          }}
          onClear={() => {
            setSelectedStepId("");
            setRunDetail(undefined);
          }}
        />
      </PageContent>
    </EntityDetailHost>
  );
}
