import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createSignal, onCleanup } from "solid-js";
import type { MessageShape } from "@bufbuild/protobuf";
import type { ReminderStatusResponseSchema } from "@polterware/notes-contracts";
import type { ShellBridge } from "./bridge";

export type ReminderStatus = MessageShape<typeof ReminderStatusResponseSchema>;
export type ConnectionState = "loading" | "live" | "offline";

export function independentQueryKey(state: ConnectionState, revision: number, bridge: unknown): number | false {
  if (!bridge || state === "offline") return false;
  return revision;
}
export function reminderLabel(status: ReminderStatus | undefined, now = Date.now()): string {
  if (!status) return "Reminders unavailable";
  if (status.permission === "denied") return "Reminders: permission denied";
  if (!["authorized", "provisional", "ephemeral"].includes(status.permission ?? "")) return "Reminders: permission required";
  const seen = status.notifierLastSeenAt ? timestampDate(status.notifierLastSeenAt).getTime() : NaN;
  if (!Number.isFinite(seen) || now - seen > 90000) return "Reminders: refresh pending";
  if ((status.armed ?? 0) > 0) return `Reminders: ${status.armed} armed`;
  if ((status.planned ?? 0) > 0) return `Reminders: ${status.planned} planned`;
  return "Reminders refresh when Polterware Notes runs";
}
export function createCoreConnection(bridge: ShellBridge | undefined) {
  const [state, setState] = createSignal<ConnectionState>("loading");
  const [status, setStatus] = createSignal<ReminderStatus>();
  let pending: Promise<void> | undefined;
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const refresh = (): Promise<void> => {
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      try {
        if (!bridge) throw new Error("Polterware Notes bridge unavailable");
        const next = await bridge.reminders.status({});
        if (!disposed) { setStatus(next); setState("live"); }
      } catch {
        if (!disposed) { setStatus(undefined); setState("offline"); }
      } finally { pending = undefined; }
    });
    return pending;
  };
  return { state, status, refresh };
}
