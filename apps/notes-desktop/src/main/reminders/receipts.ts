import { constants, closeSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { NotificationAction, Reminder } from "./types";
import { isNoteID } from "./plan";

type Receipt = { id: string; noteId: string; occurrenceAt: string; repeat: boolean; used: string[] };
const validID = /^(?:one:[0-7][0-9A-HJKMNP-TV-Z]{25}|rem:[0-7][0-9A-HJKMNP-TV-Z]{25}:(?:-?\d{1,16}|repeat|wd[1-7]))$/;

/** Private durable receipts keep cold OS actions bound to an actual core plan. */
export function createActionReceipts(dataDirectory: string) {
  const directory = join(dataDirectory, "run"), path = join(directory, "notifier-issued.json");
  let receipts = new Map<string, Receipt>();
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 256 * 1024 || (stat.mode & 0o077) !== 0) throw new Error("Invalid action receipts");
      const rows = JSON.parse(readFileSync(fd, "utf8")) as Receipt[];
      if (!Array.isArray(rows) || rows.length > 256) throw new Error("Invalid action receipts");
      for (const row of rows) {
        if (!validID.test(row.id) || (row.noteId !== "" && !isNoteID(row.noteId)) || !Number.isFinite(Date.parse(row.occurrenceAt)) ||
          typeof row.repeat !== "boolean" || !Array.isArray(row.used) || row.used.length > 128 || row.used.some(value => typeof value !== "string" || value.length > 32)) throw new Error("Invalid action receipts");
        receipts.set(row.id, row);
      }
    } finally { closeSync(fd); }
  } catch { receipts.clear(); } // Missing/corrupt receipts fail closed on actions.
  function save(next: Map<string, Receipt>) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("Invalid action receipt directory");
    const temp = join(directory, `.notifier-${randomUUID()}`);
    const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, JSON.stringify([...next.values()])); fsyncSync(fd); }
    finally { closeSync(fd); }
    try { renameSync(temp, path); } finally { try { unlinkSync(temp); } catch { /* Already published. */ } }
    receipts = next;
  }
  return {
    record(plan: readonly Reminder[]) {
      const next = new Map(receipts);
      for (const item of plan) {
        if (!validID.test(item.id)) throw new Error("Invalid issued notification identifier");
        const previous = next.get(item.id);
        next.delete(item.id);
        next.set(item.id, { id: item.id, noteId: item.noteId, occurrenceAt: item.occurrenceAt, repeat: Boolean(item.repeat), used: previous?.used ?? [] });
      }
      while (next.size > 256) next.delete(next.keys().next().value!);
      save(next);
    },
    authorize(event: NotificationAction): boolean {
      const receipt = receipts.get(event.id);
      if (!receipt || event.noteId !== receipt.noteId || !Number.isFinite(Date.parse(event.occurrenceAt))) return false;
      if (event.id.startsWith("rem:") && event.id.split(":")[1] !== event.noteId) return false;
      const at = new Date(event.occurrenceAt).toISOString();
      if (!receipt.repeat && at !== new Date(receipt.occurrenceAt).toISOString()) return false;
      if (event.action === "DONE" || event.action === "SNOOZE") {
        if (receipt.used.includes(at) || (receipt.repeat && receipt.used.length > 0 && Date.parse(at) <= Date.parse(receipt.used.at(-1)!))) return false;
        const next = new Map(receipts);
        next.set(receipt.id, { ...receipt, used: [at] });
        // Reserve before mutation. An ambiguous failure is never replayed after relaunch.
        save(next);
      }
      return true;
    },
  };
}
