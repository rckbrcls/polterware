import type { StatusTone } from "@polterware/frontend-design-system";

export type AuthMode = "password" | "privateKey" | "agent";

export interface SavedServerPublic {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  privateKeyPath?: string;
}

export type ConnectResult = { ok: true } | { ok: false; errors: string[] };

export interface ConnectPayload {
  sessionId?: string;
  serverId?: string;
  label?: string;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  save?: boolean;
}

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type ConnectionMetricsMode = "agent" | "fallback";

export interface ConnectionStateEvent {
  sessionId: string;
  status: ConnectionStatus;
  message?: string;
  label: string;
  host: string;
  /** How metrics are collected once a live session exists. */
  mode?: ConnectionMetricsMode;
}

export interface HostKeyPrompt {
  sessionId: string;
  host: string;
  port: number;
  fingerprint: string;
}

export interface CpuCoreStats {
  name: string;
  usagePercent: number;
}

export interface MemoryStats {
  totalKb: number;
  availableKb: number;
  usedKb: number;
  swapTotalKb: number;
  swapFreeKb: number;
  swapUsedKb: number;
}

export interface DiskPartition {
  filesystem: string;
  sizeKb: number;
  usedKb: number;
  availKb: number;
  usePercent: number;
  mountPoint: string;
}

export interface NetworkInterface {
  name: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
}

export interface DiskIoStats {
  device: string;
  readBytesPerSec: number;
  writeBytesPerSec: number;
  utilPercent: number;
}

export interface PressureStats {
  cpu: number;
  memory: number;
  io: number;
}

export interface ProcessRow {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

export interface ThermalZone {
  id: string;
  celsius: number;
}

export interface GpuStats {
  index: number;
  name: string;
  temperatureC: number;
  utilizationPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
}

export interface MetricsSnapshot {
  cpuTotalPercent: number;
  cpuCores: CpuCoreStats[];
  load1: number;
  load5: number;
  load15: number;
  uptimeSeconds: number;
  memory: MemoryStats;
  disks: DiskPartition[];
  network: NetworkInterface[];
  processes: ProcessRow[];
  thermals: ThermalZone[];
  gpus: GpuStats[];
  /** Present when collected by the Go agent. */
  diskIo?: DiskIoStats[];
  /** Present when /proc/pressure is available on the agent path. */
  pressure?: PressureStats;
  /** Agent wall-clock sample time (ms since Unix epoch). */
  serverTimestamp?: number;
}

export interface MetricsEvent {
  sessionId: string;
  snapshot: MetricsSnapshot;
  collectedAt: number;
}

export interface KillProcessPayload {
  sessionId: string;
  pid: number;
  signal?: "TERM" | "KILL";
}

export interface ShellDataEvent {
  sessionId: string;
  data: string;
}

export interface ShellExitEvent {
  sessionId: string;
}

export interface ShellAckPayload {
  sessionId: string;
  bytes: number;
}

export type VitalsApi = import("../shared/bridge").VitalsBridge;

export interface InterfaceHistory {
  rx: number[];
  tx: number[];
}

export interface SessionHistory {
  /** Raw CPU samples for the chart. */
  cpu: number[];
  /** Smoothed CPU for the large readout; null before the first sample. */
  cpuDisplay: number | null;
  lastCollectedAt: number | null;
  /** Receive/transmit samples keyed by interface name. */
  interfaces: Record<string, InterfaceHistory>;
}

export function connectionPresentation(status: ConnectionStatus): { label: string; tone: StatusTone } {
  switch (status) {
    case "connected":
      return { label: "Live", tone: "ok" };
    case "reconnecting":
      return { label: "Reconnecting", tone: "syncing" };
    case "connecting":
      return { label: "Connecting", tone: "syncing" };
    case "error":
    case "disconnected":
      return { label: "Failed", tone: "danger" };
    default:
      return { label: "Idle", tone: "muted" };
  }
}
