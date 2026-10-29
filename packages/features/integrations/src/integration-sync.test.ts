import { describe, expect, it } from "vitest";

describe("Integration sync honesty contract", () => {
  it("uses Refresh metadata and drops fixture copy", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = dirname(fileURLToPath(import.meta.url));
    const detail = readFileSync(resolve(root, "integration-inline-detail.tsx"), "utf8");
    const index = readFileSync(resolve(root, "index.tsx"), "utf8");

    expect(detail).toContain("Refresh metadata");
    expect(detail).toContain("Sync history");
    expect(detail).toContain("Refresh metadata imports a bounded list from the local CLI");
    expect(detail).not.toContain("Refresh fixture");
    expect(detail).not.toContain("Fixture refresh history");
    expect(detail).not.toContain("Fixture metadata refreshed");
    expect(detail).not.toContain("Connection fixture");
    expect(detail).not.toContain("Last fixture refresh");
    expect(detail).toContain("Last sync");
    expect(index).toContain("onSync?: (integrationId: string) => void");
    expect(index).toContain("props.onSync?.(selectedIntegration()!.id)");
    expect(index).not.toContain("onSync={() => undefined}");
  });
});
