import type { CoreStatus } from "../../shared/core-status.js";
import {
  ensureCore,
  getCoreLogPath,
  readCoreState,
  stopCore,
  type CoreProcessHandle,
} from "./process-supervisor.js";

export type CoreLifecycleOptions = {
  dbPath: string;
  /** `--idle` value for cores this lifecycle starts. */
  getIdle?: () => string;
  /** Called with the new handle whenever start/restart attaches to a core. */
  onHandle: (handle: CoreProcessHandle) => void;
  emit: (status: CoreStatus) => void;
  log?: (message: string) => void;
  pollIntervalMs?: number;
};

export type CoreLifecycle = {
  getStatus(): CoreStatus;
  start(): Promise<CoreStatus>;
  stop(): Promise<CoreStatus>;
  restart(): Promise<CoreStatus>;
  /** True while the user stopped the core, so background reconnects must not respawn it. */
  isPaused(): boolean;
  dispose(): void;
};

/**
 * Tracks whether the local core is up and lets the user start, stop, or restart it.
 * Status is derived from the run state file (`core.json` + pid liveness), so it also
 * reflects cores stopped or crashed outside the Desktop.
 */
export function createCoreLifecycle(options: CoreLifecycleOptions): CoreLifecycle {
  const logPath = getCoreLogPath(options.dbPath);
  const overrideEndpoint = process.env.POLTERWARE_CORE_ENDPOINT?.trim();
  let paused = false;
  let busy = false;
  let status: CoreStatus = {
    state: "stopped",
    pid: null,
    endpoint: null,
    dbPath: options.dbPath,
    logPath,
    error: null,
  };

  function set(next: Partial<CoreStatus>) {
    const merged = { ...status, ...next };
    const changed = JSON.stringify(merged) !== JSON.stringify(status);
    status = merged;
    if (changed) options.emit(status);
  }

  function observe() {
    if (busy) return;
    if (overrideEndpoint) {
      set({ state: "running", pid: null, endpoint: overrideEndpoint, error: null });
      return;
    }
    const state = readCoreState(options.dbPath);
    if (state) {
      set({ state: "running", pid: state.pid, endpoint: state.endpoint, error: null });
    } else if (status.state !== "error") {
      set({ state: "stopped", pid: null, endpoint: null });
    }
  }

  async function run(transition: CoreStatus["state"], action: () => Promise<void>) {
    if (busy) return status;
    busy = true;
    set({ state: transition, error: null });
    try {
      await action();
    } catch (error) {
      options.log?.(`Core ${transition} failed: ${error instanceof Error ? error.message : String(error)}`);
      busy = false;
      set({ state: "error", error: error instanceof Error ? error.message : String(error) });
      return status;
    }
    busy = false;
    observe();
    return status;
  }

  async function startCore() {
    paused = false;
    const handle = await ensureCore({ dbPath: options.dbPath, idle: options.getIdle?.(), log: options.log });
    options.onHandle(handle);
  }

  async function stopCoreProcess() {
    paused = true;
    await stopCore({ dbPath: options.dbPath });
  }

  const timer = setInterval(observe, options.pollIntervalMs ?? 3000);
  timer.unref?.();
  observe();

  return {
    getStatus: () => status,
    start: () => run("starting", startCore),
    stop: () => run("stopping", stopCoreProcess),
    restart: () =>
      run("starting", async () => {
        await stopCoreProcess();
        await startCore();
      }),
    isPaused: () => paused,
    dispose: () => clearInterval(timer),
  };
}
