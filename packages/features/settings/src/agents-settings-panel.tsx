import { Match, Switch, Show, createEffect, createSignal, on } from "solid-js";
import { Button, pushToast } from "@polterware/frontend-design-system";
import type { AgentSetupView, McpStatusView } from "./agents-types";
import { agentsBridge, mapMcpStatus } from "./agents-bridge";
import { AgentSetupCard, mapAgentSetup, mapHookSwitches } from "./agent-setup-card";
import { McpStatusCard } from "./mcp-status-card";
import { SkillCard } from "./skill-card";

export type AgentsSettingsTab = "mcp" | "setup" | "hooks" | "skill";

/** Agents inside the Settings dialog: MCP access, agent setup, hooks, and the skill. */
export function AgentsSettingsPanel(props: { projectId: string; tab: AgentsSettingsTab }) {
  const [mcpStatus, setMcpStatus] = createSignal<McpStatusView | undefined>();
  const [mcpBusy, setMcpBusy] = createSignal(false);

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

  createEffect(() => {
    if (props.tab === "mcp") void refreshMcp();
  });

  return (
    <div class="flex flex-col gap-6 text-[12.5px]">
      <Switch>
        <Match when={props.tab === "mcp"}>
          <McpStatusCard
            status={mcpStatus()}
            busy={mcpBusy()}
            onStart={() => startMcp()}
            onStop={() => stopMcp()}
            onRefresh={() => void refreshMcp()}
          />
        </Match>
        <Match when={props.tab === "setup" || props.tab === "hooks"}>
          <AgentSetupCard
            section={props.tab === "hooks" ? "hooks" : "setup"}
            setup={setupView()}
            loaded={setupLoaded()}
            onToggle={(name, enabled) => void toggleHook(name, enabled)}
            onRefresh={() => void refreshSetup()}
          />
        </Match>
        <Match when={props.tab === "skill"}>
          <SkillCard />
        </Match>

      </Switch>
    </div>
  );
}
