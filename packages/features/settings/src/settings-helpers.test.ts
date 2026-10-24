import { describe, expect, it } from "vitest";
import { SETTINGS_ENVIRONMENT_MOCKS } from "./fixtures";
import {
  environmentDetailTarget,
  environmentSelectOptions,
  environmentsDetailScope,
  normalizeSettingsTab,
  SETTINGS_TABS,
} from "./settings-helpers";

describe("settings helpers", () => {
  it("groups the tabs as Project · Agents · App", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
      "general",
      "repositories",
      "environments",
      "project-danger",
      "agents-mcp",
      "agents-setup",
      "agents-hooks",
      "agents-skill",
      "agents-oracle",
      "agents-compile",
      "agents-drift",
      "shortcuts",
      "appearance",
      "local-core",
      "privacy",
      "app-danger",
    ]);
    expect([...new Set(SETTINGS_TABS.map((tab) => tab.group))]).toEqual([
      "Project",
      "Agents",
      "App",
    ]);
    const labels = SETTINGS_TABS.map((tab) => tab.label).join(" ");
    expect(labels).not.toMatch(/Knowledge/i);
    expect(new Set(SETTINGS_TABS.map((tab) => tab.tooltip.icon)).size).toBe(SETTINGS_TABS.length);
  });

  it("preserves focused pages and redirects former page ids", () => {
    expect(normalizeSettingsTab("unknown")).toBe("agents-mcp");
    expect(normalizeSettingsTab("general")).toBe("general");
    expect(normalizeSettingsTab("environments")).toBe("environments");
    expect(normalizeSettingsTab("shortcuts")).toBe("shortcuts");
    expect(normalizeSettingsTab("agents-access")).toBe("agents-mcp");
    expect(normalizeSettingsTab("agents-context")).toBe("agents-oracle");
    expect(normalizeSettingsTab("advanced")).toBe("appearance");
    expect(normalizeSettingsTab("repositories")).toBe("repositories");
    expect(normalizeSettingsTab("integrations-catalog")).toBe("agents-mcp");
    expect(normalizeSettingsTab("agents")).toBe("agents-mcp");
    expect(normalizeSettingsTab(undefined)).toBe("agents-mcp");
  });

  it("builds select options and detail targets from fixtures", () => {
    const options = environmentSelectOptions(SETTINGS_ENVIRONMENT_MOCKS);
    expect(options.length).toBe(SETTINGS_ENVIRONMENT_MOCKS.length);
    expect(options[0]).toEqual({
      value: SETTINGS_ENVIRONMENT_MOCKS[0]!.id,
      label: SETTINGS_ENVIRONMENT_MOCKS[0]!.name,
    });
    expect(environmentsDetailScope()).toBe("settings:environments");
    expect(environmentDetailTarget("env-prod")).toEqual({
      scopeId: "settings:environments",
      entityId: "env-prod",
      entityKind: "environment",
    });
  });
});

describe("settings environment fixtures", () => {
  it("covers kind and protection postures with honest dataSource", () => {
    expect(SETTINGS_ENVIRONMENT_MOCKS.length).toBeGreaterThanOrEqual(3);
    expect(
      SETTINGS_ENVIRONMENT_MOCKS.every((environment) => environment.dataSource === "fixture"),
    ).toBe(true);
    const kinds = new Set(SETTINGS_ENVIRONMENT_MOCKS.map((e) => e.kind));
    const protections = new Set(SETTINGS_ENVIRONMENT_MOCKS.map((e) => e.protection));
    expect(kinds.has("production")).toBe(true);
    expect(kinds.has("staging")).toBe(true);
    expect(kinds.has("development")).toBe(true);
    expect(protections.has("strict")).toBe(true);
    expect(protections.has("standard")).toBe(true);
    expect(protections.has("relaxed")).toBe(true);
    const defaults = SETTINGS_ENVIRONMENT_MOCKS.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    const production = SETTINGS_ENVIRONMENT_MOCKS.find((e) => e.kind === "production");
    expect(production?.protectionRules.length).toBeGreaterThanOrEqual(2);
  });
});
