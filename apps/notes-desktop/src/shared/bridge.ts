import type { DescMethodUnary, MessageJsonType } from "@bufbuild/protobuf";
import type * as Contracts from "@polterware/notes-contracts";

/** RPC inputs and outputs use protobuf JSON (timestamps ISO, int64 decimal strings). */
type Namespace<S extends { method: object }> = {
  [K in keyof S["method"]]: S["method"][K] extends DescMethodUnary
    ? (input?: MessageJsonType<S["method"][K]["input"]>) => Promise<MessageJsonType<S["method"][K]["output"]>>
    : never;
};
export type ChangeEvent = { seq: string; changes: { entity: string; id: string; op: string }[]; resync: boolean };
export type DeepLink = { url: string; route: string };
export type NotesDesktopBridge = {
  notes: Namespace<typeof Contracts.NoteService>;
  spaces: Namespace<typeof Contracts.SpaceService>;
  tags: Namespace<typeof Contracts.TagService>;
  schedule: Namespace<typeof Contracts.ScheduleService>;
  places: Namespace<typeof Contracts.PlaceService>;
  attachments: Namespace<typeof Contracts.AttachmentService>;
  focus: Namespace<typeof Contracts.FocusService>;
  review: Namespace<typeof Contracts.ReviewService>;
  search: Namespace<typeof Contracts.SearchService>;
  reminders: Namespace<typeof Contracts.ReminderService>;
  activity: Namespace<typeof Contracts.ActivityService>;
  settings: Namespace<typeof Contracts.SettingsService>;
  /** Named filter combinations per UI surface (for example "notes.library"); save upserts by (surface, name). */
  savedFilters: Namespace<typeof Contracts.SavedFilterService>;
  agents: Namespace<typeof Contracts.AgentAccessService>;
  maintenance: Namespace<typeof Contracts.MaintenanceService>;
  onChange(callback: (event: ChangeEvent) => void): () => void;
  app: {
    name: "Polterware Notes";
    openDeepLink(url: string): Promise<void>;
    onDeepLink(callback: (link: DeepLink) => void): () => void;
    getDeepLink(): Promise<DeepLink | null>;
    pickFiles(): Promise<string[]>;
    pathsForDroppedFiles(files: File[]): Promise<string[]>;
    writeTempFile(bytes: Uint8Array, name: string): Promise<string>;
    saveZip(): Promise<string | null>;
    saveBackup(): Promise<string | null>;
    revealInFinder(attachmentUrl: string): Promise<void>;
    startMicrophone(): Promise<boolean>;
    getInfo(): Promise<{ name: string; version: string; updates: "enabled" | "disabled" | "unavailable" }>;
    requestNotificationAuthorization(): Promise<boolean>;
    openLog(): Promise<void>;
    openDataFolder(): Promise<void>;
    getReduceTransparency(): Promise<boolean>;
    setReduceTransparency(enabled: boolean): Promise<boolean>;
    testMcpConnection(): Promise<{ ok: boolean; toolCount?: number; error?: string }>;
  };
};
export const EVENTS = { change: "pwnotes:change", deepLink: "pwnotes:deep-link" } as const;
export const APP_METHODS = [
  "openDeepLink", "getDeepLink", "pickFiles", "pathsForDroppedFiles", "writeTempFile",
  "saveZip", "saveBackup", "revealInFinder", "startMicrophone", "getInfo", "requestNotificationAuthorization",
  "openLog", "openDataFolder", "getReduceTransparency", "setReduceTransparency", "testMcpConnection",
] as const;
