import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  Button,
  Copy,
  Dialog,
  IconTile,
  RefreshCw,
  Surface,
  StatusChip,
  pushToast,
} from "@polterware/frontend-design-system";
import {
  TerminalEmulator,
  type CliConnectionState,
  type WorkspaceCatalogProvider,
} from "@polterware/feature-shell";
import { NodeIcon } from "@polterware/feature-architecture/icons";
import { providerIconKey } from "./provider-icon";
import { cliStateLabel, cliStateTone, providerByName } from "./setup-wizard-helpers";
import {
  AUTH_DEFAULT_COLS,
  AUTH_DEFAULT_ROWS,
  beginAuthPlan,
  closeAuthTerminal,
  createAuthTerminalSession,
  probeAuthStatus,
  readAuthTerminalOutput,
  resizeAuthTerminal,
  startAuthCommand,
  startAuthProbeLoop,
  writeAuthTerminal,
  type AuthIntegrationsBridge,
  type AuthTerminalBridge,
} from "./setup-wizard-auth-session";

function bridge() {
  return (globalThis as unknown as {
    polterware: {
      core: {
        integrations: AuthIntegrationsBridge;
        terminals: AuthTerminalBridge;
      };
      app: {
        openExternal: (url: string) => Promise<unknown>;
      };
    };
  }).polterware;
}

function core() {
  return bridge().core;
}

export function ConnectProviderDialog(props: {
  open: boolean;
  projectId?: string;
  providerName?: string;
  providers?: WorkspaceCatalogProvider[];
  onClose: () => void;
  onFinish?: (provider: WorkspaceCatalogProvider) => void;
}) {
  // Keep the last provider through the shared dialog's exit and focus restoration.
  const provider = createMemo<WorkspaceCatalogProvider | undefined>((previous) =>
    props.open ? providerByName(props.providers ?? [], props.providerName) ?? (props.providers ?? [])[0] : previous,
  );
  const [state, setState] = createSignal<CliConnectionState>("ready");
  const [lines, setLines] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [accountLabel, setAccountLabel] = createSignal("");
  const [docsUrl, setDocsUrl] = createSignal("");
  const [sessionId, setSessionId] = createSignal<string | null>(null);

  let stopProbe: (() => void) | undefined;
  let activeSessionId: string | null = null;
  let generation = 0;

  function stopAuthProbe() {
    stopProbe?.();
    stopProbe = undefined;
  }

  async function disposeAuthSession() {
    stopAuthProbe();
    const id = activeSessionId;
    activeSessionId = null;
    setSessionId(null);
    if (id) await closeAuthTerminal(core().terminals, id);
  }

  onCleanup(() => {
    generation += 1;
    void disposeAuthSession();
  });

  async function probeCurrent() {
    const current = provider();
    if (!current || !props.open) return;
    const requestGeneration = generation;
    setBusy(true);
    try {
      const result = await probeAuthStatus(core().integrations, current.id);
      if (requestGeneration !== generation) return;
      setAccountLabel(result.accountLabel);
      setState(result.status);
      setLines([]);
      if (result.status === "cli-unavailable" && !docsUrl()) {
        try {
          const plan = await beginAuthPlan(core().integrations, current.id);
          if (requestGeneration === generation) setDocsUrl(plan.docsUrl);
        } catch {
          /* the install button stays inert without a docs url */
        }
      }
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      setState("failed");
      setLines([
        `Could not probe ${current.name}.`,
        error instanceof Error ? error.message : "Probe failed.",
      ]);
    } finally {
      if (requestGeneration === generation) setBusy(false);
    }
  }

  createEffect((previous?: string) => {
    const open = props.open;
    const providerId = provider()?.id;
    const key = `${open}:${providerId ?? ""}`;
    if (key === previous) return key;
    generation += 1;
    void disposeAuthSession();
    if (!open || !providerId) return key;
    setState("ready");
    setLines([]);
    setAccountLabel("");
    setDocsUrl("");
    void probeCurrent();
    return key;
  });

  async function startAuthentication() {
    const current = provider();
    const projectId = props.projectId?.trim();
    if (!current || !props.open) return;
    const requestGeneration = generation;
    if (!projectId) {
      pushToast("Open a local project before starting CLI login.", "danger");
      return;
    }

    setBusy(true);
    setState("authenticating");
    await disposeAuthSession();
    if (requestGeneration !== generation) return;

    try {
      const plan = await beginAuthPlan(core().integrations, current.id);
      if (requestGeneration !== generation) return;
      const command = plan.authCommand || current.authCommands[0] || current.binary;
      setDocsUrl(plan.docsUrl);
      setLines([]);

      const id = await createAuthTerminalSession({
        terminals: core().terminals,
        projectId,
        providerId: current.id,
        cols: AUTH_DEFAULT_COLS,
        rows: AUTH_DEFAULT_ROWS,
      });
      if (requestGeneration !== generation) {
        await closeAuthTerminal(core().terminals, id);
        return;
      }
      activeSessionId = id;
      setSessionId(id);

      await startAuthCommand({
        terminals: core().terminals,
        sessionId: id,
        authCommand: command,
      });

      if (requestGeneration !== generation) return;
      stopProbe = startAuthProbeLoop({
        integrations: core().integrations,
        providerId: current.id,
        handlers: {
          onSnapshot: (snapshot) => {
            if (snapshot.accountLabel) setAccountLabel(snapshot.accountLabel);
          },
          onConnected: (snapshot) => {
            setState("connected");
            setAccountLabel(snapshot.accountLabel || current.name);
            setBusy(false);
            pushToast(`${current.name} CLI session detected.`, "success");
          },
          onUnavailable: (snapshot) => {
            setState("cli-unavailable");
            setBusy(false);
            pushToast(snapshot.message || `${current.binary} is not available on PATH.`, "danger");
          },
          onTimeout: () => {
            setState("failed");
            setBusy(false);
            pushToast(`${current.name} login timed out. Try again or refresh status.`, "danger");
            void disposeAuthSession();
          },
        },
      });

      pushToast(`Complete ${current.name} login in the terminal below.`, "default");
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      await disposeAuthSession();
      if (requestGeneration !== generation) return;
      setState("failed");
      setLines([
        `Could not start authentication for ${current.name}.`,
        error instanceof Error ? error.message : "Begin auth failed.",
      ]);
      pushToast(error instanceof Error ? error.message : "Could not start CLI login.", "danger");
    } finally {
      if (requestGeneration === generation) setBusy(false);
    }
  }

  async function refreshAndConnect() {
    const current = provider();
    if (!current || !props.open) return;
    const requestGeneration = generation;
    setBusy(true);
    try {
      const result = await probeAuthStatus(core().integrations, current.id);
      if (requestGeneration !== generation) return;
      const label = result.accountLabel || current.name;
      setAccountLabel(result.accountLabel);
      if (result.status === "cli-unavailable") {
        setState("cli-unavailable");
        pushToast(`${current.binary} is not available on PATH.`, "danger");
        return;
      }
      if (result.status !== "connected") {
        setState(state() === "authenticating" ? "authenticating" : "ready");
        pushToast("CLI is available, but no authenticated session was detected yet.", "default");
        return;
      }
      stopAuthProbe();
      setState("connected");
      pushToast(`${current.name} connection ready.`, "success");
      await disposeAuthSession();
      if (requestGeneration !== generation) return;
      props.onFinish?.({
        ...current,
        state: "connected",
        name: label || current.name,
      });
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      setState("failed");
      pushToast(error instanceof Error ? error.message : "Could not refresh connection status.", "danger");
    } finally {
      if (requestGeneration === generation) setBusy(false);
    }
  }

  async function openDocs() {
    const url = docsUrl();
    if (!url) return;
    try {
      await bridge().app.openExternal(url);
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not open documentation.", "danger");
    }
  }

  function closeDialog() {
    generation += 1;
    void disposeAuthSession();
    props.onClose();
  }

  async function copyCommand() {
    const command = provider()?.authCommands[0] || provider()?.binary;
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      pushToast("Login command copied.", "success");
    } catch {
      pushToast("Could not copy login command.", "danger");
    }
  }

  return (
    <Show when={provider()}>
      {(current) => (
        <Dialog
          open={props.open}
          title={`Connect ${current().name}`}
          titleLeading={
            <IconTile size={28} tone="integration" brand={[current().name, providerIconKey(current())]} seed={current().id}>
              <NodeIcon name={providerIconKey(current())} size={16} brand={false} />
            </IconTile>
          }
          size="lg"
          onClose={closeDialog}
          footer={
            <>
              <Button size="sm" variant="ghost" keepVariant disabled={busy()} aria-label="Refresh status" onClick={() => void probeCurrent()}>
                <RefreshCw size={14} aria-hidden /> Refresh
              </Button>
              <Show
                when={state() !== "connected"}
                fallback={
                  <Button size="sm" variant="texture" textureTone="brand" disabled={busy()} onClick={() => void refreshAndConnect()}>
                    Done
                  </Button>
                }
              >
                <Show
                  when={state() === "cli-unavailable"}
                  fallback={
                    <Button
                      size="sm"
                      variant="texture"
                      textureTone="brand"
                      disabled={busy() || !props.projectId}
                      onClick={() => void startAuthentication()}
                    >
                      {sessionId() ? "Restart login" : "Log in"}
                    </Button>
                  }
                >
                  <Button size="sm" variant="texture" textureTone="brand" disabled={busy()} onClick={() => void openDocs()}>
                    Install {current().binary}
                  </Button>
                </Show>
              </Show>
            </>
          }
        >
          <div class="flex min-h-0 flex-col gap-3">
            <div class="flex items-center gap-2">
              <StatusChip tone={cliStateTone(state())} label={cliStateLabel(state())} />
              <span class="min-w-0 truncate font-mono text-[12px] text-[var(--color-text-muted)]">
                {accountLabel() || current().authCommands[0] || current().binary}
              </span>
              <Button size="icon" variant="ghost" class="ml-auto" aria-label="Copy login command" onClick={() => void copyCommand()}>
                <Copy size={14} aria-hidden />
              </Button>
            </div>

            <Show when={state() === "cli-unavailable"}>
              <p class="m-0 text-[13px] text-[var(--color-text-secondary)]">
                {current().binary} was not found on your PATH. Install it, then refresh.
              </p>
            </Show>
            <Show when={state() === "failed" && lines().length > 0}>
              <p class="m-0 text-[13px] text-[var(--color-text-secondary)]">{lines().join(" ")}</p>
            </Show>

            <Show when={sessionId()}>
              {(id) => (
                <Surface class="h-[240px] overflow-hidden rounded-[var(--radius-card)]">
                  <TerminalEmulator
                    sessionId={id()}
                    onWrite={(data) => {
                      void writeAuthTerminal(core().terminals, id(), data);
                    }}
                    onResize={(cols, rows) => {
                      void resizeAuthTerminal(core().terminals, id(), cols, rows);
                    }}
                    onRead={(offset) => readAuthTerminalOutput(core().terminals, id(), offset)}
                  />
                </Surface>
              )}
            </Show>
          </div>
        </Dialog>
      )}
    </Show>
  );
}
