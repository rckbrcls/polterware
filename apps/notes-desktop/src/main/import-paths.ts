import { chmodSync, constants, existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, isAbsolute, join } from "node:path";

export const MAX_TEMP_FILE_BYTES = 100 * 1024 * 1024;
export const AUDIO_EXTENSIONS = new Set([".webm", ".wav", ".mp3", ".m4a", ".ogg", ".aac"]);

export function tempImportDirectory(dataDirectory: string): string {
  if (!isAbsolute(dataDirectory)) throw new Error("Temp import directory parent must be absolute");
  return join(dataDirectory, "tmp-import");
}

export function resetTempImportDirectory(directory: string): void {
  if (!isAbsolute(directory) || basename(directory) !== "tmp-import") throw new Error("Invalid temp directory");
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Invalid temp directory");
  chmodSync(directory, 0o700);
}

export async function grantImportPaths(paths: unknown, grants: Set<string>): Promise<string[]> {
  if (!Array.isArray(paths)) return [];
  const granted: string[] = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096 || raw.includes("\0") || !isAbsolute(raw)) continue;
    try {
      const info = lstatSync(raw);
      if (info.isSymbolicLink() || !info.isFile()) continue;
      grants.add(raw);
      granted.push(raw);
    } catch { /* Missing or unreadable dropped paths are skipped. */ }
  }
  return granted;
}

export function assertSafeAudioName(name: string): string {
  if (name !== basename(name) || name.includes("\0") || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Temp file name must be a basename");
  }
  const ext = extname(name).toLowerCase();
  const stem = name.slice(0, -ext.length);
  if (!AUDIO_EXTENSIONS.has(ext) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(stem)) {
    throw new Error("Temp file name must use an audio extension");
  }
  return ext;
}

export async function writeGrantedTempFile(
  bytes: Uint8Array,
  name: string,
  directory: string,
  grants: Set<string>,
): Promise<string> {
  if (!isAbsolute(directory) || basename(directory) !== "tmp-import") throw new Error("Invalid temp directory");
  if (!(bytes instanceof Uint8Array)) throw new Error("Invalid app input");
  if (bytes.byteLength > MAX_TEMP_FILE_BYTES) throw new Error("Recording exceeds 100 MB");
  const ext = assertSafeAudioName(name);
  if (!existsSync(directory)) resetTempImportDirectory(directory);
  const info = lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Invalid temp directory");
  const dest = join(realpathSync(directory), `${randomUUID()}${ext}`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  const file = await open(dest, flags, 0o600);
  try {
    await file.writeFile(bytes);
    if (!(await file.stat()).isFile()) throw new Error("Invalid temp file");
  } finally { await file.close(); }
  grants.add(dest);
  return dest;
}
