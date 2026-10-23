import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeAudioName, grantImportPaths, MAX_TEMP_FILE_BYTES, resetTempImportDirectory,
  tempImportDirectory, writeGrantedTempFile,
} from "./import-paths.js";

describe("import path grants", () => {
  it("grants only absolute existing regular files", async () => {
    const root = await mkdtemp(join(tmpdir(), "notes-import-"));
    try {
      const file = join(root, "photo.png");
      const nested = join(root, "nested");
      await mkdir(nested);
      await writeFile(file, "ok");
      const grants = new Set<string>();
      expect(await grantImportPaths([file, "relative.png", nested, join(root, "missing.png"), 12], grants)).toEqual([file]);
      expect([...grants]).toEqual([file]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects a symlink even when the target is a regular file", async () => {
    const root = await mkdtemp(join(tmpdir(), "notes-import-"));
    try {
      const file = join(root, "real.png");
      const link = join(root, "alias.png");
      await writeFile(file, "ok");
      await symlink(file, link);
      const grants = new Set<string>();
      expect(await grantImportPaths([link], grants)).toEqual([]);
      expect(grants.size).toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("granted temp recordings", () => {
  it("writes a Main-owned audio file, grants it, and refuses unsafe names", async () => {
    const data = mkdtempSync(join(tmpdir(), "notes-data-"));
    const directory = tempImportDirectory(data);
    resetTempImportDirectory(directory);
    try {
      expect(assertSafeAudioName("clip.webm")).toBe(".webm");
      expect(() => assertSafeAudioName("../clip.webm")).toThrow(/basename/);
      expect(() => assertSafeAudioName("clip.txt")).toThrow(/audio extension/);
      expect(() => assertSafeAudioName("/tmp/clip.webm")).toThrow(/basename/);
      const grants = new Set<string>();
      const path = await writeGrantedTempFile(new Uint8Array([1, 2, 3]), "clip.webm", directory, grants);
      expect(path.startsWith(realpathSync(directory))).toBe(true);
      expect(path.endsWith(".webm")).toBe(true);
      expect(grants.has(path)).toBe(true);
      await expect(writeGrantedTempFile(new Uint8Array(MAX_TEMP_FILE_BYTES + 1), "clip.webm", directory, grants))
        .rejects.toThrow("100 MB");
    } finally { rmSync(data, { recursive: true, force: true }); }
  });

  it("refuses a renderer-chosen destination and a swapped symlink directory", async () => {
    const data = mkdtempSync(join(tmpdir(), "notes-data-"));
    try {
      const outside = join(data, "outside");
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, "trap.webm"), "no");
      await expect(writeGrantedTempFile(new Uint8Array([1]), "clip.webm", outside, new Set())).rejects.toThrow("temp directory");
      const directory = tempImportDirectory(data);
      resetTempImportDirectory(directory);
      rmSync(directory, { recursive: true, force: true });
      symlinkSync(outside, directory);
      await expect(writeGrantedTempFile(new Uint8Array([1]), "clip.webm", directory, new Set())).rejects.toThrow("temp directory");
    } finally { rmSync(data, { recursive: true, force: true }); }
  });

  it("recreates a 0700 temp directory on reset", () => {
    const data = mkdtempSync(join(tmpdir(), "notes-data-"));
    try {
      const directory = tempImportDirectory(data);
      resetTempImportDirectory(directory);
      writeFileSync(join(directory, "stale.webm"), "old");
      resetTempImportDirectory(directory);
      expect(() => { writeFileSync(join(directory, "ok"), "x"); }).not.toThrow();
      chmodSync(directory, 0o700);
    } finally { rmSync(data, { recursive: true, force: true }); }
  });
});
