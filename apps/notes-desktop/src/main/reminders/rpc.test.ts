import { createClient, createRouterTransport } from "@connectrpc/connect";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ReminderService, ScheduleService, SettingsService, type PlanRemindersRequest, type CompleteOccurrenceRequest, type SnoozeReminderRequest, type ReminderHeartbeatRequest, type AckReminderRequest } from "@polterware/notes-contracts";
import { expect, it, vi } from "vitest";
import { createReminderCore } from "./rpc";
function clientsFor(transport: ReturnType<typeof createRouterTransport>) {
  return {
    reminders: createClient(ReminderService, transport),
    schedule: createClient(ScheduleService, transport),
    settings: createClient(SettingsService, transport),
  };
}
it("maps frozen RPCs with Budget, exact completion keys, configured snooze and heartbeat", async () => {
  const noteId = "01ARZ3NDEKTSV4RRFFQ69G5FAV", now = new Date("2026-10-04T11:00:00.000Z"), at = timestampFromDate(now);
  const plan = vi.fn((_request: PlanRemindersRequest) => ({ items: [{ id: "one:1", noteId, fireAt: at, occurrenceAt: at, title: "Synthetic", body: "Synthetic", category: "reminder" }] }));
  const completeOccurrence = vi.fn((_request: CompleteOccurrenceRequest) => ({})), snooze = vi.fn((_request: SnoozeReminderRequest) => ({})), heartbeat = vi.fn((_request: ReminderHeartbeatRequest) => ({})), ack = vi.fn((_request: AckReminderRequest) => ({}));
  const transport = createRouterTransport(({ service }) => {
    service(ReminderService, { plan, snooze, heartbeat, ack });
    service(ScheduleService, { completeOccurrence });
    service(SettingsService, { get: () => ({ settings: { notificationsSound: "none", notificationsSnoozeMinutes: 15 } }) });
  });
  const core = createReminderCore(clientsFor(transport)), items = await core.plan(now);
  expect(plan.mock.calls[0]?.[0]).toMatchObject({ budget: 60, horizon: { seconds: 2592000n } });
  expect(items[0]).toMatchObject({ fireAt: now.toISOString(), occurrenceAt: now.toISOString(), sound: "none" });
  await core.complete(noteId, now.toISOString()); await core.snooze(noteId, now.toISOString());
  await core.heartbeat({ authorization: "authorized", pendingCount: 60 }); await core.ack("one:1", "done");
  expect(completeOccurrence.mock.calls[0]?.[0]).toMatchObject({ noteId, occurrenceAt: at });
  expect(snooze.mock.calls[0]?.[0]).toMatchObject({ noteId, minutes: 15, occurrenceAt: at });
  expect(heartbeat.mock.calls[0]?.[0]).toMatchObject({ authorization: "authorized", armedCount: 60 });
  await core.heartbeat({ authorization: "notDetermined", pendingCount: 0 });
  expect(heartbeat.mock.calls[1]?.[0]).toMatchObject({ authorization: "not_determined", armedCount: 0 });
  expect(ack.mock.calls[0]?.[0]).toMatchObject({ id: "one:1", outcome: "done" });
});
it("maps repeat matchers from the plan and refuses repeating ids without one", async () => {
  const noteId = "01ARZ3NDEKTSV4RRFFQ69G5FAV", now = new Date("2026-10-04T11:00:00.000Z"), at = timestampFromDate(now);
  const transport = createRouterTransport(({ service }) => {
    service(ReminderService, { plan: () => ({ items: [{ id: `rem:${noteId}:repeat`, noteId, fireAt: at, occurrenceAt: at, title: "Daily", body: "note", category: "reminder" }] }) });
    service(ScheduleService, {});
    service(SettingsService, { get: () => ({ settings: {} }) });
  });
  await expect(createReminderCore(clientsFor(transport)).plan(now)).rejects.toThrow("Invalid core reminder plan");
  const withRepeat = createRouterTransport(({ service }) => {
    service(ReminderService, { plan: () => ({ items: [{ id: `rem:${noteId}:wd2`, noteId, fireAt: at, occurrenceAt: at, title: "Weekly", body: "", category: "reminder", repeat: { tz: "UTC", weekday: 2, hour: 9, minute: 30 } }] }) });
    service(ScheduleService, {});
    service(SettingsService, { get: () => ({ settings: {} }) });
  });
  const [item] = await createReminderCore(clientsFor(withRepeat)).plan(now);
  expect(item?.repeat).toMatchObject({ tz: "UTC", weekday: 2, hour: 9, minute: 30 });
});
