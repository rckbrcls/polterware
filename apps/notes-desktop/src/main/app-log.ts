import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export const APP_LOG_NAME = "pwnotes.log";
const MAX_BYTES = 256 * 1024;
const ALLOWED = new Set(["changed", "code"]);

export type AppLog = {
  path: string;
  write: (event: string, fields?: Record<string, string | number | boolean | undefined>) => void;
};

export function appLogPath(logsDirectory: string): string {
  if (!isAbsolute(logsDirectory)) throw new Error("Logs directory must be absolute");
  return join(logsDirectory, APP_LOG_NAME);
}

export function createAppLog(logsDirectory: string): AppLog {
  const path = appLogPath(logsDirectory);
  mkdirSync(logsDirectory, { recursive: true, mode: 0o700 });
  return {
    path,
    write(event, fields = {}) {
      try {
        if (!/^[a-z][a-z0-9.-]{0,63}$/.test(event)) return;
        if (existsSync(path) && statSync(path).size > MAX_BYTES) {
          for (let index = 2; index >= 1; index--) if (existsSync(`${path}.${index}`)) renameSync(`${path}.${index}`, `${path}.${index + 1}`);
          renameSync(path, `${path}.1`);
        }
        const row: Record<string, string | number | boolean> = { at: new Date().toISOString(), event };
        for (const [key, value] of Object.entries(fields)) {
          if (!ALLOWED.has(key) || value === undefined) continue;
          row[key] = value;
        }
        appendFileSync(path, `${JSON.stringify(row)}\n`, { mode: 0o600 });
        chmodSync(path, 0o600);
      } catch { /* Logging cannot block Main. */ }
    },
  };
}

export function ensureAppLogFile(log: AppLog): string {
  if (!existsSync(log.path)) {
    mkdirSync(dirname(log.path), { recursive: true, mode: 0o700 });
    writeFileSync(log.path, "", { mode: 0o600 });
    chmodSync(log.path, 0o600);
  }
  return log.path;
}
