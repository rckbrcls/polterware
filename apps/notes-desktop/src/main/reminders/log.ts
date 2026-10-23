import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { NotifyLog } from "./types";
export function createNotifyLog(dataDirectory: string): NotifyLog {
  const run = join(dataDirectory, "run"), filename = join(run, "notify.log");
  mkdirSync(run, { recursive: true, mode: 0o700 });
  return (event, fields = {}) => {
    try {
      if (existsSync(filename) && statSync(filename).size > 1024 * 1024) {
        for (let index = 2; index >= 1; index--) if (existsSync(`${filename}.${index}`)) renameSync(`${filename}.${index}`, `${filename}.${index + 1}`);
        renameSync(filename, `${filename}.1`);
      }
      // Explicit projection prevents accidental payload expansion at call sites.
      const { reason, added, removed, armed, elapsedMs } = fields;
      appendFileSync(filename, JSON.stringify({ at: new Date().toISOString(), event, reason, added, removed, armed, elapsedMs }) + "\n", { mode: 0o600 });
      chmodSync(filename, 0o600);
    } catch { /* Logging cannot block the OS action completion. */ }
  };
}
