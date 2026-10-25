// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasPersistence } from "./persist";
vi.mock("@polterware/feature-knowledge", () => ({ uniqueCardSlug: vi.fn() }));
const input = { kind: "card" as const, title: "A card", slug: "a-card", canvasName: "Sketch" };
function bridge() {
  const core = { work: { listCards: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ cards: [] }), apply: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ applied: true, ops: ['+ card a-card "A card" [shape]'], diagnostics: [] }) }, knowledge: { list: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ items: [] }) } };
  window.polterware = { core } as unknown as Window["polterware"];
  return core;
}
afterEach(() => { Reflect.deleteProperty(window, "polterware"); });
describe("canvas ApplyPolter promotions", () => {
  it("creates a Shape card and resolves its store ID rather than its slug", async () => {
    const core = bridge();
    core.work.listCards.mockResolvedValueOnce({ cards: [] }).mockResolvedValueOnce({ cards: [{ id: "real-id", slug: input.slug, title: input.title }] });
    expect(await canvasPersistence.promote!("p", input)).toEqual({ kind: "card", id: "real-id", slug: input.slug, title: input.title });
    expect(core.work.apply.mock.calls[1]![0]).toMatchObject({ projectId: "p", text: expect.stringContaining("stage: shape"), change: { rationale: "Promoted from canvas Sketch." } });
  });
  it("refuses slug collisions and propagates ApplyPolter server errors", async () => {
    const core = bridge();
    core.work.listCards.mockResolvedValueOnce({ cards: [{ slug: input.slug }] });
    await expect(canvasPersistence.promote!("p", input)).rejects.toThrow("already exists");
    expect(core.work.apply).not.toHaveBeenCalled();
    core.work.apply.mockRejectedValueOnce(new Error("Validation refused"));
    await expect(canvasPersistence.promote!("p", input)).rejects.toThrow("Validation refused");
  });
  it("does not overwrite a removed card hidden from listCards", async () => {
    const core = bridge(); core.work.apply.mockResolvedValueOnce({ applied: false, ops: ['~ card a-card stage: shape'], diagnostics: [] });
    await expect(canvasPersistence.promote!("p", input)).rejects.toThrow("including removed cards");
    expect(core.work.apply).toHaveBeenCalledOnce();
    expect(core.work.apply.mock.calls[0]![0]).toMatchObject({ dryRun: true });
  });
  it("reads the assigned Verdict title from the operation and then resolves the exact entity ID", async () => {
    const core = bridge();
    core.work.apply.mockResolvedValueOnce({ applied: true, ops: ['+ decision Verdict 0005: A card "Verdict 0005: A card"'], diagnostics: [] });
    core.knowledge.list.mockResolvedValue({ items: [{ id: "old", kind: "verdict", title: "Verdict 0004: A card" }, { id: "new-id", kind: "verdict", title: "Verdict 0005: A card" }] });
    expect(await canvasPersistence.promote!("p", { ...input, kind: "decision" })).toEqual({ kind: "decision", id: "new-id", title: "Verdict 0005: A card" });
  });
  it("marks post-creation read errors as already applied so the dialog prevents duplicate writes", async () => {
    const core = bridge(); core.work.listCards.mockResolvedValueOnce({ cards: [] }).mockRejectedValueOnce(new Error("Disconnected"));
    await expect(canvasPersistence.promote!("p", input)).rejects.toMatchObject({ name: "Error", message: expect.stringContaining("entity was created") });
    expect(core.work.apply).toHaveBeenCalledTimes(2);
  });
});
