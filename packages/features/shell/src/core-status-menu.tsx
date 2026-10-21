import { For, Show, createSignal } from "solid-js";
import {
  Button,
  Copy,
  FileText,
  Play,
  Popover,
  Server,
  Square,
  StatusChip,
  Tooltip,
  type StatusTone,
} from "@polterware/frontend-design-system";
import "./core-status-menu.css";

export type LocalCoreState = "running" | "stopped" | "starting" | "stopping" | "error";

export type LocalCoreStatus = {
  state: LocalCoreState;
  pid: number | null;
  endpoint: string | null;
  dbPath: string;
  logPath: string;
  error: string | null;
};

export type CoreStatusMenuProps = {
  status: LocalCoreStatus | null;
  onStart: () => void | Promise<unknown>;
  onStop: () => void | Promise<unknown>;
  onRestart: () => void | Promise<unknown>;
  onRevealLogs: () => void | Promise<unknown>;
  onCopy?: (text: string) => void | Promise<unknown>;
};

const STATE_LABEL: Record<LocalCoreState, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  error: "Error",
};

const STATE_TONE: Record<LocalCoreState, StatusTone> = {
  running: "ok",
  stopped: "muted",
  starting: "warn",
  stopping: "warn",
  error: "danger",
};

export function CoreStatusMenu(props: CoreStatusMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);
  let triggerRef: HTMLButtonElement | undefined;

  const state = (): LocalCoreState => props.status?.state ?? "stopped";
  const transitioning = () => state() === "starting" || state() === "stopping";

  async function run(action: () => void | Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
    }
  }

  const details = () => {
    const status = props.status;
    if (!status) return [];
    return [
      { label: "PID", value: status.pid === null ? "—" : String(status.pid), copyable: false },
      { label: "Endpoint", value: status.endpoint ?? "—", copyable: true },
      { label: "Database", value: status.dbPath, copyable: false },
    ];
  };

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger
          asChild={(triggerProps) => (
            <Button
              variant="texture"
              size="icon"
              class="!h-[var(--control-height-md)] !w-[var(--control-height-md)]"
              {...triggerProps({
                "aria-label": `Local core: ${STATE_LABEL[state()].toLowerCase()}`,
                "aria-expanded": open(),
                onClick: () => setOpen((value) => !value),
              })}
              ref={(el) => {
                triggerRef = el;
              }}
            >
              <Server size={14} />
              <span class="pw-core-dot" data-state={state()} aria-hidden />
            </Button>
          )}
        />
        <Tooltip.Content>{`Local core (${STATE_LABEL[state()].toLowerCase()})`}</Tooltip.Content>
      </Tooltip.Root>

      <Popover
        open={open()}
        onClose={() => setOpen(false)}
        title="Local core"
        width={340}
        placement="bottom-end"
        anchorRef={() => triggerRef}
      >
        <div class="flex flex-col gap-4 p-4 text-[13px]">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-[var(--color-text-primary)]">Local core</span>
            <StatusChip tone={STATE_TONE[state()]} label={STATE_LABEL[state()]} />
          </div>

          <dl class="m-0 flex flex-col gap-1.5">
            <For each={details()}>
              {(row) => (
                <div class="flex min-h-6 items-center justify-between gap-3">
                  <dt class="shrink-0 text-[var(--color-text-secondary)]">{row.label}</dt>
                  <dd class="m-0 flex min-w-0 items-center justify-end gap-1.5 text-[var(--color-text-primary)]">
                    <span class="min-w-0 truncate" title={row.value}>
                      {row.value}
                    </span>
                    <Show when={row.copyable && props.status?.endpoint && props.onCopy}>
                      <Button
                        variant="icon"
                        class="!h-6 !w-6"
                        aria-label="Copy endpoint"
                        onClick={() => {
                          const endpoint = props.status?.endpoint;
                          if (endpoint) void run(() => props.onCopy?.(endpoint));
                        }}
                      >
                        <Copy size={12} />
                      </Button>
                    </Show>
                  </dd>
                </div>
              )}
            </For>
          </dl>

          <Show when={actionError() ?? props.status?.error}>
            {(message) => (
              <p role="alert" class="m-0 text-[12px] text-[var(--color-danger)]">
                {message()}
              </p>
            )}
          </Show>

          <div class="flex flex-col gap-2">
            <Button
              size="sm"
              class="w-full"
              disabled={transitioning()}
              onClick={() => void run(state() === "running" ? props.onStop : props.onStart)}
            >
              <Show
                when={state() === "running" || state() === "stopping"}
                fallback={
                  <>
                    <Play size={12} />
                    {state() === "starting" ? "Starting" : "Start"}
                  </>
                }
              >
                <Square size={12} />
                {state() === "stopping" ? "Stopping" : "Stop"}
              </Show>
            </Button>
            <Button size="sm" variant="ghost" class="w-full" onClick={() => void run(props.onRevealLogs)}>
              <FileText size={12} />
              Show logs
            </Button>
          </div>
        </div>
      </Popover>
    </>
  );
}
