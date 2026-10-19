import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createActionReceipts } from "./receipts";
import type { NotificationAction, Reminder } from "./types";
const noteId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const occurrenceAt = "2026-10-04T11:00:00.000Z";
it("rejects unissued or mismatched actions, persists cold receipts and denies destructive replay", () => {
  const data = mkdtempSync(join(tmpdir(), "notes-action-security-"));
  try {
    const id = `rem:${noteId}:${Date.parse(occurrenceAt)}`;
    const event: NotificationAction = { event: "action", id, noteId, occurrenceAt, action: "DONE", token: "opaque", receivedAtMs: 0 };
    const store = createActionReceipts(data);
    expect(store.authorize(event)).toBe(false);
    store.record([{ id, noteId, occurrenceAt, fireAt: occurrenceAt, title: "", body: "", category: "reminder" } satisfies Reminder]);
    expect(store.authorize({ ...event, noteId: "01ARZ3NDEKTSV4RRFFQ69G5FAW" })).toBe(false);
    expect(store.authorize({ ...event, occurrenceAt: "2026-10-05T11:00:00.000Z" })).toBe(false);
    const cold = createActionReceipts(data);
    expect(cold.authorize(event)).toBe(true);
    expect(createActionReceipts(data).authorize({ ...event, action: "SNOOZE" })).toBe(false);
    expect(statSync(join(data,"run/notifier-issued.json")).mode & 0o777).toBe(0o600);
    expect(() => store.record([{ id: "rem:../../forged", noteId, occurrenceAt } as Reminder])).toThrow();
  } finally { rmSync(data, { recursive: true, force: true }); }
});
