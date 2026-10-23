import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("renderer entry surfaces", () => {
  it("routes the global Commander window away from the full App shell", () => {
    const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    expect(source).toContain('surface === "commander"');
    expect(source).toContain("CommanderApp");
    expect(source).toContain("commander-surface");
  });
});
