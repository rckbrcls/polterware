import { createRoot } from "solid-js";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ReminderStatusResponseSchema } from "@polterware/notes-contracts";
import { expect, it, vi } from "vitest";
import { createCoreConnection, independentQueryKey, reminderLabel } from "./connection";
import type { ShellBridge } from "./bridge";
it("lets independent queries start during loading without a live reminder probe", () => {
  expect(independentQueryKey("loading", 0, {})).toBe(0);
  expect(independentQueryKey("live", 2, {})).toBe(2);
  expect(independentQueryKey("offline", 0, {})).toBe(false);
  expect(independentQueryKey("loading", 0, undefined)).toBe(false);
});
it("shows offline and recovers from a rejected core call", async () => {
  const status = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(create(ReminderStatusResponseSchema, { permission: "authorized" }));
  let dispose!: () => void;
  const core = createRoot(d => { dispose = d; return createCoreConnection({ reminders: { status } } as unknown as ShellBridge); });
  await core.refresh(); expect(core.state()).toBe("offline");
  await core.refresh(); expect(core.state()).toBe("live");
  dispose();
});
it("deduplicates probes and ignores replies after disposal", async () => {
  let resolve!: (value: unknown) => void;
  const status = vi.fn(() => new Promise(done => { resolve = done; }));
  let dispose!: () => void;
  const core = createRoot(d => { dispose = d; return createCoreConnection({ reminders: { status } } as unknown as ShellBridge); });
  const pending = core.refresh(); core.refresh(); await Promise.resolve(); expect(status).toHaveBeenCalledOnce(); dispose();
  resolve(create(ReminderStatusResponseSchema)); await pending;
  expect(core.state()).toBe("loading");
});
it.each([
  ["denied", 12, 12, 0, "Reminders: permission denied"],
  ["not-determined", 12, 12, 0, "Reminders: permission required"],
  ["authorized", 12, 12, 100000, "Reminders: refresh pending"],
  ["authorized", 12, 12, 0, "Reminders: 12 armed"],
  ["authorized", 0, 12, 0, "Reminders: 12 planned"],
  ["authorized", 0, 0, 0, "Reminders refresh when Polterware Notes runs"],
])("reports honest status for %s/%i/%i", (permission, armed, planned, age, expected) => {
  const now = Date.now();
  expect(reminderLabel(create(ReminderStatusResponseSchema, { permission, armed, planned, notifierLastSeenAt: timestampFromDate(new Date(now - age)) }), now)).toBe(expected);
});
