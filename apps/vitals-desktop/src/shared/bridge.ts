import type { MetricsSnapshot } from "./metrics-types.js";

import type { VitalsSettings } from "./settings.js";

export interface KnownHost { key: string; fingerprint: string; }

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

export interface ConnectPayload {
  /** Chosen by the renderer so it can follow the session's events from the first one. */
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

export interface ShellOpenPayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface ShellWritePayload {
  sessionId: string;
  data: string;
}

export interface ShellResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface ShellAckPayload {
  sessionId: string;
  bytes: number;
}

export interface ShellDataEvent {
  sessionId: string;
  data: string;
}

export interface ShellExitEvent {
  sessionId: string;
}

export interface VitalsBridge {
  shellOpen(payload: ShellOpenPayload): Promise<void>;
  shellWrite(payload: ShellWritePayload): Promise<void>;
  shellResize(payload: ShellResizePayload): Promise<void>;
  shellClose(sessionId: string): Promise<void>;
  shellAck(payload: ShellAckPayload): Promise<void>;
  onShellData(cb: (ev: ShellDataEvent) => void): () => void;
  onShellExit(cb: (ev: ShellExitEvent) => void): () => void;
  connect(payload: ConnectPayload): Promise<{ sessionId: string }>;
  disconnect(sessionId: string): Promise<void>;
  listServers(): Promise<SavedServerPublic[]>;
  deleteServer(id: string): Promise<void>;
  acceptHostKey(sessionId: string): Promise<void>;
  rejectHostKey(sessionId: string): Promise<void>;
  killProcess(payload: KillProcessPayload): Promise<void>;
  getSettings(): Promise<VitalsSettings>;
  updateSettings(patch: Partial<VitalsSettings>): Promise<VitalsSettings>;
  onSettingsChanged(cb: (settings: VitalsSettings) => void): () => void;
  listKnownHosts(): Promise<KnownHost[]>;
  removeKnownHost(key: string): Promise<void>;
  getTheme(): Promise<"dark" | "light">;
  setTheme(theme: "dark" | "light"): Promise<void>;
  onConnectionState(cb: (ev: ConnectionStateEvent) => void): () => void;
  onMetrics(cb: (ev: MetricsEvent) => void): () => void;
  onHostKeyPrompt(cb: (ev: HostKeyPrompt) => void): () => void;
}

declare global {
  interface Window {
    vitals: VitalsBridge;
  }
}
