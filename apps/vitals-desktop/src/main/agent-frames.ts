import type {
  AgentFrame,
  HelloFrame,
  MetricsFrame,
} from "../shared/agent-protocol.js";
import { AGENT_PROTOCOL_VERSION } from "../shared/agent-protocol.js";
import type { MetricsSnapshot } from "../shared/metrics-types.js";

export class ProtocolVersionError extends Error {
  readonly code = "protocol_version" as const;

  constructor(readonly version: unknown) {
    super(`Unsupported agent protocol version: ${String(version)}`);
    this.name = "ProtocolVersionError";
  }
}

/** Accumulate NDJSON lines; partial trailing data stays buffered. */
export class NdjsonLineBuffer {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines: string[] = [];
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) break;
      let line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }

  reset(): void {
    this.buf = "";
  }
}

export function parseAgentFrame(line: string): AgentFrame {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    throw new Error("invalid NDJSON frame");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid NDJSON frame");
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string") {
    throw new Error("invalid NDJSON frame");
  }
  return value as AgentFrame;
}

export function assertHelloFrame(frame: AgentFrame): HelloFrame {
  if (frame.type !== "hello") {
    throw new Error(`expected hello frame, got ${frame.type}`);
  }
  if (frame.v !== AGENT_PROTOCOL_VERSION) {
    throw new ProtocolVersionError(frame.v);
  }
  return frame;
}

export interface SlowMetricsCache {
  disks: MetricsSnapshot["disks"];
  processes: MetricsSnapshot["processes"];
  thermals: MetricsSnapshot["thermals"];
  gpus: MetricsSnapshot["gpus"];
}

export function emptySlowCache(): SlowMetricsCache {
  return { disks: [], processes: [], thermals: [], gpus: [] };
}

/** Convert a metrics frame into a snapshot, keeping the last slow-field values. */
export function metricsFrameToSnapshot(
  frame: MetricsFrame,
  slow: SlowMetricsCache,
): { snapshot: MetricsSnapshot; slow: SlowMetricsCache } {
  const nextSlow: SlowMetricsCache = {
    disks: frame.disks ?? slow.disks,
    processes: frame.processes ?? slow.processes,
    thermals: frame.thermals ?? slow.thermals,
    gpus: frame.gpus ?? slow.gpus,
  };
  const snapshot: MetricsSnapshot = {
    cpuTotalPercent: frame.cpuTotalPercent,
    cpuCores: frame.cpuCores,
    load1: frame.load[0] ?? 0,
    load5: frame.load[1] ?? 0,
    load15: frame.load[2] ?? 0,
    uptimeSeconds: frame.uptimeSeconds,
    memory: frame.memory,
    disks: nextSlow.disks,
    network: frame.network,
    processes: nextSlow.processes,
    thermals: nextSlow.thermals,
    gpus: nextSlow.gpus,
    diskIo: frame.diskIo,
    pressure: frame.pressure,
    serverTimestamp: frame.tsUnixMs,
  };
  return { snapshot, slow: nextSlow };
}
