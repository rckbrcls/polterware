import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    appPath: "",
    appData: "",
  },
  spawn: vi.fn(),
  check: vi.fn(),
  shutdown: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return mocks.app.isPackaged;
    },
    getAppPath: () => mocks.app.appPath,
    getPath: () => mocks.app.appData,
  },
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./client.js", () => ({
  createCoreClients: () => ({
    health: { check: mocks.check },
    maintenance: { shutdown: mocks.shutdown },
  }),
}));

const { spawn: realSpawn } = await vi.importActual<typeof import("node:child_process")>("node:child_process");

// A build far in the future, so a freshly written test binary never looks newer than the running core.
const CURRENT_BUILD = "9999999999-1";

const {
  buildId,
  ensureCore,
  fingerprintToken,
  isNewerBuild,
  resolveCliBinaryPath,
  resolveUserDatabasePath,
  stopCore,
} = await import("./process-supervisor.js");

let root: string;
let dbPath: string;
const children: ChildProcess[] = [];
const originalEnv = { ...process.env };
const originalResources = Object.getOwnPropertyDescriptor(process, "resourcesPath");

function writeState(overrides: Record<string, unknown> = {}) {
  mkdirSync(join(root, "run"), { recursive: true });
  writeFileSync(
    join(root, "run", "core.json"),
    JSON.stringify({ pid: process.pid, endpoint: "http://127.0.0.1:4100/", token: "secret", dbPath, ...overrides }),
  );
}

function makeBinary(mtimeSeconds: number): string {
  const binary = join(root, "polterware");
  writeFileSync(binary, "#!/bin/sh\n");
  utimesSync(binary, mtimeSeconds, mtimeSeconds);
  return binary;
}

/** A child process that stays alive until killed, standing in for an old core. */
function startFakeCore(): ChildProcess {
  const child = realSpawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  children.push(child);
  return child;
}

async function waitAlive(pid: number) {
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).not.toThrow());
}

/** A spawn mock whose "core" appears by writing core.json, like `polterware serve` does. */
function spawnThatWritesState() {
  mocks.spawn.mockImplementation(() => {
    writeState();
    return { pid: 4242, unref: vi.fn(), once: vi.fn() };
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "polterware-supervisor-"));
  dbPath = join(root, "local.db");
  writeFileSync(dbPath, "");
  mocks.app.isPackaged = false;
  mocks.app.appPath = join(root, "apps", "desktop");
  mocks.app.appData = root;
  mocks.spawn.mockReset();
  mocks.check.mockReset();
  mocks.shutdown.mockReset();
  mocks.shutdown.mockResolvedValue(undefined);
  delete process.env.POLTERWARE_CORE_ENDPOINT;
  delete process.env.POLTERWARE_CORE_TOKEN;
});

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  process.env = { ...originalEnv };
  if (originalResources) Object.defineProperty(process, "resourcesPath", originalResources);
  else delete (process as { resourcesPath?: string }).resourcesPath;
  rmSync(root, { recursive: true, force: true });
});

describe("paths", () => {
  it("keeps the database under appData so the CLI, TUI, and MCP share it", () => {
    expect(resolveUserDatabasePath()).toBe(join(root, "polterware", "local.db"));
  });

  it("finds the bundled binary in a packaged app", () => {
    mocks.app.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", { value: join(root, "Resources"), configurable: true });
    expect(resolveCliBinaryPath()).toBeUndefined();

    mkdirSync(join(root, "Resources"), { recursive: true });
    writeFileSync(join(root, "Resources", "polterware"), "");
    expect(resolveCliBinaryPath()).toBe(join(root, "Resources", "polterware"));
  });

  it("finds dist/polterware from the repository in development", () => {
    expect(resolveCliBinaryPath()).toBeUndefined();

    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "polterware"), "");
    expect(resolveCliBinaryPath()).toBe(join(root, "dist", "polterware"));
  });
});

describe("build identity", () => {
  it("formats the build as <unix seconds>-<bytes>, matching the Go side", () => {
    const binary = makeBinary(1_700_000_000);
    expect(buildId(binary)).toBe("1700000000-10");
    expect(buildId(join(root, "missing"))).toBe("");
  });

  it("compares builds by their timestamp only", () => {
    expect(isNewerBuild("200-1", "100-999")).toBe(true);
    expect(isNewerBuild("100-999", "200-1")).toBe(false);
    expect(isNewerBuild("100-1", "100-2")).toBe(false);
    expect(isNewerBuild("100-1", "")).toBe(true);
    expect(isNewerBuild("", "100-1")).toBe(false);
  });

  it("fingerprints a token to 12 stable hex characters without revealing it", () => {
    const first = fingerprintToken("secret");
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(fingerprintToken("secret")).toBe(first);
    expect(fingerprintToken("other")).not.toBe(first);
    expect(first).not.toContain("secret");
  });
});

describe("ensureCore", () => {
  it("uses the endpoint override without spawning or probing", async () => {
    process.env.POLTERWARE_CORE_ENDPOINT = " http://127.0.0.1:9999/ ";
    process.env.POLTERWARE_CORE_TOKEN = " tok ";
    const handle = await ensureCore({ dbPath });
    expect(handle).toEqual({ endpoint: "http://127.0.0.1:9999", token: "tok" });
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("attaches to a live core for this database", async () => {
    writeState();
    mocks.check.mockResolvedValue({ build: "100-1" });
    const log = vi.fn();
    const handle = await ensureCore({ dbPath, log });
    expect(handle).toEqual({ endpoint: "http://127.0.0.1:4100", token: "secret", pid: process.pid });
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Attached to Polterware core"));
  });

  it("does not attach to a core that serves a different database", async () => {
    const other = join(root, "other.db");
    writeFileSync(other, "");
    writeState({ dbPath: other });
    spawnThatWritesState();
    mocks.check.mockResolvedValue({ build: CURRENT_BUILD });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "polterware"), "");

    await ensureCore({ dbPath });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["missing token", JSON.stringify({ pid: process.pid, endpoint: "http://x", dbPath })],
    ["non-numeric pid", JSON.stringify({ pid: "1", endpoint: "http://x", token: "t", dbPath })],
  ])("ignores a core.json with %s", async (_name, body) => {
    mkdirSync(join(root, "run"), { recursive: true });
    writeFileSync(join(root, "run", "core.json"), body);
    spawnThatWritesState();
    mocks.check.mockResolvedValue({ build: "100-1" });
    await ensureCore({ dbPath });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("ignores a core.json whose process is gone", async () => {
    writeState({ pid: 2 ** 22 - 1 });
    spawnThatWritesState();
    mocks.check.mockResolvedValue({ build: "100-1" });
    await ensureCore({ dbPath });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("starts the bundled binary detached with a scrubbed environment", async () => {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "polterware"), "");
    process.env.POLTERWARE_SESSION_TOKEN = "leak";
    process.env.TYPESAFE_API_KEY = "leak";
    spawnThatWritesState();
    mocks.check.mockResolvedValue({ build: CURRENT_BUILD });

    const handle = await ensureCore({ dbPath });
    expect(handle.pid).toBe(process.pid);

    const [command, args, options] = mocks.spawn.mock.calls[0]!;
    expect(command).toBe(join(root, "dist", "polterware"));
    expect(args).toEqual(["-db", dbPath, "serve", "--listen", "127.0.0.1:0"]);
    expect(options.detached).toBe(true);
    expect(options.env.POLTERWARE_SESSION_TOKEN).toBeUndefined();
    expect(options.env.TYPESAFE_API_KEY).toBeUndefined();
  });

  it("fails clearly when the core exits before listening", async () => {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "polterware"), "");
    mocks.spawn.mockImplementation(() => ({
      pid: 1,
      unref: vi.fn(),
      once: (_event: string, callback: (code: number) => void) => queueMicrotask(() => callback(1)),
    }));
    await expect(ensureCore({ dbPath })).rejects.toThrow(/exited before listening \(code 1\)/);
  });

  it("replaces a core that is older than the bundled binary", async () => {
    // The bundled binary is newer (build time 2_000) than the running core (1_000).
    mkdirSync(join(root, "dist"), { recursive: true });
    const bundled = join(root, "dist", "polterware");
    writeFileSync(bundled, "");
    utimesSync(bundled, 2_000, 2_000);

    const old = startFakeCore();
    await waitAlive(old.pid!);
    writeState({ pid: old.pid });
    mocks.check.mockResolvedValueOnce({ build: "1000-5" }).mockResolvedValue({ build: "2000-0" });
    mocks.shutdown.mockImplementation(async () => {
      old.kill("SIGKILL");
    });
    spawnThatWritesState();
    const log = vi.fn();

    const handle = await ensureCore({ dbPath, log });
    expect(mocks.shutdown).toHaveBeenCalledWith({ reason: "outdated" });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(handle.pid).toBe(process.pid);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Replacing older Polterware core"));
  });

  it("keeps a core that is not older than the bundled binary", async () => {
    mkdirSync(join(root, "dist"), { recursive: true });
    const bundled = join(root, "dist", "polterware");
    writeFileSync(bundled, "");
    utimesSync(bundled, 1_000, 1_000);
    writeState();
    mocks.check.mockResolvedValue({ build: "1000-5" });

    await ensureCore({ dbPath });
    expect(mocks.shutdown).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

describe("stopCore", () => {
  it("does nothing when no core is running", async () => {
    await stopCore({ dbPath });
    expect(mocks.shutdown).not.toHaveBeenCalled();
  });

  it("asks the core to shut down and waits for it to exit", async () => {
    const running = startFakeCore();
    await waitAlive(running.pid!);
    writeState({ pid: running.pid });
    mocks.shutdown.mockImplementation(async () => {
      running.kill("SIGKILL");
    });

    await stopCore({ dbPath });
    expect(mocks.shutdown).toHaveBeenCalledWith({ reason: "desktop-quit" });
    expect(() => process.kill(running.pid!, 0)).toThrow();
  });

  it("falls back to SIGTERM when the core has no Shutdown RPC", async () => {
    const running = startFakeCore();
    await waitAlive(running.pid!);
    writeState({ pid: running.pid });
    mocks.shutdown.mockRejectedValue(new Error("unimplemented"));

    await stopCore({ dbPath });
    await vi.waitFor(() => expect(() => process.kill(running.pid!, 0)).toThrow());
  });
});
