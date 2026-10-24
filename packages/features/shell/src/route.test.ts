import { describe, expect, it } from "vitest";
import { DEFAULT_TABS, SECTION_TABS, closeDialog, createDefaultRoute, enterProject, historySnapshot, openDialog, routesEqual, setTab, isNavSectionId, resolveRoute } from "./route";

describe("first version routes", () => {
  it("opens Inbox", () => {
    expect(createDefaultRoute()).toMatchObject({ section: "inbox", tab: "all" });
  });

  it("exposes only the Atlas project surfaces", () => {
    expect(
      ["inbox", "atlas", "work", "truth", "dispatch", "dispatch-routing", "dispatch-usage", "integrations", "activity"].every(isNavSectionId),
    ).toBe(true);
    expect(isNavSectionId("decisions")).toBe(false);
    expect(isNavSectionId("reality")).toBe(false);
    expect(isNavSectionId("settings")).toBe(false);
    expect(isNavSectionId("agents")).toBe(false);
    expect(isNavSectionId("integrations-connected")).toBe(false);
    expect(isNavSectionId("integrations-catalog")).toBe(false);
    expect(isNavSectionId("architecture")).toBe(false);
    expect(isNavSectionId("knowledge")).toBe(false);
    expect(isNavSectionId("operations")).toBe(false);
    expect(isNavSectionId("terminal")).toBe(false);
    expect(SECTION_TABS.atlas?.map((tab) => tab.id)).toEqual(["map", "components", "relations"]);
    expect(SECTION_TABS.work?.map((tab) => tab.id)).toEqual(["board", "specs"]);
    expect(SECTION_TABS.truth?.map((tab) => tab.id)).toEqual(["decisions", "facts", "evidence"]);
    expect(SECTION_TABS.dispatch?.map((tab) => tab.id)).toEqual(["runs", "agents"]);
    expect(SECTION_TABS["dispatch-routing"]?.map((tab) => tab.id)).toEqual(["tiers", "learning"]);
    expect(SECTION_TABS["dispatch-usage"]?.map((tab) => tab.id)).toEqual(["stats"]);
    expect(SECTION_TABS.integrations.map((tab) => tab.id)).toEqual(["connected", "catalog"]);
    expect(DEFAULT_TABS.integrations).toBe("connected");
    expect(DEFAULT_TABS.work).toBe("board");
    expect(DEFAULT_TABS.dispatch).toBe("runs");
    expect(DEFAULT_TABS["dispatch-routing"]).toBe("tiers");
    expect(DEFAULT_TABS["dispatch-usage"]).toBe("stats");
  });

  it("opens provider authentication over either Integrations tab without changing history", () => {
    for (const tab of ["connected", "catalog"]) {
      const page = setTab(createDefaultRoute("integrations"), tab);
      const modal = openDialog(page, { type: "connect-integration", providerId: "github" });
      expect(modal).toMatchObject({ section: "integrations", tab, dialog: { type: "connect-integration", providerId: "github" } });
      expect(historySnapshot(modal)).toEqual(page);
      expect(routesEqual(page, modal)).toBe(true);
      expect(closeDialog(modal)).toEqual(page);
    }
  });

  it("switches local projects back to Inbox", () => {
    expect(
      enterProject(createDefaultRoute("inbox"), "project-two", {
        environmentId: "local",
      }),
    ).toMatchObject({
      projectId: "project-two",
      environmentId: "local",
      section: "inbox",
      tab: "all",
    });
  });

  it("falls back unknown routes to Inbox and condemned routes to Atlas", () => {
    expect(resolveRoute("unknown")).toEqual({ section: "inbox", tab: "all" });
    expect(resolveRoute("operations")).toEqual({ section: "atlas", tab: "map" });
    expect(resolveRoute("terminal")).toEqual({ section: "atlas", tab: "map" });
  });

  it("sends the retired Canvas tab id to the Map", () => {
    expect(resolveRoute("atlas", "canvas")).toEqual({ section: "atlas", tab: "map" });
    expect(resolveRoute("atlas", "hierarchy")).toEqual({ section: "atlas", tab: "map" });
    expect(resolveRoute("atlas", "views")).toEqual({ section: "atlas", tab: "map" });
  });

  it("maps pre-Atlas sections to their new homes", () => {
    expect(resolveRoute("architecture", "views")).toEqual({ section: "atlas", tab: "map" });
    expect(resolveRoute("architecture", "components")).toEqual({ section: "atlas", tab: "components" });
    expect(resolveRoute("resources", "nodes")).toEqual({ section: "atlas", tab: "components" });
    expect(resolveRoute("knowledge")).toEqual({ section: "work", tab: "specs" });
    expect(resolveRoute("knowledge", "specs")).toEqual({ section: "work", tab: "specs" });
    expect(resolveRoute("knowledge", "library")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("knowledge", "verdicts")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("knowledge", "docs")).toEqual({ section: "truth", tab: "evidence" });
    expect(resolveRoute("knowledge", "runbooks")).toEqual({ section: "truth", tab: "evidence" });
    expect(resolveRoute("knowledge", "sources")).toEqual({ section: "truth", tab: "evidence" });
    expect(resolveRoute("agents", "facts")).toEqual({ section: "truth", tab: "facts" });
    expect(resolveRoute("agents", "history")).toEqual({ section: "activity", tab: "all" });
    expect(resolveRoute("decisions", "challenged")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("reality", "facts")).toEqual({ section: "truth", tab: "facts" });
    expect(resolveRoute("reality", "sources")).toEqual({ section: "truth", tab: "evidence" });
    expect(resolveRoute("reality", "history")).toEqual({ section: "activity", tab: "all" });
  });

  it("keeps dispatch runs together and moves the other tabs onto their routes", () => {
    expect(resolveRoute("dispatch")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "runs")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "agents")).toEqual({ section: "dispatch", tab: "agents" });
    expect(resolveRoute("dispatch", "worktrees")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "tiers")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch", "learning")).toEqual({ section: "dispatch-routing", tab: "learning" });
    expect(resolveRoute("dispatch", "stats")).toEqual({ section: "dispatch-usage", tab: "stats" });
    expect(resolveRoute("dispatch-agents", "runs")).toEqual({ section: "dispatch", tab: "agents" });
    expect(resolveRoute("dispatch-agents", "tiers")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch-routing")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch-usage")).toEqual({ section: "dispatch-usage", tab: "stats" });
  });

  it("keeps Agents in Settings and resolves Integrations links to its tabs", () => {
    expect(resolveRoute("agents", "access")).toEqual({ section: "inbox", tab: "all" });
    expect(resolveRoute("integrations")).toEqual({ section: "integrations", tab: "connected" });
    expect(resolveRoute("integrations", "catalog")).toEqual({ section: "integrations", tab: "catalog" });
    expect(resolveRoute("integrations-connected")).toEqual({ section: "integrations", tab: "connected" });
    expect(resolveRoute("integrations-catalog")).toEqual({ section: "integrations", tab: "catalog" });
  });
});
