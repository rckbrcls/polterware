import {
  A11yDialog,
  Button,
  PageError,
  PageToolbar,
  Plus,
  Separator,
  Settings,
  Tooltip,
  Tabs,
  ToastRegion,
  X,
  pushToast,
} from "@polterware/frontend-design-system";
import { MainFrame, MainSurfaceFrame } from "@polterware/frontend-shell";
import { ErrorBoundary, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  type ConnectPayload,
  type ConnectResult,
  type ConnectionStateEvent,
  type HostKeyPrompt,
  type MetricsSnapshot,
  type NetworkInterface,
  type SavedServerPublic,
  type SessionHistory,
} from "./api";
import { ConnectionDialog, type ConnectionDialogControls, savedConnectPayload } from "./components/ConnectionDialog";
import { HostHome, serverKey } from "./components/HostHome";
import { HostKeyModal } from "./components/HostKeyModal";
import { MetricsDashboard } from "./components/MetricsDashboard";
import { TerminalView } from "./components/TerminalView";
import { smoothValue } from "../shared/smoothing";

import { DEFAULT_SETTINGS, type VitalsSettings } from "../shared/settings";
import { SettingsDialog } from "./components/SettingsDialog";
import { createCardLayoutState } from "./components/card-layout-state";
import { CardLayoutMenu } from "./components/CardLayoutMenu";

interface TabState {
  sessionId: string;
  label: string;
  host: string;
  status: ConnectionStateEvent["status"];
  message?: string;
  mode?: ConnectionStateEvent["mode"];
  snapshot: MetricsSnapshot | null;
  history: SessionHistory;
}

const emptyHistory = (): SessionHistory => ({ cpu: [], cpuDisplay: null, lastCollectedAt: null, interfaces: {} });

function appendSample(values: number[], next: number, limit: number): number[] {
  return [...values, next].slice(-limit);
}

function appendInterfaceHistory(
  previous: SessionHistory["interfaces"],
  network: NetworkInterface[],
  limit: number,
): SessionHistory["interfaces"] {
  const next: SessionHistory["interfaces"] = {};
  for (const iface of network) {
    const prior = previous[iface.name];
    next[iface.name] = {
      rx: appendSample(prior?.rx ?? [], iface.rxBytesPerSec, limit),
      tx: appendSample(prior?.tx ?? [], iface.txBytesPerSec, limit),
    };
  }
  return next;
}

const RECENTS_KEY = "vitals.recents";

function readRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(keys: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(keys));
  } catch {
    // Recents are a convenience; the list still works for this session.
  }
}

export function App() {
  const [settings, setSettings] = createSignal<VitalsSettings>({ ...DEFAULT_SETTINGS });
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const cardLayout = createCardLayoutState();
  const [saved, setSaved] = createSignal<SavedServerPublic[]>([]);
  const [tabs, setTabs] = createSignal<TabState[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [hostKey, setHostKey] = createSignal<HostKeyPrompt | null>(null);
  const [view, setView] = createSignal<"metrics" | "terminal">("metrics");
  const [terminalSessions, setTerminalSessions] = createSignal<string[]>([]);
  const [killTarget, setKillTarget] = createSignal<{ sessionId: string; pid: number } | null>(null);
  const [closeTarget, setCloseTarget] = createSignal<TabState | null>(null);
  const active = createMemo(() => tabs().find((tab) => tab.sessionId === activeId()) ?? null);
  const [recentKeys, setRecentKeys] = createSignal<string[]>(readRecents());
  const closedSessions = new Set<string>();
  // Connects started from the form: the tab only appears once the session is connected.
  const attempts = new Map<string, (result: ConnectResult) => void>();
  const [attemptProgress, setAttemptProgress] = createSignal("");
  let dialog: ConnectionDialogControls | undefined;

  const refreshSaved = () => {
    if (!window.vitals) return;
    void window.vitals.listServers().then(setSaved);
  };

  onMount(() => {
    if (!window.vitals) return;
    refreshSaved();
    void window.vitals.getSettings().then(setSettings).catch(() => pushToast("Failed to load settings.", "danger"));
    const offSettings = window.vitals.onSettingsChanged(setSettings);
    onCleanup(offSettings);
    const seenStatus = new Map<string, ConnectionStateEvent["status"]>();
    const seenTabs = new Set<string>();

    const offState = window.vitals.onConnectionState((event) => {
      if (closedSessions.has(event.sessionId)) return;
      const settle = attempts.get(event.sessionId);
      if (settle) {
        if (event.status === "error" || event.status === "disconnected") {
          attempts.delete(event.sessionId);
          closedSessions.add(event.sessionId);
          void window.vitals.disconnect(event.sessionId);
          settle({ ok: false, errors: [event.message || "Connection failed"] });
          return;
        }
        if (event.status !== "connected") {
          if (event.message) setAttemptProgress(event.message);
          return;
        }
        attempts.delete(event.sessionId);
        settle({ ok: true });
      }
      const previous = seenStatus.get(event.sessionId);
      seenStatus.set(event.sessionId, event.status);
      if ((event.status === "error" || event.status === "disconnected") && previous !== event.status) {
        pushToast(event.message || `${event.label} failed`, "danger");
      }
      if (event.status === "reconnecting" && previous !== "reconnecting") {
        pushToast(event.message || `${event.label} is reconnecting`, "default");
      }
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.sessionId === event.sessionId);
        if (index < 0) {
          return [
            ...current,
            {
              sessionId: event.sessionId,
              label: event.label,
              host: event.host,
              status: event.status,
              message: event.message,
              mode: event.mode,
              snapshot: null,
              history: emptyHistory(),
            },
          ];
        }
        const next = current.slice();
        const tab = current[index];
        if (!tab) return current;
        next[index] = {
          ...tab,
          status: event.status,
          message: event.message,
          label: event.label,
          host: event.host,
          mode: event.mode ?? tab.mode,
        };
        return next;
      });
      // A new session comes from a connect the user just made, so it takes focus.
      if (!seenTabs.has(event.sessionId)) {
        seenTabs.add(event.sessionId);
        setActiveId(event.sessionId);
      }
    });

    const offMetrics = window.vitals.onMetrics((event) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.sessionId !== event.sessionId) return tab;
          const prior = tab.history;
          const dtSec = prior.lastCollectedAt === null ? 0 : (event.collectedAt - prior.lastCollectedAt) / 1000;
          return {
            ...tab,
            snapshot: event.snapshot,
            history: {
              cpu: appendSample(tab.history.cpu, event.snapshot.cpuTotalPercent, settings().historyWindowMinutes * 60),
              cpuDisplay: smoothValue(prior.cpuDisplay, event.snapshot.cpuTotalPercent, dtSec),
              lastCollectedAt: event.collectedAt,
              interfaces: appendInterfaceHistory(tab.history.interfaces, event.snapshot.network ?? [], settings().historyWindowMinutes * 60),
            },
          };
        }),
      );
    });

    const offHost = window.vitals.onHostKeyPrompt(setHostKey);
    onCleanup(() => {
      offState();
      offMetrics();
      offHost();
    });
  });

  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";

  // Cmd+, (Ctrl+, off macOS) opens Settings, the platform's preferences chord.
  const isMac = navigator.userAgent.includes("Mac");
  const onSettingsShortcut = (event: KeyboardEvent) => {
    if (event.key !== "," || event.altKey || event.shiftKey) return;
    if (isMac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    setSettingsOpen(true);
  };
  window.addEventListener("keydown", onSettingsShortcut, true);
  onCleanup(() => window.removeEventListener("keydown", onSettingsShortcut, true));

  // Kept in memory only, so a failed session can be retried with the same input.
  const payloads = new Map<string, ConnectPayload>();

  const rememberRecent = (payload: ConnectPayload) => {
    const key = serverKey(payload);
    const next = [key, ...recentKeys().filter((candidate) => candidate !== key)].slice(0, 16);
    setRecentKeys(next);
    writeRecents(next);
  };

  const connect = (payload: ConnectPayload) => {
    rememberRecent(payload);
    void window.vitals.connect(payload).then(({ sessionId }) => {
      payloads.set(sessionId, payload);
    }).catch((error: unknown) => {
      pushToast(error instanceof Error ? error.message : "Connect failed", "danger");
    });
  };

  /** Connect from the form: resolves once the session is connected or has failed for good. */
  const connectFromForm = (payload: ConnectPayload): Promise<ConnectResult> => {
    const sessionId = crypto.randomUUID();
    const sent = { ...payload, sessionId };
    setAttemptProgress("");
    return new Promise<ConnectResult>((resolve) => {
      attempts.set(sessionId, (result) => {
        if (result.ok) {
          payloads.set(sessionId, sent);
          rememberRecent(sent);
        }
        resolve(result);
      });
      window.vitals.connect(sent).catch((error: unknown) => {
        attempts.delete(sessionId);
        const message = error instanceof Error ? error.message : "Connect failed";
        resolve({ ok: false, errors: message.split("\n").filter(Boolean) });
      });
    });
  };

  const cancelFormAttempts = () => {
    for (const [sessionId, settle] of [...attempts]) {
      attempts.delete(sessionId);
      closedSessions.add(sessionId);
      void window.vitals.disconnect(sessionId);
      settle({ ok: false, errors: [] });
    }
  };

  const closeTab = (sessionId: string) => {
    closedSessions.add(sessionId);
    const current = tabs();
    const index = current.findIndex((tab) => tab.sessionId === sessionId);
    const remaining = current.filter((tab) => tab.sessionId !== sessionId);
    const neighbor = remaining[index] ?? remaining[index - 1] ?? null;
    setTabs(remaining);
    setTerminalSessions((ids) => ids.filter((id) => id !== sessionId));
    setActiveId((id) => (id === sessionId ? neighbor?.sessionId ?? null : id));
    payloads.delete(sessionId);
    void window.vitals.disconnect(sessionId);
  };

  /** A failed or disconnected tab has nothing left to lose, so it closes without asking. */
  const requestCloseTab = (tab: TabState) => {
    const idle = tab.status === "error" || tab.status === "disconnected";
    if (idle || !settings().confirmBeforeCloseSession) closeTab(tab.sessionId);
    else setCloseTarget(tab);
  };

  const confirmCloseTab = () => {
    const target = closeTarget();
    setCloseTarget(null);
    if (target) closeTab(target.sessionId);
  };

  const retryTab = (sessionId: string) => {
    const payload = payloads.get(sessionId);
    closeTab(sessionId);
    if (payload) connect(payload);
    else dialog?.openNew();
  };

  const confirmKill = async (target = killTarget()) => {
    if (!target) return;
    try {
      await window.vitals.killProcess({ sessionId: target.sessionId, pid: target.pid, signal: settings().defaultKillSignal });
      setKillTarget(null);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to stop the process", "danger");
    }
  };

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <PageError title="Polterware Vitals failed to render" message={error.message} onRetry={reset} />
      )}
    >
      <div class="vitals-shell">
        <MainFrame class="vitals-main-frame">
          <div class="vitals-tabs">
            <Separator orientation="vertical" class="vitals-titlebar-divider" />
            <For each={tabs()}>
              {(tab) => (
                <div class="vitals-tab-row" data-active={tab.sessionId === activeId() ? "true" : "false"}>
                  <Button
                    variant="ghost"
                    class="vitals-tab"
                    data-active={tab.sessionId === activeId() ? "true" : "false"}
                    onClick={() => setActiveId(tab.sessionId)}
                  >
                    {tab.label}
                  </Button>
                  <button type="button" class="vitals-tab-close" aria-label={`Close ${tab.label}`} onClick={() => requestCloseTab(tab)}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </For>
            <button
              type="button"
              class="vitals-tab-new"
              aria-label="New connection"
              data-active={activeId() === null ? "true" : "false"}
              onClick={() => setActiveId(null)}
            >
              <Plus size={14} />
            </button>
            <div class="vitals-settings-button">
              <Tooltip.Root>
                <Tooltip.Trigger asChild={(triggerProps) => (
                  <button {...triggerProps()} type="button" class="vitals-settings-card" aria-label="Settings"
                    data-active={settingsOpen() ? "true" : "false"} onClick={() => setSettingsOpen(true)}>
                    <Settings size={12} />
                  </button>
                )} />
                <Tooltip.Content>Settings</Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
          <MainSurfaceFrame class="vitals-main">
            <div class="vitals-scroll">
            <div class="vitals-surface-head">
              <Show when={active()}>
              {(session) => (
                <PageToolbar.Root>
                  <PageToolbar.Tabs>
                    <Tabs
                      aria-label="Session view"
                      items={[
                        { id: "metrics", label: "Metrics" },
                        { id: "terminal", label: "Terminal" },
                      ]}
                      value={view()}
                      onChange={(id) => {
                        if (id === "terminal") {
                          setView("terminal");
                          const sessionId = session().sessionId;
                          setTerminalSessions((ids) => (ids.includes(sessionId) ? ids : [...ids, sessionId]));
                          return;
                        }
                        setView("metrics");
                      }}
                    />
                  </PageToolbar.Tabs>
                  <Show when={view() === "metrics"}>
                    <PageToolbar.Actions>
                      <CardLayoutMenu layout={cardLayout} />
                    </PageToolbar.Actions>
                  </Show>
                </PageToolbar.Root>
              )}
            </Show>
            </div>
            {/* Keyed by sessionId string: tab objects are replaced on every metrics event,
                and a For over objects would remount the terminal (closing its shell) each time. */}
            <For each={terminalSessions()}>
              {(sessionId) => {
                const tab = () => tabs().find((candidate) => candidate.sessionId === sessionId);
                return (
                  <Show when={tab()}>
                    <div
                      class="vitals-terminal-pane"
                      hidden={!(view() === "terminal" && sessionId === activeId())}
                    >
                      <TerminalView
                        sessionId={sessionId}
                        connected={tab()?.status === "connected"}
                        visible={view() === "terminal" && sessionId === activeId()}
                      />
                    </div>
                  </Show>
                );
              }}
            </For>
            <Show
              when={active()}
              fallback={
                <HostHome
                  saved={saved()}
                  recentKeys={recentKeys()}
                  onOpen={(server) => connect(savedConnectPayload(server))}
                  onEdit={(server) => dialog?.openEdit(server)}
                  onRemove={(server) => {
                    void window.vitals.deleteServer(server.id).then(refreshSaved);
                  }}
                  onNew={() => dialog?.openNew()}
                />
              }
            >
              <Show when={view() === "metrics"}>
              <MetricsDashboard
                snapshot={active()!.snapshot}
                history={active()!.history}
                status={active()!.status}
                mode={active()!.mode}
                message={active()!.message}
                label={active()!.label}
                networkUnit={settings().networkUnit}
                historyLimit={settings().historyWindowMinutes * 60}
                layout={cardLayout}
                onKill={(pid) => {
                  const target = { sessionId: active()!.sessionId, pid };
                  if (settings().confirmBeforeKill) setKillTarget(target);
                  else void confirmKill(target);
                }}
                onRetry={() => retryTab(active()!.sessionId)}
                onClose={() => closeTab(active()!.sessionId)}
              />
              </Show>
            </Show>
            </div>
          </MainSurfaceFrame>
        </MainFrame>

        <SettingsDialog open={settingsOpen()} settings={settings()} onClose={() => setSettingsOpen(false)}
          onChange={(patch) => { void window.vitals.updateSettings(patch).then(setSettings).catch(() => pushToast("Failed to save settings.", "danger")); }}
          onResetLayout={() => cardLayout.reset()}
          onClearRecents={() => { setRecentKeys([]); writeRecents([]); }} />

        <ConnectionDialog
          onConnect={connectFromForm}
          onCancelConnect={cancelFormAttempts}
          progress={attemptProgress()}
          onRefreshSaved={refreshSaved}
          bind={(controls) => {
            dialog = controls;
          }}
        />

        <Show when={hostKey()}>
          {(prompt) => (
            <HostKeyModal
              host={prompt().host}
              port={prompt().port}
              fingerprint={prompt().fingerprint}
              onAccept={() => {
                void window.vitals.acceptHostKey(prompt().sessionId);
                setHostKey(null);
              }}
              onReject={() => {
                void window.vitals.rejectHostKey(prompt().sessionId);
                setHostKey(null);
              }}
            />
          )}
        </Show>

        <A11yDialog
          open={killTarget() !== null}
          size="sm"
          title={killTarget() ? `Kill process ${killTarget()?.pid}?` : "Kill process"}
          description={"This sends SIG" + settings().defaultKillSignal + " on the remote host."}
          onClose={() => setKillTarget(null)}
          footer={
            <>
              <Button variant="texture" onClick={() => setKillTarget(null)}>
                Cancel
              </Button>
              <Button variant="texture" textureTone="danger" onClick={() => void confirmKill()}>
                Kill
              </Button>
            </>
          }
        >
          <p class="vitals-sub">The process stops only if the remote user is allowed to signal it.</p>
        </A11yDialog>

        <A11yDialog
          open={closeTarget() !== null}
          size="sm"
          title={`Close ${closeTarget()?.label ?? "session"}?`}
          description="This ends the SSH session and stops the metrics agent on the remote host."
          onClose={() => setCloseTarget(null)}
          footer={
            <>
              <Button variant="texture" onClick={() => setCloseTarget(null)}>
                Cancel
              </Button>
              <Button variant="texture" textureTone="danger" onClick={confirmCloseTab}>
                Close session
              </Button>
            </>
          }
        >
          <p class="vitals-sub">Metric history and any open terminal for this tab are discarded.</p>
        </A11yDialog>
        <ToastRegion />
      </div>
    </ErrorBoundary>
  );
}
