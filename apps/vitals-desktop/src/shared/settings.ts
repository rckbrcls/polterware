export interface VitalsSettings {
  theme: "system" | "dark" | "light";
  /** macOS: opaque window chrome instead of the frosted vibrancy wash. */
  reduceTransparency: boolean;
  networkUnit: "bytes" | "bits";
  historyWindowMinutes: 2 | 5 | 10;
  confirmBeforeKill: boolean;
  confirmBeforeCloseSession: boolean;
  defaultKillSignal: "TERM" | "KILL";
  autoReconnect: boolean;
  reconnectDelaySeconds: number;
}

export const DEFAULT_SETTINGS: Readonly<VitalsSettings> = Object.freeze({
  theme: "system", reduceTransparency: false, networkUnit: "bytes", historyWindowMinutes: 2,
  confirmBeforeKill: true, confirmBeforeCloseSession: true, defaultKillSignal: "TERM", autoReconnect: true,
  reconnectDelaySeconds: 3,
});

export function normalizeSettings(raw: unknown): VitalsSettings {
  const result = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const value = raw as Record<string, unknown>;
  if (value.theme === "system" || value.theme === "dark" || value.theme === "light") result.theme = value.theme;
  if (typeof value.reduceTransparency === "boolean") result.reduceTransparency = value.reduceTransparency;
  if (value.networkUnit === "bytes" || value.networkUnit === "bits") result.networkUnit = value.networkUnit;
  if (value.historyWindowMinutes === 2 || value.historyWindowMinutes === 5 || value.historyWindowMinutes === 10) result.historyWindowMinutes = value.historyWindowMinutes;
  if (typeof value.confirmBeforeKill === "boolean") result.confirmBeforeKill = value.confirmBeforeKill;
  if (typeof value.confirmBeforeCloseSession === "boolean") result.confirmBeforeCloseSession = value.confirmBeforeCloseSession;
  if (value.defaultKillSignal === "TERM" || value.defaultKillSignal === "KILL") result.defaultKillSignal = value.defaultKillSignal;
  if (typeof value.autoReconnect === "boolean") result.autoReconnect = value.autoReconnect;
  if (typeof value.reconnectDelaySeconds === "number" && Number.isFinite(value.reconnectDelaySeconds) && value.reconnectDelaySeconds >= 1 && value.reconnectDelaySeconds <= 300) result.reconnectDelaySeconds = value.reconnectDelaySeconds;
  return result;
}
