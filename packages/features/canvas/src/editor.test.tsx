import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
function mount(api: CanvasPort, onBack = vi.fn()) {
  cleanup = render(() => <CanvasEditor canvas={canvas} definition={definition} document={toDocument(canvas)} port={api} onBack={onBack} />, container);
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
    [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Canvases"))!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.update).toHaveBeenCalledTimes(2); expect(onBack).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(api.update).mock.calls[1]![2].layoutJson!).nodes.a.x).toBe(120);
  });
  it("renders load failures with retry instead of throwing or showing an empty canvas list", async () => {
    const api = port(); vi.mocked(api.list).mockRejectedValue(new Error("Core disconnected"));
    cleanup = render(() => <CanvasView projectId="project" port={api} />, container);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Core disconnected"));
    expect(container.textContent).not.toContain("No canvases yet");
  });
});
