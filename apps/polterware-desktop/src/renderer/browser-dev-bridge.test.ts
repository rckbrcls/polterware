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
  it("provides seeded boards and keeps saved-view mutations project-local", async () => {
    installBrowserDevBridge();
    const work = window.polterware.core.work;
    const projectId = "browser-preview";
    const listed = await work.listBoards({ projectId });
    expect(listed.boards).toHaveLength(2);
    expect((await work.listBoards({ projectId: "browser-empty" })).boards).toEqual([]);
    const created = await work.createBoard({ projectId, name: "Review", configJson: '{"version":1}' });
    expect(created.board).toMatchObject({ name: "Review", position: 2, configJson: '{"version":1}' });
    const id = (created.board as { id: string }).id;
    const renamed = await work.updateBoard({ projectId, id, name: "Release" });
    expect(renamed.board).toMatchObject({ id, name: "Release" });
    const ids = (listed.boards as { id: string }[]).map((board) => board.id);
    const reordered = await work.reorderBoards({ projectId, boardIds: [id, ...ids] });
    expect((reordered.boards as { id: string }[]).map((board) => board.id)).toEqual([id, ...ids]);
    await expect(work.reorderBoards({ projectId, boardIds: [id, id] })).rejects.toThrow();
    await expect(work.deleteBoard({ projectId: "browser-empty", id })).rejects.toThrow();
    await work.deleteBoard({ projectId, id });
    expect((await work.listBoards({ projectId })).boards).toHaveLength(2);
    expect((await work.listBoards({ projectId: "browser-empty" })).boards).toEqual([]);
  });

  it("provides isolated demo canvases and persists independent graph, layout, name and sharing updates", async () => {
    installBrowserDevBridge();
    const api = window.polterware.core.canvas;
    const projectId = "browser-preview";
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(2);
    expect((await api.listCanvases({ projectId: "browser-empty" })).canvases).toEqual([]);
    expect((await api.listCanvasTypes()).types).toEqual(expect.arrayContaining([expect.objectContaining({ type: "free", unrestricted: true }), expect.objectContaining({ type: "brainstorm" })]));
    const created = await api.createCanvas({ projectId, name: "Sketch", type: "free", graph: { nodes: [], edges: [] }, layoutJson: "{}" });
    const id = (created.canvas as { id: string }).id;
    await api.updateCanvas({ projectId, id, agentVisible: true });
    await api.updateCanvas({ projectId, id, name: "Renamed", layoutJson: '{"nodes":{}}' });
    const loaded = await api.getCanvas({ projectId, id });
    expect(loaded.canvas).toMatchObject({ name: "Renamed", agentVisible: true, graph: { nodes: [], edges: [] }, layoutJson: '{"nodes":{}}' });
    await expect(api.getCanvas({ projectId: "browser-empty", id })).rejects.toThrow("not found");
    await expect(api.updateCanvas({ projectId, id, name: "" })).rejects.toThrow("name");
    await expect(api.updateCanvas({ projectId, id, graph: { nodes: [{ id: "a", kind: "note" }], edges: [{ id: "ab", from: "a", to: "missing", kind: "relates" }] } })).rejects.toThrow("endpoints");
    await api.deleteCanvas({ projectId, id });
    await expect(api.getCanvas({ projectId, id })).rejects.toThrow("not found");
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(2);
  });

});
