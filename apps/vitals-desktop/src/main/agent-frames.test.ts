// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { MetricsFrame } from "../shared/agent-protocol.js";
import {
  assertHelloFrame,
  emptySlowCache,
  metricsFrameToSnapshot,
  NdjsonLineBuffer,
  parseAgentFrame,
  ProtocolVersionError,
} from "./agent-frames.js";
import {
  agentBinaryFileName,
  agentExecCommand,
  mapUnameArch,
  mapUnameTarget,
  mapWindowsTarget,
  remoteAgentCachePath,
  resolveLocalAgentBinary,
  UnsupportedArchError,
  windowsAgentPath,
  windowsSftpPath,
} from "./agent-installer.js";

describe("mapUnameArch", () => {
  it("maps x86_64 to amd64", () => {
    expect(mapUnameArch("x86_64")).toBe("amd64");
    expect(mapUnameArch("  x86_64\n")).toBe("amd64");
  });

  it("maps aarch64 to arm64", () => {
    expect(mapUnameArch("aarch64")).toBe("arm64");
  });

  it("throws a typed error for other arches", () => {
    expect(() => mapUnameArch("ppc64le")).toThrow(UnsupportedArchError);
    try {
      mapUnameArch("riscv64");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedArchError);
      expect((e as UnsupportedArchError).code).toBe("unsupported_arch");
      expect((e as UnsupportedArchError).uname).toBe("riscv64");
    }
  });
});

describe("mapUnameTarget / mapWindowsTarget", () => {
  it("maps Linux and macOS uname -sm output", () => {
    expect(mapUnameTarget("Linux x86_64\n")).toEqual({ os: "linux", arch: "amd64" });
    expect(mapUnameTarget("Linux aarch64")).toEqual({ os: "linux", arch: "arm64" });
    expect(mapUnameTarget("Darwin arm64")).toEqual({ os: "darwin", arch: "arm64" });
    expect(mapUnameTarget("Darwin x86_64")).toEqual({ os: "darwin", arch: "amd64" });
  });

  it("rejects other systems", () => {
    expect(() => mapUnameTarget("FreeBSD amd64")).toThrow(UnsupportedArchError);
    expect(() => mapUnameTarget("Linux riscv64")).toThrow(UnsupportedArchError);
  });

  it("maps PROCESSOR_ARCHITECTURE", () => {
    expect(mapWindowsTarget("AMD64\r\n")).toEqual({ os: "windows", arch: "amd64" });
    expect(mapWindowsTarget("ARM64")).toEqual({ os: "windows", arch: "arm64" });
    expect(() => mapWindowsTarget("x86")).toThrow(UnsupportedArchError);
  });
});

describe("agent binary and command", () => {
  it("names binaries per os and arch", () => {
    expect(agentBinaryFileName({ os: "darwin", arch: "arm64" })).toBe("vitals-agent-darwin-arm64");
    expect(agentBinaryFileName({ os: "windows", arch: "amd64" })).toBe("vitals-agent-windows-amd64.exe");
  });

  it("builds Windows cache and SFTP paths", () => {
    const native = windowsAgentPath("C:\\Users\\op\\AppData\\Local\\", "abcdef0123456789");
    expect(native).toBe("C:\\Users\\op\\AppData\\Local\\Vitals\\agent-abcdef012345.exe");
    expect(windowsSftpPath(native)).toBe("/C:/Users/op/AppData/Local/Vitals/agent-abcdef012345.exe");
  });

  it("quotes the exec command", () => {
    expect(agentExecCommand("linux", "/home/o p/.cache/vitals/agent-x")).toBe("'/home/o p/.cache/vitals/agent-x'");
    expect(agentExecCommand("windows", "C:\\a b\\agent.exe")).toBe('cmd /c "C:\\a b\\agent.exe"');
  });
});

describe("resolveLocalAgentBinary", () => {
  it("uses resources/agent in development", () => {
    expect(
      resolveLocalAgentBinary({ os: "linux", arch: "amd64" }, {
        appPath: "/app/vitals",
        resourcesPath: "/app/vitals/resources",
        packaged: false,
      }),
    ).toBe("/app/vitals/resources/agent/vitals-agent-linux-amd64");
  });

  it("uses process.resourcesPath/agent when packaged", () => {
    expect(
      resolveLocalAgentBinary({ os: "linux", arch: "arm64" }, {
        appPath: "/app/vitals",
        resourcesPath: "/Contents/Resources",
        packaged: true,
      }),
    ).toBe("/Contents/Resources/agent/vitals-agent-linux-arm64");
  });
});

describe("remoteAgentCachePath", () => {
  it("uses the first 12 hex chars of the sha", () => {
    expect(remoteAgentCachePath("/home/op", "abcdef0123456789")).toBe(
      "/home/op/.cache/vitals/agent-abcdef012345",
    );
  });
});

describe("NdjsonLineBuffer", () => {
  it("yields complete lines and keeps a partial trailer", () => {
    const buf = new NdjsonLineBuffer();
    expect(buf.push('{"type":"hello"')).toEqual([]);
    expect(buf.push(',"v":1}\n{"type":"pong"}\n{"type":"wa')).toEqual([
      '{"type":"hello","v":1}',
      '{"type":"pong"}',
    ]);
    expect(buf.push('rn"}\n')).toEqual(['{"type":"warn"}']);
  });

  it("ignores empty lines", () => {
    const buf = new NdjsonLineBuffer();
    expect(buf.push('\n\n{"type":"pong"}\n')).toEqual(['{"type":"pong"}']);
  });
});

describe("parseAgentFrame / assertHelloFrame", () => {
  it("parses a hello frame with v=1", () => {
    const frame = parseAgentFrame(
      JSON.stringify({
        type: "hello",
        v: 1,
        agentVersion: "1.0.0",
        arch: "amd64",
        hostname: "box",
        kernel: "6.1",
        cpuCount: 4,
      }),
    );
    expect(assertHelloFrame(frame).hostname).toBe("box");
  });

  it("rejects the wrong protocol version", () => {
    const frame = parseAgentFrame(
      JSON.stringify({
        type: "hello",
        v: 2,
        agentVersion: "2.0.0",
        arch: "amd64",
        hostname: "box",
        kernel: "6.1",
        cpuCount: 2,
      }),
    );
    expect(() => assertHelloFrame(frame)).toThrow(ProtocolVersionError);
  });

  it("rejects a non-hello first frame", () => {
    const frame = parseAgentFrame(JSON.stringify({ type: "pong" }));
    expect(() => assertHelloFrame(frame)).toThrow(/expected hello/);
  });
});

describe("metricsFrameToSnapshot", () => {
  const baseFrame = (): MetricsFrame => ({
    type: "metrics",
    tsUnixMs: 1_700_000_000_000,
    monoNs: 1e9,
    cpuTotalPercent: 12.5,
    cpuCores: [{ name: "cpu0", usagePercent: 10 }],
    load: [1, 2, 3],
    uptimeSeconds: 100,
    memory: {
      totalKb: 1000,
      availableKb: 400,
      usedKb: 600,
      swapTotalKb: 0,
      swapFreeKb: 0,
      swapUsedKb: 0,
    },
    network: [
      { name: "eth0", rxBytesPerSec: 100, txBytesPerSec: 50 },
      { name: "eth1", rxBytesPerSec: 10, txBytesPerSec: 5 },
    ],
    diskIo: [{ device: "sda", readBytesPerSec: 1, writeBytesPerSec: 2, utilPercent: 3 }],
    pressure: { cpu: 0.1, memory: 0.2, io: 0.3 },
  });

  it("maps fast fields and retains slow fields across ticks", () => {
    const first = metricsFrameToSnapshot(
      {
        ...baseFrame(),
        disks: [
          {
            filesystem: "/dev/sda1",
            sizeKb: 100,
            usedKb: 40,
            availKb: 60,
            usePercent: 40,
            mountPoint: "/",
          },
        ],
        processes: [{ pid: 1, user: "root", cpuPercent: 0, memPercent: 0, command: "init" }],
      },
      emptySlowCache(),
    );
    expect(first.snapshot.disks).toHaveLength(1);
    expect(first.snapshot.processes[0]?.pid).toBe(1);
    expect(first.snapshot.network).toHaveLength(2);
    expect(first.snapshot.diskIo?.[0]?.device).toBe("sda");
    expect(first.snapshot.pressure?.cpu).toBe(0.1);
    expect(first.snapshot.serverTimestamp).toBe(1_700_000_000_000);

    const second = metricsFrameToSnapshot(baseFrame(), first.slow);
    expect(second.snapshot.disks).toEqual(first.snapshot.disks);
    expect(second.snapshot.processes).toEqual(first.snapshot.processes);
    expect(second.snapshot.cpuTotalPercent).toBe(12.5);
  });
});
