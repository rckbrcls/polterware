import { Show, type JSX } from "solid-js";
import { PageToolbar, Tabs } from "@polterware/frontend-design-system";
import { AgentsSettingsPanel } from "./agents-settings-panel";
import { CoreCard } from "./core-card";

/** The Core route: agent setup, hooks, and skill; the MCP helper and local core; and the CLI reference. */
export function AiIntegrationsPanel(props: {
  projectId: string;
  tab?: string;
  onTabChange?: (tab: string) => void;
  /** Renders the CLI reference tab; receives the tab strip for its own toolbar. */
  cliPage?: (tabs: JSX.Element) => JSX.Element;
}) {
  const tab = () => (props.tab === "server" || props.tab === "cli" ? props.tab : "agents");
  const tabStrip = () => (
    <Tabs
      items={[
        { id: "agents", label: "Agents" },
        { id: "server", label: "Server" },
        { id: "cli", label: "CLI reference" },
      ]}
      value={tab()}
      onChange={(value) => props.onTabChange?.(value)}
      aria-label="Core"
    />
  );

  return (
    <Show when={tab() !== "cli"} fallback={props.cliPage?.(tabStrip())}>
      <PageToolbar.Root>
        <PageToolbar.Tabs>{tabStrip()}</PageToolbar.Tabs>
      </PageToolbar.Root>
      <div class="flex flex-col gap-6 p-4 text-[12.5px]">
        <Show when={tab() === "agents"}>
          <AgentsSettingsPanel projectId={props.projectId} tab="setup" />
          <AgentsSettingsPanel projectId={props.projectId} tab="hooks" />
          <AgentsSettingsPanel projectId={props.projectId} tab="skill" />
        </Show>
        <Show when={tab() === "server"}>
          <AgentsSettingsPanel projectId={props.projectId} tab="mcp" />
          <CoreCard />
        </Show>
      </div>
    </Show>
  );
}
