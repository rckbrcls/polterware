// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { promotionText } from "@polterware/feature-canvas/promotion";
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
  it("keeps linked Work cards under a component when Structure moves it", async () => {
    installBrowserDevBridge();
    const work = window.polterware.core.work;
    const projectId = "browser-preview";
    const before = await work.listCards({ projectId });
    type TestNode = { id: string; level: string; path: string; title: string };
    type TestCard = { slug: string; under: string };
    const structure = (await work.listStructure({ projectId })) as unknown as { nodes: TestNode[] };
    const cardsBefore = before.cards as unknown as TestCard[];
    const component = structure.nodes.find((node) => node.level === "component" && cardsBefore.some((card) => card.under === node.path))!;
    const destination = structure.nodes.find((node) => node.level === "system")!;
    const linked = cardsBefore.filter((card) => card.under === component.path);
    await work.apply({ projectId, text: `---\npolter: 1\nsummary: Move component\nrationale: Organize structure\n---\n\n# ${component.path}: ${component.title}\nlevel: component · under: ${destination.path}\n` });
    const moved = ((await work.listStructure({ projectId })) as unknown as { nodes: TestNode[] }).nodes.find((node) => node.id === component.id)!;
    const cards = (await work.listCards({ projectId })).cards as unknown as TestCard[];
    for (const card of linked) expect(cards.find((item) => item.slug === card.slug)?.under).toBe(moved.path);
  });
  it("keeps saved filters per project and surface and upserts by name", async () => {
    installBrowserDevBridge();
    const { savedFilters } = window.polterware.core;
    const projectId = "browser-preview";
    expect((await savedFilters.list({ projectId, surface: "work" })).filters).toEqual([]);
    const mine = await savedFilters.save({ projectId, surface: " work ", name: " Mine ", payloadJson: '{"version":1,"clauses":[]}' });
    expect(mine.filter).toMatchObject({ projectId, surface: "work", name: "Mine", position: 0 });
    const blocked = await savedFilters.save({ projectId, surface: "work", name: "Blocked", payloadJson: '{"version":1}' });
    expect(blocked.filter).toMatchObject({ position: 1 });
    const updated = await savedFilters.save({ projectId, surface: "work", name: "Mine", payloadJson: '{"version":1,"clauses":[{"field":"stage"}]}' });
    const id = (mine.filter as { id: string }).id;
    expect(updated.filter).toMatchObject({ id, position: 0, payloadJson: '{"version":1,"clauses":[{"field":"stage"}]}' });
    const app = await savedFilters.save({ surface: "projects", name: "Mine", payloadJson: '{"version":1}' });
    expect(app.filter).toMatchObject({ projectId: "", position: 0 });
    expect((await savedFilters.list({ surface: "projects" })).filters).toHaveLength(1);
    expect((await savedFilters.list({ projectId: "browser-empty", surface: "work" })).filters).toEqual([]);
    await expect(savedFilters.save({ projectId, surface: "work", name: "Bad", payloadJson: "{}" })).rejects.toThrow("integer version");
    await expect(savedFilters.save({ projectId, surface: "work", name: " ", payloadJson: '{"version":1}' })).rejects.toThrow();
    await savedFilters.delete({ id });
    await expect(savedFilters.delete({ id })).rejects.toThrow("not found");
    const listed = (await savedFilters.list({ projectId, surface: "work" })).filters as { name: string }[];
    expect(listed.map((item) => item.name)).toEqual(["Blocked"]);
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
    expect((await api.listCanvasTypes()).types).toEqual([expect.objectContaining({ type: "canvas", unrestricted: false })]);
    const created = await api.createCanvas({ projectId, name: "Sketch", type: "canvas", graph: { nodes: [], edges: [] }, layoutJson: "{}" });
    const id = (created.canvas as { id: string }).id;
    await api.updateCanvas({ projectId, id, agentVisible: true });
    await api.updateCanvas({ projectId, id, name: "Renamed", layoutJson: '{"nodes":{}}' });
    const loaded = await api.getCanvas({ projectId, id });
    expect(loaded.canvas).toMatchObject({ name: "Renamed", agentVisible: true, graph: { nodes: [], edges: [] }, layoutJson: '{"nodes":{}}' });
    await expect(api.getCanvas({ projectId: "browser-empty", id })).rejects.toThrow("not found");
    await expect(api.updateCanvas({ projectId, id, name: "" })).rejects.toThrow("name");
    await expect(api.updateCanvas({ projectId, id, graph: { nodes: [{ id: "a", kind: "note" }], edges: [{ id: "ab", from: "a", to: "missing", kind: "relates" }] } })).rejects.toThrow("endpoints");
    await expect(api.deleteCanvas({ projectId, id })).rejects.toThrow("archive the canvas");
    await api.setCanvasArchived({ projectId, id, archived: true });
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(2);
    expect((await api.listCanvases({ projectId, archived: true })).canvases).toHaveLength(1);
    await expect(api.updateCanvas({ projectId, id, name: "Edited" })).rejects.toThrow("restore the canvas");
    await api.deleteCanvas({ projectId, id });
    await expect(api.getCanvas({ projectId, id })).rejects.toThrow("not found");
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(2);
  });

  it("archives knowledge like the core: decisions never move and only archived items delete", async () => {
    installBrowserDevBridge();
    const api = window.polterware.core.knowledge;
    const projectId = "browser-preview";
    const active = async () => ((await api.list({ projectId })).items as { id: string }[]).map((item) => item.id);
    await expect(api.setArchived({ id: "verdict-001", archived: true })).rejects.toThrow("decisions are never archived");
    await expect(api.delete({ id: "doc-api" })).rejects.toThrow("archive the item");
    await api.setArchived({ id: "doc-api", archived: true });
    expect(await active()).not.toContain("doc-api");
    const archived = (await api.list({ projectId, archived: true })).items as { id: string; archivedAt: string }[];
    expect(archived).toEqual([expect.objectContaining({ id: "doc-api", archivedAt: expect.any(String) })]);
    await api.setArchived({ id: "doc-api", archived: false });
    expect(await active()).toContain("doc-api");
    await api.setArchived({ id: "doc-api", archived: true });
    await api.delete({ id: "doc-api" });
    expect((await api.list({ projectId, archived: true })).items).toEqual([]);
    expect(await active()).not.toContain("doc-api");
  });

  it("seeds valid demonstrations mixing components and drawing shapes, and enforces Structure refs", async () => {
    installBrowserDevBridge();
    const api = window.polterware.core.canvas;
    const projectId = "browser-preview";
    const { canvases } = await api.listCanvases({ projectId });
    const samples = canvases as { id: string; type: string; name: string; graph: { nodes: { kind: string; propsJson: string }[] } }[];
    expect(samples.every((canvas) => canvas.type === "canvas")).toBe(true);
    for (const canvas of samples) await expect(api.updateCanvas({ projectId, id: canvas.id, name: canvas.name })).resolves.toBeDefined();
    const platform = samples[0]!;
    expect(platform.graph.nodes.find((node) => node.kind === "database")?.propsJson).toContain("Postgres");
    await expect(api.updateCanvas({ projectId, id: platform.id, graph: { nodes: [{ id: "bad", kind: "component", ref: { kind: "fact", id: "fact" } }], edges: [] } })).rejects.toThrow("structure node");
    await expect(api.updateCanvas({ projectId, id: platform.id, graph: { nodes: [{ id: "ok", kind: "cache" }, { id: "x", kind: "spaceship" }], edges: [] } })).rejects.toThrow("not allowed");
    await expect(api.updateCanvas({ projectId, id: platform.id, graph: { nodes: [{ id: "ok", kind: "cache", propsJson: '{"technology":"Redis"}' }], edges: [] } })).resolves.toBeDefined();
  });

  it("previews declared Fact promotion without writing during dry-run and isolates project reads", async () => {
    installBrowserDevBridge();
    const { core } = window.polterware;
    const input = { kind: "fact" as const, title: "Canvas fact", slug: `fact-${crypto.randomUUID()}`, canvasName: "Sketch" };
    const before = (await core.canon.listFacts({ projectId: "browser-empty" })).facts;
    const plan = await core.work.apply({ projectId: "browser-empty", text: promotionText(input), dryRun: true });
    expect(plan.applied).toBe(false);
    expect((await core.canon.listFacts({ projectId: "browser-empty" })).facts).toEqual(before);
    const result = await core.work.apply({ projectId: "browser-empty", text: promotionText(input) });
    expect(result.applied).toBe(true);
    const facts = (await core.canon.listFacts({ projectId: "browser-empty" })).facts as { id: string; statement: string }[];
    const fact = facts.find((item) => item.statement === "Canvas fact")!;
    expect(fact).toMatchObject({ id: expect.stringMatching(/^promoted-/), truthClass: "declared" });
    expect(result.ops).toContain(`+ fact ${fact.id} "Canvas fact"`);
    expect((await core.canon.getFact({ id: fact.id })).fact).toMatchObject(fact);
    expect((await core.canon.listFacts({ projectId: "browser-preview" })).facts).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: fact.id })]));
    const collision = await core.work.apply({ projectId: "browser-empty", text: promotionText(input), dryRun: true });
    expect(collision.ops).toEqual([]);
  });
  it("applies canvas promotions with store IDs and proposed/shape defaults, isolated per project", async () => {
    installBrowserDevBridge();
    const { core } = window.polterware;
    const slug = `promotion-${crypto.randomUUID()}`;
    const input = { kind: "card" as const, title: "Canvas idea", slug, canvasName: "Sketch" };
    const planned = await core.work.apply({ projectId: "browser-empty", text: promotionText(input), dryRun: true });
    expect(planned.applied).toBe(false);
    expect((await core.work.listCards({ projectId: "browser-empty" })).cards).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug })]));
    const result = await core.work.apply({ projectId: "browser-empty", text: promotionText(input) });
    expect(result.applied).toBe(true);
    const created = (await core.work.listCards({ projectId: "browser-empty" })).cards as { id: string; slug: string; stage: string }[];
    expect(created.find((item) => item.slug === slug)).toMatchObject({ id: expect.stringMatching(/^promoted-/), stage: "shape" });
    expect((await core.work.listCards({ projectId: "browser-preview" })).cards).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug })]));
    await expect(core.work.apply({ projectId: "browser-empty", text: promotionText(input) })).rejects.toThrow("already exists");
    await core.work.apply({ projectId: "browser-empty", text: promotionText({ ...input, kind: "decision" }) });
    expect((await core.knowledge.list({ projectId: "browser-empty" })).items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "verdict", title: expect.stringContaining("Canvas idea"), status: "proposed" })]));
  });
});
