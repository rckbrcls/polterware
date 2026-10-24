import { Match, Switch, Show, createEffect, createSignal, on } from "solid-js";
import { Button, RefreshCw, pushToast } from "@polterware/frontend-design-system";
import type {
  AgentSetupView,
  CompilePreviewResult,
  DriftPreviewResult,
  McpStatusView,
} from "./agents-types";
import {
  agentsBridge,
  mapCompileResult,
  mapDriftResult,
  mapMcpStatus,
  workQuery,
} from "./agents-bridge";
import { AgentSetupCard, mapAgentSetup, mapHookSwitches } from "./agent-setup-card";
import { CompilePreviewCard } from "./compile-preview-card";
import { DriftPreviewCard } from "./drift-preview-card";
import { McpStatusCard } from "./mcp-status-card";
import { OraclePreviewCard } from "./oracle-preview-card";
import { SettingsSection } from "./settings-section";
import { SkillCard } from "./skill-card";

export type AgentsSettingsTab = "mcp" | "setup" | "hooks" | "skill" | "oracle" | "compile" | "drift";

/** Agents inside the Settings dialog: MCP access and context/drift previews. */
export function AgentsSettingsPanel(props: { projectId: string; tab: AgentsSettingsTab }) {
  const [mcpStatus, setMcpStatus] = createSignal<McpStatusView | undefined>();
  const [mcpBusy, setMcpBusy] = createSignal(false);
  const [query, setQuery] = createSignal("architecture");
  const [entityId, setEntityId] = createSignal("");
  const [budget, setBudget] = createSignal("1200");
  const [compileBusy, setCompileBusy] = createSignal(false);
  const [compileResult, setCompileResult] = createSignal<CompilePreviewResult | undefined>();
  const [compileError, setCompileError] = createSignal<string | undefined>();
  const [driftBusy, setDriftBusy] = createSignal(false);
  const [driftResult, setDriftResult] = createSignal<DriftPreviewResult | undefined>();
  const [driftError, setDriftError] = createSignal<string | undefined>();

  const [setupView, setSetupView] = createSignal<AgentSetupView | undefined>();
  const [setupLoaded, setSetupLoaded] = createSignal(false);

  // The panel stays mounted across project switches: drop the previous project's
  // views so the cards show their loading state. The setup effect below
  // refetches on its own because it reads projectId.
  createEffect(
    on(
      () => props.projectId,
      () => {
        setSetupView(undefined);
        setSetupLoaded(false);
        setCompileResult(undefined);
        setDriftResult(undefined);
      },
      { defer: true },
    ),
  );

  type SetupBridge = {
    getAgentSetup?: (payload: { projectId: string }) => Promise<unknown>;
    setHookSwitch?: (payload: { name: string; enabled: boolean }) => Promise<unknown>;
  };
  const setupBridge = () =>
    (globalThis as { polterware?: { core?: { context?: SetupBridge } } }).polterware?.core?.context;

  const refreshSetup = async () => {
    const get = setupBridge()?.getAgentSetup;
    if (!get) {
      setSetupLoaded(true);
      return;
    }
    try {
      setSetupView(mapAgentSetup(await get({ projectId: props.projectId.trim() })));
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not read agent setup.", "danger");
    } finally {
      setSetupLoaded(true);
    }
  };

  const toggleHook = async (name: string, enabled: boolean) => {
    const set = setupBridge()?.setHookSwitch;
    if (!set) return;
    try {
      const response = (await set({ name, enabled })) as { hooks?: unknown } | undefined;
      const hooks = mapHookSwitches(response?.hooks);
      setSetupView((current) => (current ? { ...current, hooks } : current));
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not save the hook switch.", "danger");
    }
  };

  createEffect(() => {
    if (props.tab === "setup" || props.tab === "hooks") void refreshSetup();
  });

  const refreshMcp = async () => {
    const bridge = agentsBridge();
    if (!bridge) {
      pushToast("MCP controls are unavailable in this session.", "danger");
      return;
    }
    setMcpBusy(true);
    try {
      setMcpStatus(mapMcpStatus(await bridge.getMcpStatus()));
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not read MCP status.", "danger");
    } finally {
      setMcpBusy(false);
    }
  };

  const startMcp = () => {
    const bridge = agentsBridge();
    if (!bridge) {
      pushToast("MCP controls are unavailable in this session.", "danger");
      return;
    }
    setMcpBusy(true);
    void bridge.startMcp()
      .then((status) => {
        setMcpStatus(mapMcpStatus(status));
        pushToast("MCP helper started.", "success");
      })
      .catch((error: unknown) => {
        pushToast(error instanceof Error ? error.message : "Could not start MCP.", "danger");
      })
      .finally(() => setMcpBusy(false));
  };

  const stopMcp = () => {
    const bridge = agentsBridge();
    if (!bridge) {
      pushToast("MCP controls are unavailable in this session.", "danger");
      return;
    }
    setMcpBusy(true);
    void bridge.stopMcp()
      .then((status) => {
        setMcpStatus(mapMcpStatus(status));
        pushToast("MCP helper stopped.", "success");
      })
      .catch((error: unknown) => {
        pushToast(error instanceof Error ? error.message : "Could not stop MCP.", "danger");
      })
      .finally(() => setMcpBusy(false));
  };

  const runCompile = () => {
    const bridge = agentsBridge();
    const projectId = props.projectId.trim();
    if (!bridge) {
      setCompileError("Context compiler is unavailable in this session.");
      return;
    }
    if (!projectId) {
      setCompileError("Select a project before compiling context.");
      return;
    }
    setCompileBusy(true);
    setCompileError(undefined);
    const tokenBudget = Number.parseInt(budget(), 10);
    const trimmedEntityId = entityId().trim();
    void bridge.compileContext({
      projectId,
      query: query().trim(),
      ...(trimmedEntityId ? { entityId: trimmedEntityId } : {}),
      tokenBudget: Number.isFinite(tokenBudget) && tokenBudget > 0 ? tokenBudget : 1200,
    })
      .then((response) => {
        setCompileResult(mapCompileResult(response));
      })
      .catch((error: unknown) => {
        setCompileResult(undefined);
        setCompileError(error instanceof Error ? error.message : "Compile failed.");
      })
      .finally(() => setCompileBusy(false));
  };

  const runDrift = () => {
    const bridge = agentsBridge();
    const projectId = props.projectId.trim();
    if (!bridge) {
      setDriftError("Drift checker is unavailable in this session.");
      return;
    }
    if (!projectId) {
      setDriftError("Select a project before checking drift.");
      return;
    }
    setDriftBusy(true);
    setDriftError(undefined);
    const trimmedEntityId = entityId().trim();
    void bridge.checkDrift({
      projectId,
      ...(trimmedEntityId ? { entityId: trimmedEntityId } : {}),
    })
      .then((response) => {
        setDriftResult(mapDriftResult(response));
      })
      .catch((error: unknown) => {
        setDriftResult(undefined);
        setDriftError(error instanceof Error ? error.message : "Drift check failed.");
      })
      .finally(() => setDriftBusy(false));
  };

  createEffect(() => {
    if (props.tab === "mcp") void refreshMcp();
  });

  const refreshCurrent = () => {
    if (props.tab === "mcp") void refreshMcp();
    else void refreshSetup();
  };

  return (
    <div class="flex flex-col gap-6 text-[12.5px]">
      <Switch>
        <Match when={props.tab === "mcp"}>
          <McpStatusCard
            status={mcpStatus()}
            busy={mcpBusy()}
            onStart={() => startMcp()}
            onStop={() => stopMcp()}
          />
        </Match>
        <Match when={props.tab === "setup" || props.tab === "hooks"}>
          <AgentSetupCard
            section={props.tab === "hooks" ? "hooks" : "setup"}
            setup={setupView()}
            loaded={setupLoaded()}
            onToggle={(name, enabled) => void toggleHook(name, enabled)}
          />
        </Match>
        <Match when={props.tab === "skill"}>
          <SkillCard />
        </Match>

        <Match when={props.tab === "oracle"}>
          <SettingsSection
            title="Oracle"
            description="The exact text an agent receives for one node, card, or title."
          >
            <OraclePreviewCard projectId={props.projectId} query={workQuery()} />
          </SettingsSection>
        </Match>
        <Match when={props.tab === "compile"}>
          <SettingsSection
            title="Compile context"
            description="The ranked context package an agent gets for a query, within a token budget."
          >
            <CompilePreviewCard
              query={query()}
              entityId={entityId()}
              budget={budget()}
              busy={compileBusy()}
              result={compileResult()}
              error={compileError()}
              onQueryChange={setQuery}
              onEntityIdChange={setEntityId}
              onBudgetChange={setBudget}
              onCompile={() => runCompile()}
            />
          </SettingsSection>
        </Match>
        <Match when={props.tab === "drift"}>
          <SettingsSection
            title="Drift check"
            description="The narrow drift checker over the project model. Findings are advisory."
          >
            <DriftPreviewCard
              entityId={entityId()}
              busy={driftBusy()}
              result={driftResult()}
              error={driftError()}
              onEntityIdChange={setEntityId}
              onCheck={() => runDrift()}
            />
          </SettingsSection>
        </Match>
      </Switch>
      <Show when={props.tab === "mcp" || props.tab === "setup" || props.tab === "hooks"}>
        <div class="flex justify-end">
          <Button size="sm" variant="ghost" disabled={props.tab === "mcp" && mcpBusy()} onClick={refreshCurrent}>
            <RefreshCw size={14} aria-hidden />
            Refresh
          </Button>
        </div>
      </Show>
    </div>
  );
}
