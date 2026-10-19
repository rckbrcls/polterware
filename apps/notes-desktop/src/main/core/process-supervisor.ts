import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createCoreClients, validateEndpoint } from "./client.js";

export type CoreHandle = { endpoint: string; token: string; pid?: number };
export function buildId(binary: string): string {
  const info = statSync(binary);
  return `${Math.floor(info.mtimeMs / 1000)}-${info.size}`;
}
export function isNewerBuild(local: string, running: string): boolean {
  return Number(local.split("-")[0]) > Number(running.split("-")[0]);
}
export function readCoreState(dbPath: string): CoreHandle | undefined {
  try {
    const statePath = join(dirname(dbPath), "run/core.json");
    const info = statSync(statePath);
    if (!info.isFile() || info.size > 16384 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) return;
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (!Number.isSafeInteger(state.pid) || state.pid <= 1 || typeof state.token !== "string" || !state.token ||
      typeof state.dbPath !== "string" || realpathSync(state.dbPath) !== realpathSync(dbPath)) return;
    process.kill(state.pid, 0);
    return { endpoint: validateEndpoint(state.endpoint), token: state.token, pid: state.pid };
  } catch { return; }
}
export function resolveBinary(appPath: string, resourcesPath: string, packaged: boolean): string {
  const override = process.env.PWNOTES_CORE_BIN?.trim();
  if (override) {
    if (!isAbsolute(override)) throw new Error("PWNOTES_CORE_BIN must be absolute");
    if (!existsSync(override)) throw new Error("Polterware Notes core binary is missing");
    return override;
  }
  const binary = packaged ? join(resourcesPath, "pwnotes") : resolve(appPath, "../../dist/pwnotes");
  if (!existsSync(binary)) throw new Error("Polterware Notes core binary is missing; run pnpm build:notes-core");
  return binary;
}
export const CORE_READY_TIMEOUT_MS = 12_000;
export const EXISTING_CORE_POLL_MS = 200;
export const SPAWNED_CORE_POLL_MIN_MS = 25;
export const SPAWNED_CORE_POLL_MAX_MS = 50;

/** Fast bounded backoff for a child this supervisor spawned; keep the 200 ms floor for an existing daemon. */
export function nextCorePollDelay(options: { spawnedChild: boolean; spawnedAttempt: number }): number {
  if (!options.spawnedChild) return EXISTING_CORE_POLL_MS;
  const step = options.spawnedAttempt <= 0 ? SPAWNED_CORE_POLL_MIN_MS : SPAWNED_CORE_POLL_MIN_MS * 2;
  return Math.min(Math.max(step, SPAWNED_CORE_POLL_MIN_MS), SPAWNED_CORE_POLL_MAX_MS);
}

export async function ensureCore(options: { dbPath: string; binary: string }): Promise<CoreHandle> {
  const endpoint = process.env.PWNOTES_CORE_ENDPOINT?.trim();
  const token = process.env.PWNOTES_CORE_TOKEN?.trim();
  if (endpoint || token) {
    if (!endpoint || !token) throw new Error("Both PWNOTES_CORE_ENDPOINT and PWNOTES_CORE_TOKEN are required");
    const handle = { endpoint: validateEndpoint(endpoint), token };
    await createCoreClients(handle.endpoint, token).health.check({}, { timeoutMs: 2000 });
    return handle;
  }
  const localBuild = buildId(options.binary);
  let spawned = false;
  let spawnedAttempt = 0;
  const deadline = Date.now() + CORE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = readCoreState(options.dbPath);
    if (state) {
      try {
        const health = await createCoreClients(state.endpoint, state.token).health.check({}, { timeoutMs: 1000 });
        if (realpathSync(health.dbPath) !== realpathSync(options.dbPath)) throw new Error("Core database mismatch");
        if (isNewerBuild(localBuild, health.build)) {
          // Frozen MaintenanceService has no Shutdown. Signal only after authenticated identity validation.
          process.kill(state.pid!, "SIGTERM");
          for (let wait = 0; wait < 50; wait++) {
            await delay(100);
            try { process.kill(state.pid!, 0); } catch { break; }
          }
          if (readCoreState(options.dbPath)) throw new Error("Older core did not exit");
          spawned = false;
          spawnedAttempt = 0;
        } else return state;
      } catch { /* A daemon may still be starting. Never kill an unverified process. */ }
    } else if (!spawned) {
      await spawnCore(options.dbPath, options.binary);
      spawned = true;
      spawnedAttempt = 0;
    }
    const waitMs = nextCorePollDelay({ spawnedChild: spawned, spawnedAttempt });
    if (spawned) spawnedAttempt += 1;
    await delay(waitMs);
  }
  throw new Error("Core unavailable; inspect Polterware Notes/run/core.log");
}
async function spawnCore(dbPath: string, binary: string): Promise<void> {
  const run = join(dirname(dbPath), "run");
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const fd = openSync(join(run, "core.log"), "a", 0o600);
  try {
    const env = { ...process.env };
    delete env.PWNOTES_CORE_TOKEN;
    delete env.POLTERWARE_SESSION_TOKEN;
    const child = spawn(binary, ["-db", dbPath, "serve", "--listen", "127.0.0.1:0"],
      { detached: true, stdio: ["ignore", fd, fd], env });
    await new Promise<void>((resolveSpawn, reject) => {
      child.once("error", reject);
      child.once("spawn", resolveSpawn);
    });
    child.unref();
  } finally { closeSync(fd); }
}
const delay = (ms: number) => new Promise<void>(resolveDelay => setTimeout(resolveDelay, ms));
