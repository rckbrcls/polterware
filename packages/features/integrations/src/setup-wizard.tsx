import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  Button,
  PageContent,
  PageHeader,
  StatusChip,
  pushToast,
} from "@polterware/frontend-design-system";
import {
  TerminalEmulator,
  TerminalTranscript,
  type CliConnectionState,
  type WorkspaceCatalogProvider,
} from "@polterware/feature-shell";
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

export function SetupWizard(props: {
  projectId?: string;
  providerName?: string;
  providers?: WorkspaceCatalogProvider[];
  onBack?: () => void;
  onFinish?: (provider: WorkspaceCatalogProvider) => void;
}) {
  const provider = createMemo(() =>
    providerByName(props.providers ?? [], props.providerName) ?? (props.providers ?? [])[0],
  );
  const [state, setState] = createSignal<CliConnectionState>("ready");
  const [lines, setLines] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [accountLabel, setAccountLabel] = createSignal("");
  const [docsUrl, setDocsUrl] = createSignal("");
  const [sessionId, setSessionId] = createSignal<string | null>(null);

  let stopProbe: (() => void) | undefined;
  let activeSessionId: string | null = null;

  function stopAuthProbe() {
    stopProbe?.();
    stopProbe = undefined;
  }

  async function disposeAuthSession() {
    stopAuthProbe();
    const id = activeSessionId;
    activeSessionId = null;
    setSessionId(null);
    await closeAuthTerminal(core().terminals, id);
  }

  onCleanup(() => {
    void disposeAuthSession();
  });

  async function probeCurrent() {
    const current = provider();
    if (!current) return;
    setBusy(true);
    try {
      const result = await probeAuthStatus(core().integrations, current.id);
      setAccountLabel(result.accountLabel);
      setState(result.status);
      setLines([
        `Probing ${current.name} CLI…`,
        result.binaryPath ? `Binary: ${result.binaryPath}` : `Binary: ${current.binary}`,
        result.message,
        result.accountLabel ? `Account: ${result.accountLabel}` : "No authenticated account label detected.",
        "Polterware never requests or stores provider tokens.",
      ]);
    } catch (error: unknown) {
      setState("failed");
      setLines([
        `Could not probe ${current.name}.`,
        error instanceof Error ? error.message : "Probe failed.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  createEffect((previousProviderId?: string) => {
    const current = provider();
    const providerId = current?.id;
    if (!providerId) return previousProviderId;
    if (providerId === previousProviderId) return previousProviderId;
    void disposeAuthSession().then(() => {
      setDocsUrl("");
      void probeCurrent();
    });
    return providerId;
  });

  async function startAuthentication() {
    const current = provider();
    const projectId = props.projectId?.trim();
    if (!current) return;
    if (!projectId) {
      pushToast("Open a local project before starting CLI login.", "danger");
      return;
    }

    setBusy(true);
    setState("authenticating");
    await disposeAuthSession();

    try {
      const plan = await beginAuthPlan(core().integrations, current.id);
      const command = plan.authCommand || current.authCommands[0] || current.binary;
      setDocsUrl(plan.docsUrl);
      setLines([
        `Starting local authentication for ${current.name}`,
        `$ ${command}`,
        plan.message || "Complete the interactive login in the terminal below.",
      ]);

      const id = await createAuthTerminalSession({
        terminals: core().terminals,
        projectId,
        providerId: current.id,
        cols: AUTH_DEFAULT_COLS,
        rows: AUTH_DEFAULT_ROWS,
      });
      activeSessionId = id;
      setSessionId(id);

      await startAuthCommand({
        terminals: core().terminals,
        sessionId: id,
        authCommand: command,
      });

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
      await disposeAuthSession();
      setState("failed");
      setLines([
        `Could not start authentication for ${current.name}.`,
        error instanceof Error ? error.message : "Begin auth failed.",
      ]);
      pushToast(error instanceof Error ? error.message : "Could not start CLI login.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function refreshAndConnect() {
    const current = provider();
    if (!current) return;
    setBusy(true);
    try {
      const result = await probeAuthStatus(core().integrations, current.id);
      const label = result.accountLabel || current.name;
      setAccountLabel(result.accountLabel);
      setLines([
        `Refreshed ${current.name} status`,
        result.message,
        result.accountLabel ? `Account: ${result.accountLabel}` : "No account label yet.",
      ]);
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
      props.onFinish?.({
        ...current,
        state: "connected",
        name: label || current.name,
      });
    } catch (error: unknown) {
      setState("failed");
      pushToast(error instanceof Error ? error.message : "Could not refresh connection status.", "danger");
    } finally {
      setBusy(false);
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

  async function handleBack() {
    await disposeAuthSession();
    props.onBack?.();
  }

  return (
    <Show when={provider()}>
      {(current) => (
        <div class="flex h-full min-h-0 flex-col">
          <PageHeader
            title={`Connect ${current().name}`}
            subtitle="Local CLI authentication"
            actions={
              <Button size="sm" variant="texture" onClick={() => void handleBack()}>
                Cancel
              </Button>
            }
          />
          <PageContent class="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="m-0 text-[13px] font-medium text-[var(--color-text-primary)]">{current().binary}</p>
                <p class="m-0 mt-1 text-[12px] text-[var(--color-text-muted)]">
                  {current().authCommands.join(" · ")}
                </p>
                <Show when={accountLabel()}>
                  <p class="m-0 mt-1 text-[12px] text-[var(--color-text-secondary)]">{accountLabel()}</p>
                </Show>
              </div>
              <StatusChip tone={cliStateTone(state())} label={cliStateLabel(state())} />
            </div>

            <Show
              when={sessionId()}
              fallback={
                <TerminalTranscript
                  lines={lines()}
                  label={`${current().name} authentication transcript`}
                  class="min-h-[320px] flex-1 rounded-[var(--radius-card)]"
                />
              }
            >
              {(id) => (
                <div
                  class="min-h-[320px] flex-1 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-subtle)]"
                  aria-label={`${current().name} authentication terminal`}
                >
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
                </div>
              )}
            </Show>

            <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
              Credentials stay in the OS/CLI credential store. Polterware never asks for or stores provider tokens.
              Auth output stays in memory for this session and is not written to SQLite.
            </p>

            <div class="flex flex-wrap justify-end gap-2">
              <Show when={docsUrl()}>
                <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void openDocs()}>
                  Open docs
                </Button>
              </Show>
              <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void probeCurrent()}>
                Refresh status
              </Button>
              <Show when={state() !== "connected"}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy() || state() === "cli-unavailable" || !props.projectId}
                  onClick={() => void startAuthentication()}
                >
                  Start CLI login
                </Button>
              </Show>
              <Button size="sm" variant="primary" disabled={busy()} onClick={() => void refreshAndConnect()}>
                {state() === "connected" ? "Save connection" : "Check and connect"}
              </Button>
            </div>
          </PageContent>
        </div>
      )}
    </Show>
  );
}
