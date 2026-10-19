import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { createCoreClients } from "./client.js";

export type CoreProcessHandle = {
  endpoint: string;
  token: string;
  pid?: number;
};

/**
 * The database shared with the CLI, the TUI, and MCP: <appData>/polterware/local.db.
 * Not userData, which differs between dev ("@polterware/polterware-desktop") and packaged builds.
 */
export function resolveUserDatabasePath(): string {
  return join(app.getPath("appData"), "polterware", "local.db");
}

/** Where the detached core writes its output. */
export function getCoreLogPath(dbPath: string): string {
  return join(dirname(dbPath), "run", "core.log");
}

/** Resolves the `polterware` CLI, which serves the core (`serve`) and MCP (`mcp`). */
export function resolveCliBinaryPath(): string | undefined {
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, "polterware");
    return existsSync(packaged) ? packaged : undefined;
  }
  const fromApp = resolve(app.getAppPath(), "../../dist/polterware");
  if (existsSync(fromApp)) return fromApp;
  const fromMain = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../dist/polterware");
  if (existsSync(fromMain)) return fromMain;
  return undefined;
}

export function resolveRepositoryRoot(): string {
  if (app.isPackaged) return app.getAppPath();
  return resolve(app.getAppPath(), "../..");
}

/**
 * Attaches to the core that owns dbPath, or starts it detached (ADR 0007: the
 * core is a daemon with idle exit and outlives the Desktop). A core running an
 * older build than the bundled binary is asked to shut down and replaced.
 */
export async function ensureCore(options: {
  dbPath: string;
  /** `--idle` value for a core this call starts (default: the core's own). */
  idle?: string;
  log?: (message: string) => void;
}): Promise<CoreProcessHandle> {
  const overrideEndpoint = process.env.POLTERWARE_CORE_ENDPOINT?.trim();
  const overrideToken = process.env.POLTERWARE_CORE_TOKEN?.trim();
  if (overrideEndpoint) {
    return { endpoint: overrideEndpoint.replace(/\/$/, ""), token: overrideToken ?? "" };
  }

  const binary = resolveCliBinaryPath();
  const localBuild = binary ? buildId(binary) : "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = readCoreState(options.dbPath);
    if (!state) {
      await spawnCore(options.dbPath, binary, options.log, options.idle);
      continue;
    }
    const clients = createCoreClients(state.endpoint, state.token);
    let build: string;
    try {
      build = (await clients.health.check({}, { timeoutMs: 2000 })).build;
    } catch {
      // Listening but not answering yet (just started).
      await delay(200);
      continue;
    }
    if (localBuild && isNewerBuild(localBuild, build)) {
      options.log?.(`Replacing older Polterware core (pid ${state.pid}, build ${build || "unknown"}).`);
      // Cores older than ADR 0007 have no Shutdown RPC: fall back to SIGTERM.
      await clients.maintenance.shutdown({ reason: "outdated" }).catch(() => {
        try {
          process.kill(state.pid, "SIGTERM");
        } catch {
          // Already gone.
        }
      });
      await waitForExit(state.pid);
      continue;
    }
    options.log?.(`Attached to Polterware core (pid ${state.pid}) at ${state.endpoint}`);
    return { endpoint: state.endpoint, token: state.token, pid: state.pid };
  }
  throw new Error(`Polterware core did not start; see ${getCoreLogPath(options.dbPath)}`);
}

export type CoreState = { pid: number; endpoint: string; token: string };

/** Reads `<db dir>/run/core.json` written by `polterware serve` (see backend/platform/runstate). */
/** Asks the running core for dbPath to shut down and waits for it to exit. */
export async function stopCore(options: { dbPath: string }): Promise<void> {
  const state = readCoreState(options.dbPath);
  if (!state) return;
  const clients = createCoreClients(state.endpoint, state.token);
  await clients.maintenance.shutdown({ reason: "desktop-quit" }).catch(() => {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  });
  await waitForExit(state.pid);
}

export function readCoreState(dbPath: string): CoreState | undefined {
  try {
    const state = JSON.parse(readFileSync(join(dirname(dbPath), "run", "core.json"), "utf8")) as {
      pid?: unknown;
      endpoint?: unknown;
      token?: unknown;
      dbPath?: unknown;
    };
    if (typeof state.pid !== "number" || typeof state.endpoint !== "string" || typeof state.token !== "string") {
      return undefined;
    }
    // realpath normalizes case on macOS (Electron userData and the CLI default both resolve to "polterware").
    if (typeof state.dbPath !== "string" || realpathSync.native(state.dbPath) !== realpathSync.native(dbPath)) {
      return undefined;
    }
    process.kill(state.pid, 0);
    return { pid: state.pid, endpoint: state.endpoint.replace(/\/$/, ""), token: state.token };
  } catch {
    return undefined;
  }
}

/** Starts `polterware serve` detached, logging to run/core.log, and waits for core.json. */
async function spawnCore(
  dbPath: string,
  binary: string | undefined,
  log?: (message: string) => void,
  idle?: string,
): Promise<void> {
  const runDir = join(dirname(dbPath), "run");
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const logFd = openSync(join(runDir, "core.log"), "a", 0o600);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  delete env.POLTERWARE_SESSION_TOKEN;
  const args = ["-db", dbPath, "serve", "--listen", "127.0.0.1:0", ...(idle ? ["--idle", idle] : [])];
  const child = binary
    ? spawn(binary, args, { env, detached: true, stdio: ["ignore", logFd, logFd] })
    : spawn("go", ["run", "./backend/runtimes/cli", ...args], {
        cwd: resolveRepositoryRoot(),
        env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
  closeSync(logFd);
  child.unref();
  let exitCode: number | null | undefined;
  child.once("exit", (code) => {
    exitCode = code;
  });
  log?.(`Starting Polterware core (pid ${child.pid ?? "unknown"}).`);
  const deadline = Date.now() + (binary ? 20_000 : 60_000);
  while (Date.now() < deadline) {
    if (readCoreState(dbPath)) return;
    // Exit 3: another core took the lock first; the caller attaches to it.
    if (exitCode === 3) return;
    if (exitCode !== undefined) {
      throw new Error(`Polterware core exited before listening (code ${exitCode ?? "unknown"}).`);
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Polterware core to listen.");
}

/** Same value as the Go side (coreclient.BuildID): "<unix seconds>-<bytes>". */
export function buildId(binary: string): string {
  try {
    const info = statSync(binary);
    return `${Math.floor(info.mtimeMs / 1000)}-${info.size}`;
  } catch {
    return "";
  }
}

export function isNewerBuild(a: string, b: string): boolean {
  const time = (value: string) => Number.parseInt(value.split("-")[0] ?? "", 10) || 0;
  return time(a) > time(b);
}

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await delay(100);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export function fingerprintToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
