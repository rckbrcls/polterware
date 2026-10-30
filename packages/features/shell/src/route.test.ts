import { describe, expect, it } from "vitest";
import { DEFAULT_NAV } from "./navigation";
import { DEFAULT_TABS, SECTION_TABS, closeDialog, createDefaultRoute, createHomeRoute, enterProject, goHome, goSection, historySnapshot, isHomeRoute, openDialog, routesEqual, setMilestoneView, setTab, ensureRouteAvailable, isNavSectionId, legacySettingsTab, resolveRoute, sectionMemory, withSectionMemory } from "./route";

describe("first version routes", () => {
  it("opens Inbox", () => {
    expect(createDefaultRoute()).toMatchObject({ section: "inbox", tab: "all" });
  });

  it("exposes the exact project navigation and keeps Canvas after Work", () => {
    expect(
      ["inbox", "structure", "milestones", "canvas", "truth", "dispatch", "dispatch-routing", "dispatch-usage", "activity"].every(isNavSectionId),
    ).toBe(true);
    expect(DEFAULT_NAV.map((item) => item.section)).toEqual([
      "inbox", "activity", "milestones", "canvas", "structure", "truth", "dispatch", "dispatch-routing", "dispatch-usage",
    ]);
    expect(resolveRoute("canvas")).toEqual({ section: "canvas", tab: "all" });
    expect(DEFAULT_TABS.canvas).toBe("all");
    expect(SECTION_TABS.canvas.map((tab) => tab.id)).toEqual(["all"]);
    expect(isNavSectionId("decisions")).toBe(false);
    expect(isNavSectionId("reality")).toBe(false);
    expect(isNavSectionId("settings")).toBe(false);
    expect(isNavSectionId("integrations-connected")).toBe(false);
    expect(isNavSectionId("integrations-catalog")).toBe(false);
    expect(isNavSectionId("architecture")).toBe(false);
    expect(isNavSectionId("knowledge")).toBe(false);
    expect(isNavSectionId("operations")).toBe(false);
    expect(isNavSectionId("terminal")).toBe(false);
    expect(SECTION_TABS.structure?.map((tab) => tab.id)).toEqual(["all"]);
    expect(SECTION_TABS.milestones?.map((tab) => tab.id)).toEqual(["board", "specs"]);
    expect(SECTION_TABS.truth?.map((tab) => tab.id)).toEqual(["decisions", "facts", "docs"]);
    expect(SECTION_TABS.dispatch?.map((tab) => tab.id)).toEqual(["runs"]);
    expect(SECTION_TABS["dispatch-usage"]?.map((tab) => tab.id)).toEqual(["agents", "stats"]);
    expect(SECTION_TABS["dispatch-routing"]?.map((tab) => tab.id)).toEqual(["tiers", "learning"]);
    expect(DEFAULT_TABS.milestones).toBe("board");
    expect(DEFAULT_TABS.dispatch).toBe("runs");
    expect(DEFAULT_TABS["dispatch-routing"]).toBe("tiers");
    expect(DEFAULT_TABS["dispatch-usage"]).toBe("agents");
  });

  it("opens a Settings page over any route without changing history", () => {
    for (const tab of ["platforms-connected", "platforms-catalog", "cli-reference"] as const) {
      const page = createDefaultRoute("structure");
      const modal = openDialog(page, { type: "settings", tab });
      expect(modal).toMatchObject({ section: "structure", dialog: { type: "settings", tab } });
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

  it("falls back unknown routes to Inbox and retired routes to Structure", () => {
    expect(resolveRoute("unknown")).toEqual({ section: "inbox", tab: "all" });
    expect(resolveRoute("operations")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("terminal")).toEqual({ section: "structure", tab: "all" });
  });

  it("resolves retired Structure tabs to the tree", () => {
    expect(resolveRoute("structure", "canvas")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("structure", "hierarchy")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("structure", "views")).toEqual({ section: "structure", tab: "all" });
  });

  it("maps pre-Structure sections to their new homes", () => {
    expect(resolveRoute("architecture", "views")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("architecture", "components")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("resources", "nodes")).toEqual({ section: "structure", tab: "all" });
    expect(resolveRoute("knowledge")).toEqual({ section: "milestones", tab: "specs" });
    expect(resolveRoute("knowledge", "specs")).toEqual({ section: "milestones", tab: "specs" });
    expect(resolveRoute("work", "board")).toEqual({ section: "milestones", tab: "board" });
    expect(resolveRoute("knowledge", "library")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("knowledge", "decisions")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("knowledge", "docs")).toEqual({ section: "truth", tab: "docs" });
    expect(resolveRoute("knowledge", "runbooks")).toEqual({ section: "truth", tab: "docs" });
    expect(resolveRoute("knowledge", "sources")).toEqual({ section: "truth", tab: "docs" });
    expect(resolveRoute("agents", "facts")).toEqual({ section: "truth", tab: "facts" });
    expect(resolveRoute("agents", "history")).toEqual({ section: "activity", tab: "all" });
    expect(resolveRoute("decisions", "challenged")).toEqual({ section: "truth", tab: "decisions" });
    expect(resolveRoute("reality", "facts")).toEqual({ section: "truth", tab: "facts" });
    expect(resolveRoute("reality", "sources")).toEqual({ section: "truth", tab: "docs" });
    expect(resolveRoute("truth", "evidence")).toEqual({ section: "truth", tab: "docs" });
    expect(resolveRoute("reality", "history")).toEqual({ section: "activity", tab: "all" });
  });

  it("keeps dispatch runs together and moves the other tabs onto their routes", () => {
    expect(resolveRoute("dispatch")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "runs")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "agents")).toEqual({ section: "dispatch-usage", tab: "agents" });
    expect(resolveRoute("dispatch", "worktrees")).toEqual({ section: "dispatch", tab: "runs" });
    expect(resolveRoute("dispatch", "tiers")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch", "learning")).toEqual({ section: "dispatch-routing", tab: "learning" });
    expect(resolveRoute("dispatch", "stats")).toEqual({ section: "dispatch-usage", tab: "stats" });
    expect(resolveRoute("dispatch-agents", "runs")).toEqual({ section: "dispatch-usage", tab: "agents" });
    expect(resolveRoute("dispatch-agents", "tiers")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch-routing")).toEqual({ section: "dispatch-routing", tab: "tiers" });
    expect(resolveRoute("dispatch-usage")).toEqual({ section: "dispatch-usage", tab: "agents" });
    expect(resolveRoute("dispatch-usage", "stats")).toEqual({ section: "dispatch-usage", tab: "stats" });
  });

  it("opens the Projects screen before a project is entered", () => {
    const home = createHomeRoute();
    expect(isHomeRoute(home)).toBe(true);
    expect(home.projectId).toBeUndefined();
    expect(home.environmentId).toBeUndefined();
    expect(home).toMatchObject({ home: true, section: "inbox", tab: "all", dialog: null });
    expect(ensureRouteAvailable(home)).toMatchObject({ home: true, section: "inbox", tab: "all" });
    expect(isNavSectionId("home")).toBe(false);
    expect(isNavSectionId("projects")).toBe(false);
  });

  it("enters a project from home and returns without one", () => {
    const home = createHomeRoute();
    const entered = enterProject(home, "project-two", {
      environmentId: "local",
      section: "truth",
      tab: "facts",
    });
    expect(isHomeRoute(entered)).toBe(false);
    expect(entered).toMatchObject({
      home: false,
      projectId: "project-two",
      environmentId: "local",
      section: "truth",
      tab: "facts",
    });
    expect(goSection(entered, "dispatch")).toMatchObject({
      home: false,
      projectId: "project-two",
      section: "dispatch",
      tab: "runs",
    });
    const back = goHome(entered);
    expect(isHomeRoute(back)).toBe(true);
    expect(back.projectId).toBeUndefined();
    expect(back.environmentId).toBeUndefined();
    expect(back.dialog).toBeNull();
    expect(back.expandedDetail).toBeUndefined();
  });

  it("sends the former Core, CLI reference, and Platforms routes to their Settings pages", () => {
    for (const [section, tab, settings] of [
      ["agents", "agents", "agents-setup"],
      ["agents", "server", "agents-mcp"],
      ["agents", "cli", "cli-reference"],
      ["cli", undefined, "cli-reference"],
      ["integrations", undefined, "platforms-connected"],
      ["integrations", "catalog", "platforms-catalog"],
      ["integrations-connected", undefined, "platforms-connected"],
      ["integrations-catalog", undefined, "platforms-catalog"],
    ] as const) {
      expect(legacySettingsTab(section, tab)).toBe(settings);
      expect(resolveRoute(section, tab)).toEqual({ section: "inbox", tab: "all" });
    }
    expect(legacySettingsTab("work", "board")).toBeUndefined();
    expect(isNavSectionId("integrations")).toBe(false);
    expect(isNavSectionId("agents")).toBe(false);
  });
});

describe("section memory", () => {
  it("restores the tab, search, filters and open detail a section was left with", () => {
    const entered = enterProject(createHomeRoute(), "proj-1");
    const left = { ...setTab(goSection(entered, "truth"), "docs"), search: "auth", filters: { kind: ["doc"] }, expandedDetail: { scopeId: "knowledge:docs", entityId: "ev-1", entityKind: "doc" } };
    const restored = withSectionMemory(goSection(goSection(left, "milestones"), "truth"), sectionMemory(left));
    expect(restored).toMatchObject({ section: "truth", tab: "docs", search: "auth", filters: { kind: ["doc"] }, expandedDetail: { entityId: "ev-1" } });
  });

  it("keeps Work's open milestone across a layout switch, and remembers it for the section", () => {
    const work = goSection(enterProject(createHomeRoute(), "proj-1"), "milestones");
    expect(work.milestone).toBeNull();
    const beta = setMilestoneView(work, "ms-beta");
    expect(setTab(beta, "specs")).toMatchObject({ tab: "specs", milestone: "ms-beta" });
    expect(routesEqual(beta, work)).toBe(false);
    const away = goSection(beta, "truth");
    expect(away.milestone).toBeNull();
    expect(withSectionMemory(goSection(away, "milestones"), sectionMemory(beta)).milestone).toBe("ms-beta");
  });

  it("falls back to the default tab when the remembered one no longer exists", () => {
    const route = goSection(enterProject(createHomeRoute(), "proj-1"), "truth");
    expect(withSectionMemory(route, { ...sectionMemory(route), tab: "removed" }).tab).toBe(DEFAULT_TABS.truth);
  });
});
