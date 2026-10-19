import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { APPEARANCE_FILE, readReduceTransparency, writeReduceTransparency } from "./appearance.js";

describe("reduce transparency storage", () => {
  it("defaults to off and persists a boolean in Main-owned userData", () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-appearance-"));
    try {
      expect(readReduceTransparency(directory)).toBe(false);
      expect(writeReduceTransparency(directory, true)).toBe(true);
      expect(readReduceTransparency(directory)).toBe(true);
      expect(JSON.parse(readFileSync(join(directory, APPEARANCE_FILE), "utf8"))).toEqual({ version: 1, reduceTransparency: true });
      expect(writeReduceTransparency(directory, false)).toBe(false);
      expect(readReduceTransparency(directory)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("ignores a renderer-shaped path and corrupt files", () => {
    expect(readReduceTransparency("relative")).toBe(false);
    expect(() => writeReduceTransparency("relative", true)).toThrow();
    const directory = mkdtempSync(join(tmpdir(), "notes-appearance-bad-"));
    try {
      writeFileSync(join(directory, APPEARANCE_FILE), "{not json");
      expect(readReduceTransparency(directory)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
