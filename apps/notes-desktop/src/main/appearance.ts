import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const APPEARANCE_FILE = "appearance-preferences.json";

export function readReduceTransparency(userDataDirectory: string): boolean {
  if (!isAbsolute(userDataDirectory)) return false;
  try {
    if (!existsSync(join(userDataDirectory, APPEARANCE_FILE))) return false;
    const raw: unknown = JSON.parse(readFileSync(join(userDataDirectory, APPEARANCE_FILE), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const record = raw as { version?: unknown; reduceTransparency?: unknown };
    return record.version === 1 && record.reduceTransparency === true;
  } catch { return false; }
}

export function writeReduceTransparency(userDataDirectory: string, enabled: boolean): boolean {
  if (!isAbsolute(userDataDirectory)) throw new Error("Invalid userData directory");
  mkdirSync(userDataDirectory, { recursive: true, mode: 0o700 });
  const value = enabled === true;
  writeFileSync(join(userDataDirectory, APPEARANCE_FILE), JSON.stringify({ version: 1, reduceTransparency: value }), { mode: 0o600 });
  return value;
}
