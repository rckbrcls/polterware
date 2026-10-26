import { For, Index, Show } from "solid-js";
import { Bot, Button, Copy, RefreshCw, IconTile, Skeleton, SwitchRow, StatusChip, Webhook, pushToast } from "@polterware/frontend-design-system";
import type { AgentSetupView, HookSwitchRow } from "./agents-types";
import { SettingsRow, SettingsSection } from "./settings-section";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function mapHookSwitches(raw: unknown): HookSwitchRow[] {
  return (Array.isArray(raw) ? raw : []).map((item) => {
    const hook = asRecord(item);
    return {
      name: asString(hook.name),
      label: asString(hook.label),
      note: asString(hook.note),
      // proto3 JSON omits false, so a missing value means the hook is off.
      enabled: hook.enabled === true,
    };
  });
}

export function mapAgentSetup(raw: unknown): AgentSetupView {
  const setup = asRecord(asRecord(raw).setup);
  return {
    hooks: mapHookSwitches(setup.hooks),
    polterwarePath: asString(setup.polterwarePath),
    claudePath: asString(setup.claudePath),
    pluginInstalled: setup.pluginInstalled === true,
    pluginEnabled: setup.pluginEnabled === true,
    pluginVersion: asString(setup.pluginVersion),
    embeddedVersion: asString(setup.embeddedVersion),
    problem: asString(setup.problem),
    skillReady: setup.skillReady === true,
    agentsLineReady: setup.agentsLineReady === true,
  };
}

type Check = { label: string; tone: "ok" | "warn"; state: string; hint?: string };

/** The setup doctor as rows: what is ready and the command that fixes what is not. */
export function setupChecks(setup: AgentSetupView): Check[] {
  const checks: Check[] = [
    setup.polterwarePath
      ? { label: "polterware on PATH", tone: "ok", state: "Found" }
      : { label: "polterware on PATH", tone: "warn", state: "Missing", hint: "Hooks skip themselves until it is on PATH." },
  ];
  if (!setup.claudePath) {
    checks.push({ label: "Claude Code", tone: "warn", state: "Not detected" });
  } else if (setup.problem) {
    checks.push({ label: "Claude plugin", tone: "warn", state: "Unreadable", hint: setup.problem });
  } else if (!setup.pluginInstalled) {
    checks.push({ label: "Claude plugin", tone: "warn", state: "Not installed", hint: "polterware setup claude" });
  } else if (setup.pluginVersion !== setup.embeddedVersion) {
    checks.push({
      label: "Claude plugin",
      tone: "warn",
      state: `${setup.pluginVersion} behind ${setup.embeddedVersion}`,
      hint: "polterware setup claude",
    });
  } else {
    checks.push({
      label: "Claude plugin",
      tone: setup.pluginEnabled ? "ok" : "warn",
      state: setup.pluginEnabled ? `${setup.pluginVersion} enabled` : `${setup.pluginVersion} disabled`,
      hint: setup.pluginEnabled ? undefined : "polterware setup claude --enable",
    });
  }
  checks.push(
    setup.skillReady
      ? { label: "Codex skill", tone: "ok", state: "Installed" }
      : { label: "Codex skill", tone: "warn", state: "Not installed", hint: "polterware setup codex" },
  );
  return checks;
}

async function copyCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command);
    pushToast("Command copied.", "success");
  } catch {
    pushToast("Could not copy command.", "danger");
  }
}

/** A command hint copies on click; a plain hint is read-only text. */
function looksLikeCommand(hint: string): boolean {
  return hint.startsWith("polterware ");
}

/** Agent setup: doctor state and per-hook switches. Installing runs through `polterware setup`. */
export function AgentSetupCard(props: {
  section: "setup" | "hooks";
  setup: AgentSetupView | undefined;
  loaded: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  onRefresh: () => void;
}) {
  const refresh = (
    <Button size="icon" variant="ghost" aria-label="Refresh" onClick={() => props.onRefresh()}>
      <RefreshCw size={14} aria-hidden />
    </Button>
  );
  return (
    <>
      <Show when={props.section === "setup"}>
        <SettingsSection
          title="Agent setup"
          action={refresh}
          description="What Claude Code and Codex need to read this project. Copy a fix and run it in your terminal."
        >
          <Show
            when={props.setup}
            fallback={
              <Show
                when={props.loaded}
                fallback={
                  <div class="flex flex-col gap-3" role="status" aria-label="Checking setup…">
                    <Skeleton class="h-3 w-[60%]" />
                    <Skeleton class="h-3 w-[45%]" />
                    <Skeleton class="h-3 w-[52%]" />
                  </div>
                }
              >
                <p class="m-0 text-[12px] text-[var(--color-text-muted)]">Setup state is unavailable.</p>
              </Show>
            }
          >
            {(setup) => (
              <For each={setupChecks(setup())}>
                {(check) => (
                  <SettingsRow
                    icon={Bot}
                    tone="identity"
                    seed={check.label}
                    label={check.label}
                    description={
                      check.hint && looksLikeCommand(check.hint)
                        ? <span class="font-mono pw-selectable">{check.hint}</span>
                        : check.hint
                    }
                  >
                    <Show when={check.hint && looksLikeCommand(check.hint) ? check.hint : undefined}>
                      {(command) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Copy ${command()}`}
                          onClick={() => void copyCommand(command())}
                        >
                          <Copy size={14} />
                          Copy fix
                        </Button>
                      )}
                    </Show>
                    <StatusChip tone={check.tone} label={check.state} />
                  </SettingsRow>
                )}
              </For>
            )}
          </Show>
        </SettingsSection>
      </Show>

      <Show when={props.section === "hooks"}>
        <SettingsSection
          title="Hooks"
          action={refresh}
          description="Claude Code hooks shipped with the Polterware plugin."
        >
          <Show
            when={(props.setup?.hooks.length ?? 0) > 0}
            fallback={<p class="m-0 text-[12px] text-[var(--color-text-muted)]">{!props.loaded ? "Checking hooks…" : props.setup ? "No hooks available." : "Hook state is unavailable."}</p>}
          >
            <div class="flex flex-col gap-1">
              {/* Index, not For: hooks are rebuilt on refresh, and For would replace each switch. */}
              <Index each={props.setup?.hooks ?? []}>
                {(hook) => (
                  <SwitchRow
                    checked={hook().enabled}
                    onCheckedChange={(checked) => props.onToggle(hook().name, checked)}
                    label={
                      <span class="flex items-center gap-3">
                        <IconTile size={24} tone="execution" seed={hook().name}>
                          <Webhook size={14} />
                        </IconTile>
                        <span class="flex flex-col">
                          <span class="text-[12.5px] text-[var(--color-text-primary)]">{hook().label}</span>
                          <Show when={hook().note}>
                            <span class="text-[11.5px] text-[var(--color-text-muted)]">{hook().note}</span>
                          </Show>
                        </span>
                      </span>
                    }
                  />
                )}
              </Index>
            </div>
          </Show>
        </SettingsSection>
      </Show>
    </>
  );
}
