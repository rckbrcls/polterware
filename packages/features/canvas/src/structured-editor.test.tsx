import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { CanvasEditor } from "./editor";
import { toDocument, type CanvasPort, type CanvasRecord, type CanvasType } from "./model";
import type { StoreEntity } from "./references";

vi.hoisted(() => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true,
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }));

let dispose: (() => void) | undefined;
let container: HTMLDivElement;
const record = (type: string, nodes: CanvasRecord["graph"]["nodes"], edges: CanvasRecord["graph"]["edges"] = [], positions = {}): CanvasRecord => ({
  id: "canvas", projectId: "project", name: type, type, agentVisible: false, scopeNodeId: "", updatedAt: "", graph: { nodes, edges }, layoutJson: JSON.stringify({ nodes: positions }),
});
function mount(canvas: CanvasRecord, nodeKinds: string[], edgeKinds: string[], entities: StoreEntity[] = []) {
  const definition: CanvasType = { type: canvas.type, label: canvas.type, nodeKinds: [...nodeKinds, "note", "text"], edgeKinds, rules: [], unrestricted: false };
  const api: CanvasPort = { list: vi.fn(), get: vi.fn(), types: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue(canvas), remove: vi.fn() };
  dispose = render(() => <CanvasEditor canvas={canvas} document={toDocument(canvas)} definition={definition} port={api} entities={entities} onBack={vi.fn()} />, container);
  const host = container.querySelector<HTMLElement>('[aria-label="Canvas editor"]')!;
  host.setPointerCapture = vi.fn(); host.hasPointerCapture = () => true; host.releasePointerCapture = vi.fn();
  return { api, host };
}
function pointer(host: HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); host.dispatchEvent(event);
}
function select(host: HTMLElement, x: number, y: number) { pointer(host, "pointerdown", x, y); pointer(host, "pointerup", x, y); }
function input(label: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  element.value = value; element.dispatchEvent(new Event("input", { bubbles: true }));
}
function button(text: string, root: ParentNode = container) { return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === text)!; }

beforeEach(() => {
  container = document.createElement("div"); document.body.append(container);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => { dispose?.(); dispose = undefined; await Promise.resolve(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("structured Desktop canvases", () => {
  it("renders roadmap lanes, arrows and shared date fields; stages incomplete timing without sending it", async () => {
    const canvas = record("roadmap", [
      { id: "lane", kind: "lane", label: "Delivery", propsJson: "{}" },
      { id: "item", kind: "item", label: "Build", propsJson: '{"lane":"lane","start":"2026-10-01","end":"2026-10-15","status":"Planned","future":42}' },
      { id: "milestone", kind: "milestone", label: "Ship", propsJson: '{"lane":"lane","start":"2026-10-20"}' },
    ], [{ id: "dependency", from: "milestone", to: "item", kind: "depends_on", propsJson: "{}" }]);
    const { api, host } = mount(canvas, ["lane", "milestone", "item"], ["depends_on", "precedes"]);
    expect(container.querySelector('[data-variant="lane"]')).toBeTruthy();
    expect(container.querySelector('[data-variant="milestone"] polygon')).toBeTruthy();
    expect(host.textContent).toContain("Planned");
    expect(container.querySelector('path[marker-end]')?.getAttribute("stroke-dasharray")).toBe("6 4");
    select(host, 310, 120); // Date-derived x=240; lane y=48; viewport offset=40.
    expect(container.querySelectorAll('[data-scope="date-picker"][data-part="root"]')).toHaveLength(2);
    expect(container.querySelector('[aria-label="Lane"]')).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
    container.querySelector<HTMLButtonElement>('[aria-label="Clear date"]')!.click();
    await vi.waitFor(() => expect(button("Apply properties").disabled).toBe(true));
    expect(api.update).not.toHaveBeenCalled();
    input("Quarter", "2026-Q4"); input("Status", "In progress");
    expect(button("Apply properties").disabled).toBe(false);
    button("Apply properties").click();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    const patch = vi.mocked(api.update).mock.calls[0]![2];
    expect(JSON.parse(patch.graph!.nodes.find((node) => node.id === "item")!.propsJson)).toMatchObject({ start: "", end: "2026-10-15", quarter: "2026-Q4", status: "In progress", future: 42 });
    expect(host.textContent).toContain("In progress");
  });

  it("renders flow variants, persists a decision arrow label and keeps its degree warning advisory", async () => {
    const canvas = record("flow", [
      { id: "d", kind: "decision", label: "Ready?", propsJson: "{}" }, { id: "s", kind: "step", label: "Work", propsJson: "{}" },
      { id: "start", kind: "start", label: "Start", propsJson: "{}" }, { id: "end", kind: "end", label: "End", propsJson: "{}" },
    ], [{ id: "next", from: "d", to: "s", kind: "next", propsJson: '{"future":42}' }], {
      d: { x: 100, y: 100, width: 240, height: 180 }, s: { x: 500, y: 140 }, start: { x: 100, y: 400 }, end: { x: 500, y: 400 },
    });
    const { api, host } = mount(canvas, ["step", "decision", "start", "end"], ["next"]);
    expect(container.querySelector('[data-variant="decision"] polygon')).toBeTruthy();
    expect(container.querySelectorAll('[data-variant="terminal"] ellipse')).toHaveLength(2);
    expect(container.textContent).toContain("fewer than two outgoing arrows");
    expect(container.querySelector('path[marker-end]')).toBeTruthy();
    select(host, 460, 230);
    input("Arrow label", "Yes");
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.edges[0]!.propsJson)).toEqual({ future: 42, label: "Yes" });
    expect(host.querySelector("text")?.textContent).toBe("Yes");
    expect(container.textContent).toContain("fewer than two outgoing arrows");
    expect(container.textContent).toContain("Saved");
  });

  it("adds architecture shapes with an atomic Structure reference and offers no invalid unlink", async () => {
    const canvas = record("architecture", []);
    const entities: StoreEntity[] = [{ kind: "node", id: "core", title: "Core", level: "component" }, { kind: "fact", id: "fact", title: "A fact" }];
    const { api } = mount(canvas, ["system", "domain", "component", "service", "database", "queue"], ["uses", "contains"], entities);
    container.querySelector<HTMLButtonElement>('button[aria-label="Add from Structure"]')!.click();
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).toBeTruthy());
    const row = document.body.querySelector<HTMLElement>('[aria-label="Add component: Core"]')!;
    expect(row).toBeTruthy(); row.click();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.nodes[0]).toMatchObject({ kind: "component", label: "Core", ref: { kind: "node", id: "core" } });
    expect(button("Unlink")).toBeUndefined();
    expect(container.querySelector('[aria-label="Link Fact: A fact"]')).toBeNull();
  });
});
