import { Show } from "solid-js";
import { Button, Cpu, Database, Plug, RefreshCw, SourceCodeIcon, StatusChip, pushToast } from "@polterware/frontend-design-system";
import type { McpStatusView } from "./agents-types";
import { SettingsRow, SettingsSection } from "./settings-section";

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast(`${label} copied.`, "success");
  } catch {
    pushToast(`Could not copy ${label.toLowerCase()}.`, "danger");
  }
}

function truncatePath(path: string, max = 56): string {
  if (!path || path.length <= max) return path || "—";
  return `…${path.slice(-(max - 1))}`;
}

/** Local MCP helper: lifecycle, process metadata, and client config to copy. */
export function McpStatusCard(props: {
  status: McpStatusView | undefined;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  const status = () => props.status;
  const running = () => Boolean(status()?.running);

  return (
    <SettingsSection
      title="MCP server"
      description="A local helper that lets MCP clients read and write this project through the core."
      action={
        <Button size="icon" variant="ghost" aria-label="Refresh" disabled={props.busy} onClick={() => props.onRefresh()}>
          <RefreshCw size={14} aria-hidden />
        </Button>
      }
    >
      <SettingsRow icon={Plug} tone="integration" seed="mcp-helper" label="Local MCP helper">
        <Show when={status()} fallback={<StatusChip tone="muted" label="Checking" />}>
          <StatusChip tone={running() ? "ok" : "muted"} label={running() ? "Running" : "Stopped"} />
        </Show>
        <Show
          when={running()}
          fallback={
            <Button size="sm" variant="primary" disabled={props.busy || !status()} onClick={() => props.onStart()}>
              Start
            </Button>
          }
        >
          <Button size="sm" disabled={props.busy} onClick={() => props.onStop()}>
            Stop
          </Button>
        </Show>
      </SettingsRow>

      <SettingsRow icon={Cpu} seed="mcp-process" label="Process">
        <span class="font-mono pw-selectable text-[12px] text-[var(--color-text-secondary)]">
          {status()?.pid ? `PID ${status()?.pid}` : "—"}
        </span>
      </SettingsRow>

      <SettingsRow icon={Database} tone="data" seed="mcp-database" label="Database">
        <span
          class="max-w-[20rem] truncate font-mono pw-selectable text-[12px] text-[var(--color-text-secondary)]"
          title={status()?.dbPath}
        >
          {truncatePath(status()?.dbPath ?? "")}
        </span>
      </SettingsRow>

      <SettingsRow icon={SourceCodeIcon} seed="mcp-client" label="Connect a client" description="Paste into your agent's MCP settings.">
        <Button
          size="sm"
          variant="ghost"
          disabled={!status()?.command}
          onClick={() => void copyText("Command", status()?.command ?? "")}
        >
          Copy command
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!status()?.cursorConfig}
          onClick={() => void copyText("Cursor config", status()?.cursorConfig ?? "")}
        >
          Copy Cursor config
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}
