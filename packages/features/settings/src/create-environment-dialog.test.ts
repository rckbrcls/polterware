import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(resolve(root, "create-environment-dialog.tsx"), "utf8");

describe("CreateEnvironmentDialog contract", () => {
  it("collects name, kind, and protection in the shared Composer", () => {
    expect(dialogSource).toContain("CreateEnvironmentDraft");
    expect(dialogSource).toContain("<Composer");
    expect(dialogSource).toContain('"Add environment"');
    expect(dialogSource).toContain('titlePlaceholder="Environment name"');
    expect(dialogSource).toContain('label: "Kind"');
    expect(dialogSource).toContain('label: "Protection"');
    expect(dialogSource).toContain("defaultProtectionForKind");
  });
});
