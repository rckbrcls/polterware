// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/vitals-ssh-security-test" },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { parseSha256Output, remoteSha256Command } from "./agent-installer.js";
import { SessionManager } from "./session-manager.js";
import { applySshAuth, resolveAgentSocket } from "./ssh-auth.js";
import { assertKillSignal, assertPid } from "./ssh-session.js";

const DIGEST = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

describe("kill target validation", () => {
  it("accepts a positive integer pid", () => {
    expect(assertPid(1)).toBe(1);
    expect(assertPid(424242)).toBe(424242);
  });

  it("rejects anything that is not a positive integer", () => {
    for (const pid of ["1; rm -rf ~", "123", 0, -1, 1.5, Number.NaN, Infinity, 2 ** 60, null, undefined, {}]) {
      expect(() => assertPid(pid)).toThrow("Invalid pid");
    }
  });

  it("accepts only TERM and KILL", () => {
    expect(assertKillSignal("TERM")).toBe("TERM");
    expect(assertKillSignal("KILL")).toBe("KILL");
    for (const signal of ["HUP", "term", "KILL; reboot", 9, undefined]) {
      expect(() => assertKillSignal(signal)).toThrow("Invalid signal");
    }
  });

  it("rejects an invalid pid before looking up the session", async () => {
    const manager = new SessionManager();
    await expect(manager.killProcess("missing", "1; reboot" as unknown as number, "TERM")).rejects.toThrow("Invalid pid");
    await expect(manager.killProcess("missing", 42, "HUP" as unknown as "TERM")).rejects.toThrow("Invalid signal");
    await expect(manager.killProcess("missing", 42, "TERM")).rejects.toThrow("Session not found");
  });
});

describe("remote agent hash", () => {
  it("parses sha256sum and shasum output", () => {
    expect(parseSha256Output(`${DIGEST}  /home/me/.cache/vitals/agent-9f86d081884c\n`)).toBe(DIGEST);
    expect(parseSha256Output(`${DIGEST.toUpperCase()} *agent\n`)).toBe(DIGEST);
  });

  it("parses certutil output in both formats", () => {
    const modern = `SHA256 hash of C:\\Users\\me\\AppData\\Local\\Vitals\\agent.exe:\r\n${DIGEST}\r\nCertUtil: -hashfile command completed successfully.\r\n`;
    expect(parseSha256Output(modern)).toBe(DIGEST);
    const spaced = DIGEST.match(/../g)!.join(" ");
    const legacy = `SHA256 hash of file agent.exe:\r\n${spaced}\r\nCertUtil: -hashfile command completed successfully.\r\n`;
    expect(parseSha256Output(legacy)).toBe(DIGEST);
  });

  it("returns null when no digest is present", () => {
    expect(parseSha256Output("")).toBeNull();
    expect(parseSha256Output("sha256sum: agent: No such file or directory\n")).toBeNull();
    expect(parseSha256Output(`${DIGEST.slice(0, 63)}  agent\n`)).toBeNull();
  });

  it("quotes the remote path for POSIX shells", () => {
    const command = remoteSha256Command("linux", "/home/o'neil/.cache/vitals/agent-abc");
    expect(command).toBe(
      "sha256sum '/home/o'\\''neil/.cache/vitals/agent-abc' 2>/dev/null || shasum -a 256 '/home/o'\\''neil/.cache/vitals/agent-abc' 2>/dev/null",
    );
  });

  it("uses certutil on Windows", () => {
    expect(remoteSha256Command("windows", "C:\\Users\\me\\AppData\\Local\\Vitals\\agent-abc.exe")).toBe(
      'cmd /c certutil -hashfile "C:\\Users\\me\\AppData\\Local\\Vitals\\agent-abc.exe" SHA256',
    );
  });
});

describe("ssh-agent auth", () => {
  it("uses SSH_AUTH_SOCK when it is set", () => {
    expect(resolveAgentSocket({ SSH_AUTH_SOCK: " /tmp/agent.sock " }, "darwin")).toBe("/tmp/agent.sock");
    expect(resolveAgentSocket({ SSH_AUTH_SOCK: "/tmp/agent.sock" }, "win32")).toBe("/tmp/agent.sock");
  });

  it("falls back to the OpenSSH pipe on Windows only", () => {
    expect(resolveAgentSocket({}, "win32")).toBe("\\\\.\\pipe\\openssh-ssh-agent");
    expect(resolveAgentSocket({ SSH_AUTH_SOCK: "" }, "linux")).toBeNull();
    expect(resolveAgentSocket({}, "darwin")).toBeNull();
  });

  it("configures only the agent for agent auth", () => {
    const config = applySshAuth({ host: "h", username: "u" }, { agent: "/tmp/agent.sock" });
    expect(config).toEqual({ host: "h", username: "u", agent: "/tmp/agent.sock" });
  });

  it("configures a password without touching the agent", () => {
    const config = applySshAuth({ host: "h" }, { password: "pw" });
    expect(config.password).toBe("pw");
    expect(config.agent).toBeUndefined();
    expect(config.privateKey).toBeUndefined();
  });
});
