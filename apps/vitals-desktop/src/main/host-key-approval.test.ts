// @vitest-environment node

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  interface FakeClient {
    config: { hostVerifier?: (key: Buffer) => boolean } | null;
    on: () => FakeClient;
    connect: (config: FakeClient["config"]) => FakeClient;
    end: () => void;
    removeAllListeners: () => FakeClient;
  }
  const clients: FakeClient[] = [];
  const store = new Map<string, string>();
  const state = { failWrites: false };
  class Client implements FakeClient {
    config: FakeClient["config"] = null;
    constructor() {
      clients.push(this);
    }
    on() {
      return this;
    }
    connect(config: FakeClient["config"]) {
      this.config = config;
      return this;
    }
    end() {}
    removeAllListeners() {
      return this;
    }
  }
  return { clients, store, state, Client };
});

vi.mock("ssh2", () => ({ Client: fake.Client }));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/vitals-host-key-test", getAppPath: () => "/tmp", isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false },
}));

// In-memory known hosts; failWrites simulates a store that cannot be saved.
vi.mock("./known-hosts.js", () => ({
  setKnownFingerprint: (host: string, port: number, fingerprint: string) => {
    if (!fake.state.failWrites) fake.store.set(`${host}:${port}`, fingerprint);
  },
  verifyFingerprint: (host: string, port: number, fingerprint: string) => {
    const known = fake.store.get(`${host}:${port}`);
    if (!known) return "new";
    return known === fingerprint ? "ok" : "mismatch";
  },
}));

import { AgentSession } from "./agent-session.js";
import { SessionManager } from "./session-manager.js";
import { SshSession } from "./ssh-session.js";

const KEY_A = Buffer.from("host-key-a");
const KEY_B = Buffer.from("host-key-b");
const fp = (key: Buffer) => `SHA256:${createHash("sha256").update(key).digest("base64")}`;

function sessionConfig() {
  return {
    sessionId: "s1",
    host: "example.test",
    port: 22,
    username: "me",
    auth: {},
    onMetrics: vi.fn(),
    onStatus: vi.fn(),
    onHostKeyPrompt: vi.fn(),
    onFallback: vi.fn(),
  };
}

function latestVerifier(): (key: Buffer) => boolean {
  const verifier = fake.clients.at(-1)?.config?.hostVerifier;
  if (!verifier) throw new Error("No hostVerifier captured");
  return verifier;
}

beforeEach(() => {
  fake.clients.length = 0;
  fake.store.clear();
  fake.state.failWrites = false;
});

describe.each([
  ["SshSession", (config: ReturnType<typeof sessionConfig>) => new SshSession(config)],
  ["AgentSession", (config: ReturnType<typeof sessionConfig>) => new AgentSession(config)],
])("%s host key approval", (_name, create) => {
  it("prompts for an unknown key and refuses the handshake", () => {
    const config = sessionConfig();
    create(config).connect();
    expect(latestVerifier()(KEY_A)).toBe(false);
    expect(config.onHostKeyPrompt).toHaveBeenCalledWith(fp(KEY_A));
  });

  it("accepts the approved key on reconnect", () => {
    const config = sessionConfig();
    const session = create(config);
    session.approveHostKey(fp(KEY_A));
    session.resetClient();
    session.connect();
    expect(latestVerifier()(KEY_A)).toBe(true);
  });

  it("refuses a different key after approval and reports the mismatch", () => {
    const config = sessionConfig();
    const session = create(config);
    session.approveHostKey(fp(KEY_A));
    session.resetClient();
    session.connect();
    expect(latestVerifier()(KEY_B)).toBe(false);
    expect(config.onStatus).toHaveBeenCalledWith("error", "Host key changed — connection refused");
  });

  it("only trusts the approved fingerprint when the store cannot be saved", () => {
    fake.state.failWrites = true;
    const config = sessionConfig();
    const session = create(config);
    session.approveHostKey(fp(KEY_A));
    session.resetClient();
    session.connect();
    const verify = latestVerifier();
    expect(verify(KEY_A)).toBe(true);
    expect(verify(KEY_B)).toBe(false);
    expect(config.onHostKeyPrompt).toHaveBeenCalledWith(fp(KEY_B));
  });
});

describe("SessionManager host key approval", () => {
  it("approves the fingerprint the server presented, then refuses a different key", () => {
    const manager = new SessionManager();
    const { sessionId } = manager.connect({ host: "example.test", port: 22, username: "me", authMode: "password", password: "pw" });

    expect(latestVerifier()(KEY_A)).toBe(false);
    manager.acceptHostKey(sessionId);

    expect(fake.store.get("example.test:22")).toBe(fp(KEY_A));
    const verify = latestVerifier();
    expect(verify(KEY_A)).toBe(true);
    expect(verify(KEY_B)).toBe(false);
    manager.disconnect(sessionId);
  });

  it("ignores an accept without a pending prompt", () => {
    const manager = new SessionManager();
    const { sessionId } = manager.connect({ host: "example.test", port: 22, username: "me", authMode: "password" });
    const clientsBefore = fake.clients.length;
    manager.acceptHostKey(sessionId);
    expect(fake.store.size).toBe(0);
    expect(fake.clients.length).toBe(clientsBefore);
    manager.disconnect(sessionId);
  });
});
