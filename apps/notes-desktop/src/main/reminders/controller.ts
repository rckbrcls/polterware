import { isNoteID, isOwnedIdentifier } from "./plan";
import { BACKGROUND_IDLE_MS, REFRESH_DEBOUNCE_MS, type NativeNotify, type NotificationAction, type NotifyLog, type RefreshReason, type ReminderCore, type ReminderStatus } from "./types";
interface Options {
  native: NativeNotify;
  ensureCore(): Promise<ReminderCore>;
  openNote(url: string): void | Promise<void>;
  hasWindow(): boolean;
  quit(): void;
  background: boolean;
  log: NotifyLog;
  receipts: { record(plan: readonly import("./types").Reminder[]): void; authorize(event: NotificationAction): boolean };
}
export function createReminderController(options: Options) {
  const { native, log } = options;
  let started = false, closed = false, active = 0, background = options.background;
  let debounce: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
  let periodic: ReturnType<typeof setInterval> | undefined;
  let refresh: Promise<void> = Promise.resolve(), actions: Promise<void> = Promise.resolve();
  let firstQueuedAt = 0;
  const reasons = new Set<RefreshReason>(), earlyActions: NotificationAction[] = [];
  const earlyDeliveries: string[] = [];
  const listeners = new Set<(status: ReminderStatus) => void>();
  let status: ReminderStatus = { state: "refresh-pending", armed: 0, message: "Reminders are refreshed when Polterware Notes runs" };
  function publish(next: ReminderStatus) { if (closed) return; status = next; for (const callback of listeners) callback({ ...status }); }
  function idleExit() {
    clearTimeout(idle);
    if (!started || closed || !background || options.hasWindow()) return;
    idle = setTimeout(() => {
      if (active || debounce) { idleExit(); return; }
      if (!options.hasWindow()) { log("idle-exit"); options.quit(); }
    }, BACKGROUND_IDLE_MS);
  }
  function tracked<T>(operation: () => Promise<T>): Promise<T> {
    active++; clearTimeout(idle);
    return operation().finally(() => { active--; idleExit(); });
  }
  async function apply(reason: RefreshReason) {
    if (closed) return;
    try {
      const before = await native.status();
      if (before.authorization !== "authorized" && before.authorization !== "provisional") {
        publish({ state: before.authorization === "denied" ? "permission-denied" : "authorization-required", armed: before.pendingCount,
          message: before.authorization === "denied" ? "Permission denied" : "Notification permission required" });
        try { await (await options.ensureCore()).heartbeat(before); } catch { /* Preserve OS requests even if heartbeat fails. */ }
        log("refresh-failed", { reason });
        return; // Preserve OS requests; never prompt automatically in a hidden launch.
      }
      const core = await options.ensureCore();
      const plan = await core.plan(new Date());
      if (closed) return;
      options.receipts.record(plan);
      const result = await native.apply(plan);
      const after = await native.status();
      await core.heartbeat(after);
      const refreshedAt = new Date().toISOString();
      publish({ state: "armed", armed: after.pendingCount, refreshedAt, message: `Armed ${after.pendingCount} · refreshed ${refreshedAt}` });
      log("refreshed", { reason, added: result.added.length, removed: result.removed.length, armed: after.pendingCount });
    } catch {
      publish({ ...status, state: "refresh-pending", message: "Refresh pending (opens with Polterware Notes)" });
      log("refresh-failed", { reason });
    }
  }
  function flush(reason: RefreshReason = "change"): Promise<void> {
    clearTimeout(debounce); debounce = undefined; firstQueuedAt = 0; reasons.clear();
    // Includes queued work in the idle guard. All Plan/apply operations are serialized.
    return tracked(() => {
      refresh = refresh.then(() => apply(reason));
      return refresh;
    });
  }
  function requestRefresh(reason: RefreshReason) {
    if (closed) return;
    reasons.add(reason);
    if (!started) return;
    if (!firstQueuedAt) firstQueuedAt = Date.now();
    clearTimeout(debounce); clearTimeout(idle);
    // Debounce bursts, but sustained writes cannot postpone a refresh forever.
    const delay = Math.min(REFRESH_DEBOUNCE_MS, Math.max(0, 1500 - (Date.now() - firstQueuedAt)));
    debounce = setTimeout(() => { void flush(reasons.values().next().value ?? reason); }, delay);
  }
  async function ack(core: ReminderCore, id: string, outcome: "done" | "opened" | "delivered") {
    try { await core.ack(id, outcome); } catch { log("ack-failed"); }
  }
  async function handleAction(event: NotificationAction) {
    if (closed) return;
    try {
      if (!isOwnedIdentifier(event.id) || !options.receipts.authorize(event)) throw new Error("Invalid notification action");
      if (event.action === "com.apple.UNNotificationDismissActionIdentifier") return;
      // Standalone focus phase has no note route and no completion action.
      if (!event.noteId && event.id.startsWith("one:") && event.action === "com.apple.UNNotificationDefaultActionIdentifier") return;
      if (!isNoteID(event.noteId) || !Number.isFinite(Date.parse(event.occurrenceAt))) throw new Error("Invalid notification action");
      if (event.action === "DONE" || event.action === "SNOOZE") {
        const core = await options.ensureCore();
        if (event.action === "DONE") await core.complete(event.noteId, event.occurrenceAt);
        else await core.snooze(event.noteId, event.occurrenceAt);
        // Never replay an ambiguous Snooze failure: v1.1 has no idempotency key.
        log("action-applied", { elapsedMs: Math.max(0, Date.now() - event.receivedAtMs) });
        if (event.action === "DONE") await ack(core, event.id, "done");
        await flush("action");
      } else if (["OPEN", "START_FOCUS", "com.apple.UNNotificationDefaultActionIdentifier"].includes(event.action)) {
        await options.openNote(`pwnotes://note/${event.noteId}${event.action === "START_FOCUS" ? "?action=focus" : ""}`);
        await ack(await options.ensureCore(), event.id, "opened");
      } else throw new Error("Unknown notification action");
    } catch { log("action-failed"); }
    finally { try { await native.finishAction(event.token); } catch { log("action-failed"); } }
  }
  function queueAction(event: NotificationAction) {
    if (closed) return;
    if (!started) { earlyActions.push(event); return; }
    if (!options.hasWindow()) background = true;
    void tracked(() => {
      actions = actions.then(() => handleAction(event));
      return actions;
    });
  }
  function ackDelivered(id: string) {
    if (!started) { earlyDeliveries.push(id); return; }
    void tracked(async () => { try { await ack(await options.ensureCore(), id, "delivered"); } catch { log("ack-failed"); } });
  }
  native.onAction(queueAction);
  native.onEvent((event) => {
    requestRefresh(event.reason);
    if (event.reason === "delivered" && event.id && isOwnedIdentifier(event.id)) {
      ackDelivered(event.id);
    }
  });
  return {
    setBackgroundLaunch(value: boolean) { background = value; idleExit(); },
    shouldStartHidden: () => background || earlyActions.length > 0 || native.wasActionLaunch(),
    start() {
      if (started || closed) return;
      started = true;
      periodic = setInterval(() => requestRefresh("six-hour"), 6 * 60 * 60 * 1000);
      periodic.unref?.();
      for (const event of earlyActions.splice(0)) queueAction(event);
      for (const id of earlyDeliveries.splice(0)) ackDelivered(id);
      requestRefresh("start"); idleExit();
    },
    requestRefresh,
    onChanges(message: { snapshot: boolean; changes: readonly { entity: string; id?: string }[] }) {
      if (message.snapshot) requestRefresh("snapshot");
      // SQLite hooks emit singular wire names (note/reminder/setting); keep table names too.
      else if (message.changes.some(({ entity, id }) => id !== "_internal.reminder.heartbeat" && ["note", "notes", "schedules", "completions", "reminder", "reminder_oneoffs", "setting", "settings"].includes(entity))) requestRefresh("change");
    },
    status: () => ({ ...status }),
    onStatus(callback: (value: ReminderStatus) => void) { listeners.add(callback); callback({ ...status }); return () => { listeners.delete(callback); }; },
    async requestAuthorization() {
      if (!started || closed || !options.hasWindow()) throw new Error("Authorization requires a foreground Polterware Notes window");
      return tracked(async () => { const granted = await native.requestAuthorization(); await flush("authorization"); return granted; });
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(debounce); clearTimeout(idle); clearInterval(periodic);
      listeners.clear(); earlyActions.length = 0; earlyDeliveries.length = 0; native.close();
    },
  };
}
