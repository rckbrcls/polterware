import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import type { StoreEntity } from "./references";
import { render } from "solid-js/web";
import { CanvasEditor } from "./editor";
import { CanvasView } from "./index";
import { toDocument, type CanvasPort, type CanvasRecord, type CanvasType } from "./model";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
});

const definition: CanvasType = { type: "free", label: "Free", nodeKinds: ["note", "text"], edgeKinds: [], rules: [], unrestricted: true };
const canvas: CanvasRecord = { id: "canvas", projectId: "project", name: "Sketch", type: "free", agentVisible: false,
  scopeNodeId: "", updatedAt: "", graph: { nodes: [{ id: "a", kind: "note", label: "Original", propsJson: "{}" }], edges: [] },
  layoutJson: '{"nodes":{"a":{"x":100,"y":100,"width":180,"height":100}}}' };
let cleanup: (() => void) | undefined;
let container: HTMLDivElement;
function port(): CanvasPort {
  return { list: vi.fn().mockResolvedValue([canvas]), get: vi.fn().mockResolvedValue(canvas), types: vi.fn().mockResolvedValue([definition]),
    create: vi.fn().mockResolvedValue(canvas), update: vi.fn().mockResolvedValue(canvas), remove: vi.fn().mockResolvedValue(undefined) };
}
function mount(api: CanvasPort, onBack = vi.fn(), entities: readonly StoreEntity[] = []) {
  cleanup = render(() => <CanvasEditor canvas={canvas} definition={definition} document={toDocument(canvas)} port={api} entities={entities} onBack={onBack} />, container);
  const host = container.querySelector<HTMLDivElement>('[aria-label="Canvas editor"]')!;
  host.setPointerCapture = vi.fn(); host.hasPointerCapture = () => true; host.releasePointerCapture = vi.fn();
  return host;
}
function button(label: string) { return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
function pointer(host: HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); host.dispatchEvent(event);
}
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(async () => { cleanup?.(); cleanup = undefined; await Promise.resolve(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Desktop canvas interactions", () => {
  it("moves a shape, saves separate graph/layout, and undoes the whole drag", async () => {
    vi.useFakeTimers(); const api = port(); const host = mount(api);
    pointer(host, "pointerdown", 160, 160); pointer(host, "pointermove", 220, 190); pointer(host, "pointerup", 220, 190);
    await vi.advanceTimersByTimeAsync(500);
    const patch = vi.mocked(api.update).mock.calls[0]![2];
    expect(JSON.parse(patch.layoutJson!).nodes.a).toMatchObject({ x: 160, y: 130 });
    expect(patch.graph?.nodes[0]).toEqual(canvas.graph.nodes[0]);
    button("Undo").click(); await vi.advanceTimersByTimeAsync(500);
    expect(JSON.parse(vi.mocked(api.update).mock.calls[1]![2].layoutJson!).nodes.a).toMatchObject({ x: 100, y: 100 });
  });
  it("keeps the inline input mounted across keystrokes and saves the completed label", async () => {
    vi.useFakeTimers(); const api = port(); mount(api);
    container.querySelector("foreignObject")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await Promise.resolve();
    const input = container.querySelector<HTMLInputElement>('[aria-label="Shape label"]')!;
    expect(input).toBeTruthy(); input.value = "First"; input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(container.querySelector('[aria-label="Shape label"]')).toBe(input);
    input.value = "Final label"; input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph?.nodes[0]?.label).toBe("Final label");
  });
  it("resizes the selection and supports delete and redo from shared controls", async () => {
    vi.useFakeTimers(); const api = port(); const host = mount(api);
    pointer(host, "pointerdown", 160, 160); pointer(host, "pointerup", 160, 160);
    pointer(button("Resize shape"), "pointerdown", 310, 230);
    pointer(host, "pointermove", 370, 270); pointer(host, "pointerup", 370, 270);
    await vi.advanceTimersByTimeAsync(500);
    expect(JSON.parse(vi.mocked(api.update).mock.calls.at(-1)![2].layoutJson!).nodes.a).toMatchObject({ width: 240, height: 140 });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph?.nodes).toEqual([]);
    button("Undo").click(); button("Redo").click(); await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph?.nodes).toEqual([]);
  });
  it("shows validation failures, keeps edits, and retries before leaving", async () => {
    vi.useFakeTimers(); const api = port(); const onBack = vi.fn();
    vi.mocked(api.update).mockRejectedValueOnce(new Error("invalid canvas graph: nodes[0]: requires a ref"));
    const host = mount(api, onBack);
    pointer(host, "pointerdown", 160, 160); pointer(host, "pointermove", 180, 160); pointer(host, "pointerup", 180, 160);
    await vi.advanceTimersByTimeAsync(500);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nodes[0]: requires a ref");
    expect(container.textContent).toContain("Not saved");
    container.querySelector<HTMLButtonElement>('button[aria-label="Canvases"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.update).toHaveBeenCalledTimes(2); expect(onBack).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(api.update).mock.calls[1]![2].layoutJson!).nodes.a.x).toBe(120);
  });
  it("links existing entities, persists the real ref and unlinks without losing the local label", async () => {
    vi.useFakeTimers(); const api = port(); const host = mount(api, vi.fn(), [{ kind: "card", id: "real-card-id", title: "Store card" }]);
    pointer(host, "pointerdown", 160, 160); pointer(host, "pointerup", 160, 160);
    container.querySelector<HTMLElement>('[aria-label="Link Work card: Store card"]')!.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph?.nodes[0]).toMatchObject({ label: "Original", ref: { kind: "card", id: "real-card-id" } });
    expect(host.textContent).toContain("Store card");
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Unlink")!.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph?.nodes[0]).toEqual(canvas.graph.nodes[0]);
    expect(host.textContent).toContain("Original");
  });
  it("updates a linked title on renderer reload and displays missing entities as unverified", () => {
    const linked = { ...canvas, graph: { ...canvas.graph, nodes: [{ ...canvas.graph.nodes[0]!, ref: { kind: "fact", id: "fact-1" } }] } };
    const [entities, setEntities] = createSignal<StoreEntity[]>([{ kind: "fact", id: "fact-1", title: "Initial fact" }]);
    cleanup = render(() => <CanvasEditor canvas={linked} definition={definition} document={toDocument(linked)} port={port()} entities={entities()} onBack={vi.fn()} />, container);
    expect(container.textContent).toContain("Initial fact");
    setEntities([{ kind: "fact", id: "fact-1", title: "Renamed fact" }]);
    expect(container.textContent).toContain("Renamed fact");
    setEntities([]);
    expect(container.textContent).toContain("Missing Fact");
    expect(container.textContent).toContain("Unverified");
  });
  it("keeps ApplyPolter errors in the promotion dialog and links only after explicit success", async () => {
    const api = port(); api.promote = vi.fn().mockRejectedValueOnce(new Error("Server validation refused")).mockResolvedValueOnce({ kind: "card", id: "created", title: "Original", slug: "original" });
    const host = mount(api); pointer(host, "pointerdown", 160, 160); pointer(host, "pointerup", 160, 160);
    [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Promote to Work card"))!.click();
    expect(api.promote).not.toHaveBeenCalled();
    const dialog = () => document.body.querySelector('[role="dialog"]')!;
    const promote = () => [...dialog().querySelectorAll("button")].find((button) => button.textContent === "Promote")!;
    await vi.waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog().querySelector<HTMLInputElement>('[aria-label="Promotion slug"]')!.value).toBe("original");
    promote().click();
    await vi.waitFor(() => expect(dialog().textContent).toContain("Server validation refused"));
    promote().click();
    await vi.waitFor(() => expect(api.promote).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(vi.mocked(api.update).mock.calls.at(-1)?.[2].graph?.nodes[0]?.ref).toEqual({ kind: "card", id: "created" }));
  });
  it("promotes a note to a Fact and persists the returned canon reference", async () => {
    const api = port(); api.promote = vi.fn().mockResolvedValue({ kind: "fact", id: "fact-created", title: "Original", slug: "original" });
    const host = mount(api); pointer(host, "pointerdown", 160, 160); pointer(host, "pointerup", 160, 160);
    [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Promote to Fact"))!.click();
    const dialog = () => document.body.querySelector('[role="dialog"]')!;
    await vi.waitFor(() => expect(dialog()).toBeTruthy());
    const promote = [...dialog().querySelectorAll("button")].find((button) => button.textContent === "Promote")!;
    expect(promote.disabled).toBe(false); expect(dialog().textContent).toContain("Kind: Declared");
    promote.click();
    await vi.waitFor(() => expect(api.promote).toHaveBeenCalledWith("project", { kind: "fact", title: "Original", slug: "original", canvasName: "Sketch" }));
    await vi.waitFor(() => expect(vi.mocked(api.update).mock.calls.at(-1)?.[2].graph?.nodes[0]?.ref).toEqual({ kind: "fact", id: "fact-created" }));
  });
  it("renders load failures with retry instead of throwing or showing an empty canvas list", async () => {
    const api = port(); vi.mocked(api.list).mockRejectedValue(new Error("Core disconnected"));
    cleanup = render(() => <CanvasView projectId="project" port={api} />, container);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Core disconnected"));
    expect(container.textContent).not.toContain("No canvases yet");
  });
  it("renders canvases as an operational table with search and row actions", async () => {
    cleanup = render(() => <CanvasView projectId="project" port={port()} />, container);
    await vi.waitFor(() => expect(container.querySelector('table[aria-label="Canvases"]')).toBeTruthy());
    expect(container.querySelector('[aria-label="Search canvases"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Actions for Sketch"]')).toBeTruthy();
    expect(container.textContent).toContain("Agent-visible");
  });
  it("formats updated timestamps and leaves verified canvas content unflagged", async () => {
    const updated = { ...canvas, updatedAt: "2026-09-20T12:00:00.000Z", graph: { ...canvas.graph,
      nodes: [{ ...canvas.graph.nodes[0]!, ref: { kind: "fact" as const, id: "fact-1" } }],
    } };
    const api = port(); vi.mocked(api.list).mockResolvedValue([updated]); vi.mocked(api.get).mockResolvedValue(updated);
    cleanup = render(() => <CanvasView projectId="project" port={api} entities={[{ kind: "fact", id: "fact-1", title: "Verified fact" }]} />, container);
    await vi.waitFor(() => expect(container.querySelector('table[aria-label="Canvases"]')).toBeTruthy());
    expect(container.textContent).not.toContain(updated.updatedAt);
    expect([...container.querySelectorAll(".pw-status-chip")].map((chip) => chip.textContent)).not.toContain("Unverified");
  });
});
