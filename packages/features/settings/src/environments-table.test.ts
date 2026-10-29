import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(root, "index.tsx"), "utf8");
const project = readFileSync(resolve(root, "project-settings-dialog.tsx"), "utf8");
const rows = readFileSync(resolve(root, "environment-rows.tsx"), "utf8");

describe("Settings dialog composition contract", () => {
  it("renders the app settings dialog with a tab nav and section cards", () => {
    expect(source).toContain("<SettingsDialog");
    expect(source).toContain('"Project settings" : "App settings"');
    expect(source).toContain("SETTINGS_TABS");
    expect(source).toContain("<SettingsSection");
    expect(source).toContain("<SettingsRow");
    expect(source).toContain("onClose");
    expect(source).toContain("<PrivacyCard");
    expect(source).not.toContain("Archive project");
  });

  it("lists environments as expandable rows with StatusChip kind and protection", () => {
    expect(project).toContain("<EnvironmentRows");
    expect(project).toContain("Add environment");
    expect(project).toContain("<CreateEnvironmentDialog");
    expect(project).toContain("onCreateEnvironment");
    expect(project).toContain("onSetDefaultEnvironment");
    expect(rows).toContain("aria-expanded");
    expect(rows).toContain("StatusChip");
    expect(rows).toContain("environmentKindTone");
    expect(rows).toContain("protectionTone");
    expect(rows).toContain("Set as default");
    expect(rows).toContain("Delete environment");
    expect(project).not.toContain("DetailPanel");
    expect(project).not.toContain("DataTable");
    expect(source).not.toMatch(/id:\s*"access"/);
    expect(source).not.toMatch(/id:\s*"integrations"/);
  });

  it("uses the shared inputs on General and a dialog for the archive confirm", () => {
    expect(project).toContain("<Input");
    expect(project).toContain("Save changes");
    expect(project).toContain("saveGeneralSettingsToast");
    expect(project).toContain("Archive project");
    expect(project).toContain("archiveProjectToast");
    expect(project).toContain("<A11yDialog");
    expect(project).not.toContain("inputClass");
  });
});
