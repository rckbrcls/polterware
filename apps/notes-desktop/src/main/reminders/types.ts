export const BUDGET = 60;
export const REFRESH_DEBOUNCE_MS = 500;
export const BACKGROUND_IDLE_MS = 10_000;
export type Authorization = "authorized" | "provisional" | "denied" | "notDetermined" | "unknown";
export interface RepeatComponents {
  tz: string;
  month?: number;
  day?: number;
  weekday?: number; // Foundation: Sunday = 1
  hour?: number;
  minute?: number;
  second?: number;
}
export interface Reminder {
  id: string;
  noteId: string;
  occurrenceAt: string;
  fireAt: string;
  title: string;
  body: string;
  category: "reminder" | "reminder-focus" | "focus-phase";
  repeat?: RepeatComponents | null;
  sound?: string; // default, none, or a bundled file basename
}
export interface NativeReminder extends Omit<Reminder, "repeat" | "sound"> {
  repeat: RepeatComponents | null;
  sound: string;
  hash: string;
}
export interface PendingReminder { id: string; hash: string; repeats: boolean }
export interface ApplyResult { added: string[]; removed: string[]; unchanged: number }
export interface NativeStatus { authorization: Authorization; pendingCount: number }
export interface NotificationAction {
  event: "action";
  token: string;
  action: string;
  id: string;
  noteId: string;
  occurrenceAt: string;
  receivedAtMs: number;
}
export type RefreshReason = "start" | "change" | "snapshot" | "wake" | "timezone" | "delivered" | "six-hour" | "core-write" | "action" | "authorization";
export interface NativeRefresh { event: "refresh"; reason: "wake" | "timezone" | "delivered"; id?: string }
export interface NativeNotify {
  requestAuthorization(): Promise<boolean>;
  apply(items: readonly Reminder[]): Promise<ApplyResult>;
  pending(): Promise<PendingReminder[]>;
  delivered(): Promise<{ id: string; title: string }[]>;
  removeAll(prefix: string): Promise<string[]>;
  onAction(callback: (event: NotificationAction) => void): void;
  onEvent(callback: (event: NativeRefresh) => void): void;
  status(): Promise<NativeStatus>;
  finishAction(token: string): Promise<void>;
  emitSystemEvent(reason: "timezone" | "wake"): Promise<void>;
  wasActionLaunch(): boolean;
  close(): void;
}
export interface ReminderCore {
  plan(now: Date): Promise<Reminder[]>;
  complete(noteId: string, occurrenceAt: string): Promise<void>;
  snooze(noteId: string, occurrenceAt: string): Promise<void>;
  ack(id: string, outcome: "done" | "opened" | "delivered"): Promise<void>;
  heartbeat(status: NativeStatus): Promise<void>;
}
export type ReminderStatus = {
  state: "armed" | "permission-denied" | "authorization-required" | "refresh-pending" | "unavailable";
  armed: number;
  refreshedAt?: string;
  message: string;
};
// Deliberately no payload strings, URLs, core errors, tokens, titles or notes in logs.
export interface LogFields { reason?: RefreshReason; added?: number; removed?: number; armed?: number; elapsedMs?: number }
export type NotifyLog = (event: "delegate-installed" | "refreshed" | "refresh-failed" | "action-applied" | "action-failed" | "ack-failed" | "idle-exit" | "native-unavailable", fields?: LogFields) => void;
