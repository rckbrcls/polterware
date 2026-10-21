import type { DescMessage, DescMethodUnary, MessageShape as ContractMessage } from "@bufbuild/protobuf";
import type {
  ActivityEventSchema,
  ActivityService,
  AgentAccessService,
  DoctorCheckSchema,
  GetAgentInfoResponseSchema,
  MaintenanceService,
  ReminderService,
  ReminderStatusResponseSchema,
  SearchService,
  SearchStatusResponseSchema,
  SettingsSchema,
  SettingsService,
} from "@polterware/notes-contracts";

/** Protobuf JSON: int64 is a decimal string, timestamps are RFC 3339. */
export type Wire<T> = T extends { $typeName: "google.protobuf.Timestamp" } ? string
  : T extends bigint ? string
  : T extends readonly (infer V)[] ? Wire<V>[]
  : T extends object ? { [K in keyof T as K extends "$typeName" ? never : K]?: Wire<T[K]> }
  : T;
export type JsonOf<S extends DescMessage> = Wire<ContractMessage<S>>;
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: Wire<ContractMessage<S["method"][K]["input"]>>) => Promise<Wire<ContractMessage<S["method"][K]["output"]>>>
    : never;
};

export type AppInfo = { name: string; version: string; updates: "disabled" };
export type SettingsJSON = JsonOf<typeof SettingsSchema>;
export type AgentInfoJSON = JsonOf<typeof GetAgentInfoResponseSchema>;
export type ReminderStatusJSON = JsonOf<typeof ReminderStatusResponseSchema>;
export type SearchStatusJSON = JsonOf<typeof SearchStatusResponseSchema>;
export type ActivityJSON = JsonOf<typeof ActivityEventSchema>;
export type DoctorCheckJSON = JsonOf<typeof DoctorCheckSchema>;

export type SettingsBridge = {
  settings: Namespace<typeof SettingsService>;
  agents: Namespace<typeof AgentAccessService>;
  reminders: Namespace<typeof ReminderService>;
  search: Namespace<typeof SearchService>;
  activity: Namespace<typeof ActivityService>;
  maintenance: Namespace<typeof MaintenanceService>;
  onChange(callback: (event: { resync: boolean; changes: { entity: string; id: string; op: string }[] }) => void): () => void;
  app: {
    openLog(): Promise<void>;
    openDataFolder(): Promise<void>;
    getReduceTransparency(): Promise<boolean>;
    setReduceTransparency(enabled: boolean): Promise<boolean>;
    testMcpConnection(): Promise<{ ok: boolean; toolCount?: number; error?: string }>;
    getInfo(): Promise<AppInfo>;
    requestNotificationAuthorization(): Promise<boolean>;
    saveZip(): Promise<string | null>;
    saveBackup(): Promise<string | null>;
  };
};

export const SETTING_KEYS = [
  "appearance.theme",
  "notifications.sound",
  "notifications.allDayTime",
  "notifications.snoozeMinutes",
  "focus.work",
  "focus.shortBreak",
  "focus.longBreak",
  "focus.cycles",
  "focus.autoContinue",
  "focus.sounds",
  "focus.notifications",
  "map.geocoding",
  "map.online",
  "map.provider",
  "agents.mcpPort",
  "agents.mcpEnabled",
  "agents.allowFileAttach",
  "app.keepRunningInBackground",
  "links.fetchTitles",
  "calendar.weekStart",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const KEY_TO_FIELD = {
  "appearance.theme": "appearanceTheme",
  "notifications.sound": "notificationsSound",
  "notifications.allDayTime": "notificationsAllDayTime",
  "notifications.snoozeMinutes": "notificationsSnoozeMinutes",
  "focus.work": "focusWorkMin",
  "focus.shortBreak": "focusShortBreakMin",
  "focus.longBreak": "focusLongBreakMin",
  "focus.cycles": "focusCycles",
  "focus.autoContinue": "focusAutoContinue",
  "focus.sounds": "focusSounds",
  "focus.notifications": "focusNotifications",
  "map.geocoding": "mapGeocoding",
  "map.online": "mapOnline",
  "map.provider": "mapProvider",
  "agents.mcpPort": "agentsMcpPort",
  "agents.mcpEnabled": "agentsMcpEnabled",
  "agents.allowFileAttach": "agentsAllowFileAttach",
  "app.keepRunningInBackground": "appKeepRunningInBackground",
  "links.fetchTitles": "linksFetchTitles",
  "calendar.weekStart": "calendarWeekStart",
} as const satisfies Record<SettingKey, keyof SettingsJSON>;

export type Honesty = "live" | "queued" | "failed" | "unavailable";

export const DEFAULT_SETTINGS: SettingsJSON = {
  appearanceTheme: "dark",
  notificationsSound: "",
  notificationsAllDayTime: "09:00",
  notificationsSnoozeMinutes: 10,
  focusWorkMin: 25,
  focusShortBreakMin: 5,
  focusLongBreakMin: 15,
  focusCycles: 4,
  focusAutoContinue: true,
  focusSounds: true,
  focusNotifications: true,
  mapGeocoding: false,
  mapOnline: false,
  mapProvider: "",
  agentsMcpPort: 47600,
  agentsMcpEnabled: true,
  agentsAllowFileAttach: false,
  appKeepRunningInBackground: true,
  linksFetchTitles: false,
  calendarWeekStart: "mon",
};

export const NAMED_SOUNDS = ["glass", "bell", "chime", "ping", "pop", "start", "end", "pause"] as const;
export type NamedSound = (typeof NAMED_SOUNDS)[number];

export function patchFor(key: SettingKey, value: SettingsJSON[keyof SettingsJSON]): SettingsJSON {
  return { [KEY_TO_FIELD[key]]: value } as SettingsJSON;
}

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

export function formatBytes(value: string | number | bigint | undefined): string {
  const bytes = typeof value === "bigint" ? Number(value) : typeof value === "string" ? Number(value) : value ?? 0;
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAgentActor(actor: string | undefined): boolean {
  return Boolean(actor?.startsWith("mcp:"));
}

export function formatActivityTime(value: string | undefined): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const record = error as { message?: unknown; details?: unknown; rawMessage?: unknown };
  const violations = Array.isArray(record.details)
    ? record.details.flatMap(item => {
      const detail = item && typeof item === "object" ? item as { field?: unknown; reason?: unknown; violations?: unknown } : {};
      const nested = Array.isArray(detail.violations) ? detail.violations : [detail];
      return nested.map(entry => {
        const row = entry && typeof entry === "object" ? entry as { field?: unknown; reason?: unknown } : {};
        const field = typeof row.field === "string" ? row.field : "";
        const reason = typeof row.reason === "string" ? row.reason : "";
        if (field && reason) return `${field}: ${reason}`;
        return reason;
      }).filter(Boolean);
    })
    : [];
  if (violations.length) return violations.join("; ");
  if (typeof record.rawMessage === "string" && record.rawMessage.trim()) return record.rawMessage;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return String(error);
}
