import { createRequire } from "node:module";
import { normalizePlan } from "./plan";
import type { NativeNotify, NativeRefresh, NotificationAction } from "./types";
interface Addon { start(callback: (raw: string) => void): void; send(id: string, method: string, input: string): void; close(): void; wasActionLaunch(): boolean }
export function loadNativeNotify(filename: string): NativeNotify {
  const native = createRequire(import.meta.url)(filename) as Addon;
  return createNativeNotify(native);
}
// Exported for testing the transport without loading Cocoa into the test runner.
export function createNativeNotify(native: Addon): NativeNotify {
  let closed = false, nextID = 0;
  const waiting = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const actions: NotificationAction[] = [], events: NativeRefresh[] = [];
  let onAction: ((event: NotificationAction) => void) | undefined, onEvent: ((event: NativeRefresh) => void) | undefined;
  native.start((raw) => {
    if (closed) return;
    const message = JSON.parse(raw);
    if (message.rid) {
      const pending = waiting.get(message.rid);
      if (!pending) return;
      waiting.delete(message.rid); clearTimeout(pending.timer);
      // Native error text never propagates to logging or renderer status.
      message.error ? pending.reject(new Error("Native notification operation failed")) : pending.resolve(message.value);
    } else if (message.event === "action") {
      if (onAction) onAction(message); else actions.push(message);
    } else if (message.event === "refresh") {
      if (onEvent) onEvent(message); else events.push(message);
    }
  });
  function command<T>(method: string, value: unknown = null): Promise<T> {
    if (closed) return Promise.reject(new Error("Native notifications closed"));
    return new Promise((resolve, reject) => {
      const rid = String(++nextID);
      const timer = setTimeout(() => { waiting.delete(rid); reject(new Error("Native notifications timed out")); }, 30_000);
      waiting.set(rid, { resolve: (result) => resolve(result as T), reject, timer });
      try { native.send(rid, method, JSON.stringify(value)); }
      catch { clearTimeout(timer); waiting.delete(rid); reject(new Error("Native notification transport failed")); }
    });
  }
  let mutations: Promise<unknown> = Promise.resolve();
  function mutate<T>(method: string, value: unknown): Promise<T> {
    const operation = mutations.then(() => command<T>(method, value));
    mutations = operation.catch(() => {});
    return operation;
  }
  return {
    requestAuthorization: () => command("requestAuthorization"),
    // Normalize inside the serialized operation: time may advance while another apply is running.
    apply: (items) => {
      const operation = mutations.then(() => command<Awaited<ReturnType<NativeNotify["apply"]>>>("apply", normalizePlan(items)));
      mutations = operation.catch(() => {});
      return operation;
    },
    pending: () => command("pending"),
    delivered: () => command("delivered"),
    status: () => command("status"),
    removeAll: (prefix) => {
      if (!/^(rem:|one:)/.test(prefix)) return Promise.reject(new Error("Foreign notification prefix"));
      return mutate("removeAll", prefix);
    },
    finishAction: (token) => command("finishAction", token),
    emitSystemEvent: (reason) => command("emitSystemEvent", reason),
    onAction: (callback) => { onAction = callback; for (const event of actions.splice(0)) callback(event); },
    onEvent: (callback) => { onEvent = callback; for (const event of events.splice(0)) callback(event); },
    wasActionLaunch: () => native.wasActionLaunch(),
    close: () => {
      if (closed) return;
      closed = true;
      for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(new Error("Native notifications closed")); }
      waiting.clear(); actions.length = 0; events.length = 0;
      native.close();
    },
  };
}
