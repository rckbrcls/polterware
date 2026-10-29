import { describe, expect, it } from "vitest";

describe("Desktop core composition", () => {
  it("composes only retained surfaces", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(import.meta.dirname, "App.tsx"), "utf8");
    for (const surface of ["StructureView", "KnowledgeView", "IntegrationsView", "SettingsView"]) {
      expect(source).toContain(surface);
    }
    expect(source).not.toContain("OperationsView");
    expect(source).not.toContain("TerminalPage");
  });

  it("lazy-loads secondary surfaces behind Suspense", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(import.meta.dirname, "App.tsx"), "utf8");
    expect(source).toMatch(/import \{[^}]*\bStructureView\b[^}]*\} from "@polterware\/feature-architecture"/);
    expect(source).toContain("lazy(() =>");
    expect(source).toContain("<Suspense");
    expect(source).toContain('import("@polterware/feature-knowledge")');
    expect(source).toContain('import("@polterware/feature-integrations")');
    expect(source).toContain('import("@polterware/feature-settings")');
    expect(source).not.toMatch(/import \{[^}]*KnowledgeView[^}]*\} from "@polterware\/feature-knowledge"/);
    expect(source).toContain("@polterware/feature-knowledge/change-envelope");
    expect(source).toContain("@polterware/feature-settings/boot");
  });

  it("loads workspace data through the typed core bridge", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(import.meta.dirname, "App.tsx"), "utf8");
    const persist = readFileSync(join(import.meta.dirname, "workspace/persist.ts"), "utf8");
    expect(source).toContain("loadWorkspaceShell");
    expect(source).toContain("loadWorkspaceExtensions");
    expect(source).toContain("persistStructureCreateNode");
    expect(source).toContain("persistKnowledgeCreate");
        expect(source).toContain("persistEnvironment");
    expect(source).toContain("persistEnvironmentDefault");
    expect(source).toContain("persistIntegrationSync");
    expect(source).not.toContain("Integration metadata refreshed locally.");
    expect(persist).toContain("syncConnection");
    expect(persist).not.toContain("Metadata refreshed from the local store.");
    expect(source).toContain("projectId={currentProjectId()}");
    expect(source).toContain("nodes={filterStructureNodes(workspace().structure.nodes, scopeNodeIdList()).map");
    expect(source).not.toContain("PROJECT_SWITCHER_FIXTURES");
    expect(source).not.toContain("RESOURCE_FIXTURES");
    expect(source).not.toContain('fixtureMode="force"');
    expect(source).not.toContain("ChangeEnvelopeDialogHost");
    expect(persist).toContain("change: changePayload");
  });
});
