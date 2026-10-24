import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_TEST_PROVIDERS } from "./test-fixtures";
import { authTargetId } from "./setup-wizard-auth-session";

describe("CLI integrations auth", () => {
  it("contains exactly the supported providers and commands", () => {
    expect(CATALOG_TEST_PROVIDERS).toHaveLength(9);
    expect(CATALOG_TEST_PROVIDERS.every((provider) => provider.binary && provider.authCommands.length > 0)).toBe(true);
    expect(CATALOG_TEST_PROVIDERS.map((provider) => provider.name)).toEqual([
      "GitHub", "GitLab", "AWS", "Google Cloud", "Azure", "Vercel", "Supabase", "Terraform", "Docker",
    ]);
  });

  it("starts interactive PTY auth without password fields", () => {
    const source = readFileSync(join(import.meta.dirname, "connect-provider-dialog.tsx"), "utf8");
    expect(source).toContain("TerminalEmulator");
    expect(source).toContain("createAuthTerminalSession");
    expect(source).toContain("startAuthProbeLoop");
    expect(source).toContain("Open docs");
    expect(source).not.toContain("openExternal(docsUrl)");
    expect(source).not.toContain('type="password"');
    expect(source).not.toContain("No command, browser, PTY, or authentication request will be started");
  });

  it("uses a synthetic auth terminal target id", () => {
    expect(authTargetId("github")).toBe("auth-github");
  });
});
