// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { installBrowserDevBridge } from "./browser-dev-bridge";

describe("installBrowserDevBridge", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "polterware");
  });

  it("leaves an existing bridge in place", () => {
    const existing = { marker: "electron" };
    window.polterware = existing as unknown as Window["polterware"];

    expect(installBrowserDevBridge()).toBe(false);
    expect(window.polterware).toBe(existing);
  });

  it("serves the full project first and an empty one second when the preload is missing", async () => {
    expect(installBrowserDevBridge()).toBe(true);

    const { core } = window.polterware;
    const listed = await core.projects.list();
    expect(listed.projects).toEqual([
      expect.objectContaining({
        id: "browser-preview",
        name: "Browser preview",
        rootPath: "/preview",
        description: "Sample project with data in every surface.",
        status: "active",
        updatedAt: "2026-09-20T12:00:00.000Z",
      }),
      expect.objectContaining({
        id: "browser-empty",
        name: "Empty project",
        rootPath: "/empty",
        status: "active",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    const full = await core.work.listCards({ projectId: "browser-preview" });
    const empty = await core.work.listCards({ projectId: "browser-empty" });
    expect(full.cards.length).toBeGreaterThanOrEqual(12);
    expect(empty.cards).toEqual([]);
  });
});
