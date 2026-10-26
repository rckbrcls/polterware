/**
 * Where the user last was inside a surface (open canvas, open board, view mode, tab).
 * Values live in localStorage under one prefix; navigation keeps working when storage is unavailable.
 */
const PREFIX = "polterware.nav.";

export function readRemembered<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeRemembered<T>(key: string, value: T | undefined): void {
  try {
    if (value === undefined) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Navigation memory is a convenience; storage failures are ignored. */
  }
}
