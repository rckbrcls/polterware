import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { CoreClients } from "../core/client.js";
import { BUDGET, type Authorization, type NativeStatus, type ReminderCore, type Reminder } from "./types";
const repeatId = /:(?:repeat|wd\d+)$/;
// Core stores snake_case permission tokens; the native module reports camelCase.
const heartbeatAuthorization: Record<Authorization, string> = {
  authorized: "authorized",
  provisional: "authorized",
  denied: "denied",
  notDetermined: "not_determined",
  unknown: "not_determined",
};
export function createReminderCore(clients: Pick<CoreClients, "reminders" | "schedule" | "settings">): ReminderCore {
  const { reminders, schedule: schedules, settings } = clients;
  const callOptions = () => ({ timeoutMs: 4000 });
  return {
    async plan(now) {
      const response = await reminders.plan({ now: timestampFromDate(now), budget: BUDGET, horizon: { seconds: 30n * 24n * 60n * 60n, nanos: 0 } }, callOptions());
      const { settings: config } = await settings.get({}, callOptions());
      return response.items.map((item): Reminder => {
        if (!item.fireAt || !item.occurrenceAt || !["reminder", "reminder-focus", "focus-phase"].includes(item.category)) throw new Error("Invalid core reminder plan");
        // A native-repeat identifier without its matcher must never be armed as a one-shot.
        if (repeatId.test(item.id) !== Boolean(item.repeat)) throw new Error("Invalid core reminder plan");
        const repeat = item.repeat ? { tz: item.repeat.tz, weekday: item.repeat.weekday, hour: item.repeat.hour, minute: item.repeat.minute, second: item.repeat.second } : null;
        return { id: item.id, noteId: item.noteId, occurrenceAt: timestampDate(item.occurrenceAt).toISOString(), fireAt: timestampDate(item.fireAt).toISOString(), title: item.title, body: item.body,
          category: item.category as Reminder["category"], repeat, sound: config?.notificationsSound || "default" };
      });
    },
    async complete(noteId, occurrenceAt) { await schedules.completeOccurrence({ noteId, occurrenceAt: timestampFromDate(new Date(occurrenceAt)) }, callOptions()); },
    async snooze(noteId, occurrenceAt) {
      const { settings: config } = await settings.get({}, callOptions());
      await reminders.snooze({ noteId, occurrenceAt: timestampFromDate(new Date(occurrenceAt)), minutes: config?.notificationsSnoozeMinutes || 10 }, callOptions());
    },
    async ack(id, outcome) { await reminders.ack({ id, outcome }, callOptions()); },
    async heartbeat(status: NativeStatus) {
      await reminders.heartbeat({ authorization: heartbeatAuthorization[status.authorization] || "not_determined", armedCount: status.pendingCount }, callOptions());
    },
  };
}
