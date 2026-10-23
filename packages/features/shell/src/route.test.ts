import { describe, expect, it } from "vitest";
import { DEFAULT_TABS, SECTION_TABS, createDefaultRoute, enterProject, isNavSectionId, resolveRoute } from "./route";

describe("first version routes", () => {
  it("opens Inbox", () => {
    expect(createDefaultRoute()).toMatchObject({ section: "inbox", tab: "all" });
  });

  it("exposes only the Atlas project surfaces", () => {
    expect(
      ["inbox", "atlas", "work", "truth", "activity"].every(isNavSectionId),
    ).toBe(true);
    expect(isNavSectionId("decisions")).toBe(false);
    expect(isNavSectionId("reality")).toBe(false);
    expect(isNavSectionId("settings")).toBe(false);
    expect(isNavSectionId("agents")).toBe(false);
    expect(isNavSectionId("integrations")).toBe(false);
    expect(isNavSectionId("architecture")).toBe(false);
    expect(isNavSectionId("knowledge")).toBe(false);
    expect(isNavSectionId("operations")).toBe(false);
    expect(isNavSectionId("terminal")).toBe(false);
    expect(SECTION_TABS.atlas?.map((tab) => tab.id)).toEqual(["map", "components", "relations"]);
    expect(SECTION_TABS.work?.map((tab) => tab.id)).toEqual(["board", "specs"]);
    expect(SECTION_TABS.truth?.map((tab) => tab.id)).toEqual(["decisions", "facts", "evidence"]);
    expect(DEFAULT_TABS.work).toBe("board");
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

  it("sends the retired Agents and Integrations sections to Inbox", () => {
    expect(resolveRoute("agents", "access")).toEqual({ section: "inbox", tab: "all" });
    expect(resolveRoute("integrations", "catalog")).toEqual({ section: "inbox", tab: "all" });
  });
});
