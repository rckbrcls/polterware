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
    const atlas = (await work.listAtlas({ projectId })) as unknown as { nodes: TestNode[] };
    const cardsBefore = before.cards as unknown as TestCard[];
    const component = atlas.nodes.find((node) => node.level === "component" && cardsBefore.some((card) => card.under === node.path))!;
    const destination = atlas.nodes.find((node) => node.level === "system")!;
    const linked = cardsBefore.filter((card) => card.under === component.path);
    await work.apply({ projectId, text: `---\npolter: 1\nsummary: Move component\nrationale: Organize structure\n---\n\n# ${component.path}: ${component.title}\nlevel: component · under: ${destination.path}\n` });
    const moved = ((await work.listAtlas({ projectId })) as unknown as { nodes: TestNode[] }).nodes.find((node) => node.id === component.id)!;
    const cards = (await work.listCards({ projectId })).cards as unknown as TestCard[];
    for (const card of linked) expect(cards.find((item) => item.slug === card.slug)?.under).toBe(moved.path);
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
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(6);
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
    expect((await api.listCanvases({ projectId })).canvases).toHaveLength(6);
  });

  it("seeds a valid demonstration for every canvas type and enforces structured rules", async () => {
    installBrowserDevBridge();
    const api = window.polterware.core.canvas;
    const projectId = "browser-preview";
    const { types } = await api.listCanvasTypes();
    const { canvases } = await api.listCanvases({ projectId });
    const samples = canvases as { id: string; type: string; name: string; graph: { nodes: { kind: string }[] } }[];
    expect(samples.map((canvas) => canvas.type)).toEqual((types as { type: string }[]).map((type) => type.type));
    for (const canvas of samples) {
      expect(canvas.graph.nodes.some((node) => node.kind !== "note")).toBe(true);
      await expect(api.updateCanvas({ projectId, id: canvas.id, name: canvas.name })).resolves.toBeDefined();
    }
    const architecture = samples.find((canvas) => canvas.type === "architecture")!;
    await expect(api.updateCanvas({ projectId, id: architecture.id, graph: { nodes: [{ id: "bad", kind: "component", ref: { kind: "fact", id: "fact" } }], edges: [] } })).rejects.toThrow("structure node");
    const roadmap = samples.find((canvas) => canvas.type === "roadmap")!;
    await expect(api.updateCanvas({ projectId, id: roadmap.id, graph: { nodes: [{ id: "bad", kind: "item", propsJson: '{"quarter":"  "}' }], edges: [] } })).rejects.toThrow("start and end");
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
