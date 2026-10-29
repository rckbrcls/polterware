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
async function openTab(label: string) {
  const tab = () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.includes(label))!;
  tab().click(); await vi.waitFor(() => expect(tab().getAttribute("aria-selected")).toBe("true"));
}
function button(text: string, root: ParentNode = container) { return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === text)!; }

beforeEach(() => {
  container = document.createElement("div"); document.body.append(container);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => { dispose?.(); dispose = undefined; await Promise.resolve(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const kinds = ["system", "domain", "component", "frontend", "service", "database", "cache", "queue", "rectangle", "cylinder"];
const edges = ["relates", "calls", "reads", "depends_on"];

describe("generalist canvas with semantic components", () => {
  it("adds a component from the library without a Structure picker or an Unverified chip", async () => {
    const { api, host } = mount(record("canvas", []), kinds, edges);
    container.querySelector<HTMLButtonElement>('[aria-label="Shape library"] button[aria-label="Compute"]')!.click();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    const node = vi.mocked(api.update).mock.calls.at(-1)![2].graph!.nodes[0]!;
    expect(node).toMatchObject({ kind: "service", label: "Compute" }); expect(node.ref).toBeUndefined();
    expect(container.querySelector('[data-variant="component"][data-kind="service"][data-family="compute"]')).toBeTruthy();
    expect(host.textContent).not.toContain("Unverified");
  });

  it("edits a component's technology from suggestions or free text, renders it, and undoes it", async () => {
    const canvas = record("canvas", [{ id: "c", kind: "cache", label: "Sessions", propsJson: '{"future":42}' }], [], { c: { x: 100, y: 100, width: 200, height: 120 } });
    const { api, host } = mount(canvas, kinds, edges);
    select(host, 240, 200);
    await openTab("Data");
    expect(container.textContent).toContain("Project reference");
    expect(container.textContent).not.toContain("Unverified");
    container.querySelector<HTMLButtonElement>('button[aria-label="Use Redis"]')!.click();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.nodes[0]!.propsJson)).toEqual({ future: 42, technology: "Redis" });
    expect(host.textContent).toContain("Redis");
    input("Technology", "Valkey 8");
    await vi.waitFor(() => expect(JSON.parse(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.nodes[0]!.propsJson).technology).toBe("Valkey 8"));
    container.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("Redis"));
    expect(host.textContent).not.toContain("Valkey 8");
  });

  it("draws each library entry as it lands on the canvas, with its name", () => {
    mount(record("canvas", []), kinds, edges);
    const library = container.querySelector('[aria-label="Shape library"]')!;
    expect(library.querySelector('button[aria-label="Storage"] [data-family="storage"] path[data-face]')).toBeTruthy();
    expect(library.querySelector('button[aria-label="Cylinder"] [data-shape="cylinder"]')).toBeTruthy();
    expect(library.querySelector('button[aria-label="Storage"] .pw-canvas-library-name')?.textContent).toBe("Storage");
    // Connections are drawn from shapes with the Connect tool, not picked from the library.
    expect(library.textContent).not.toContain("Connections");
  });

  it("finds components by technology name in the library search", () => {
    mount(record("canvas", []), kinds, edges);
    input("Search shapes", "redis");
    const library = container.querySelector('[aria-label="Shape library"]')!;
    expect(library.querySelector('button[aria-label="Storage"]')).toBeTruthy();
    expect(library.querySelector('button[aria-label="Compute"]')).toBeNull();
    expect(library.querySelector('button[aria-label="Rectangle"]')).toBeNull();
  });

  it("keeps drawing shapes free of claims and labels edges", async () => {
    const canvas = record("canvas", [
      { id: "a", kind: "rectangle", label: "Box", propsJson: "{}" }, { id: "b", kind: "service", label: "Orders", propsJson: "{}" },
    ], [{ id: "e", from: "b", to: "a", kind: "reads", propsJson: '{"future":42}' }], { a: { x: 100, y: 100 }, b: { x: 500, y: 100 } });
    const { api, host } = mount(canvas, kinds, edges);
    expect(host.textContent).not.toContain("Unverified");
    expect(container.querySelector('path[marker-end]')).toBeTruthy();
    expect(host.querySelector("text")?.textContent).toBe("Reads");
    select(host, 460, 190);
    input("Edge label", "order rows");
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.edges[0]!.propsJson)).toEqual({ future: 42, label: "order rows" });
    expect(host.querySelector("text")?.textContent).toBe("order rows");
  });

  it("adds a Structure node with an atomic reference and offers no invalid unlink", async () => {
    const entities: StoreEntity[] = [{ kind: "node", id: "core", title: "Core", level: "component" }, { kind: "fact", id: "fact", title: "A fact" }];
    const { api } = mount(record("canvas", []), kinds, edges, entities);
    expect(container.querySelector('[aria-label="Add fact: A fact"]')).toBeNull();
    container.querySelector<HTMLButtonElement>('button[aria-label="Add component: Core"]')!.click();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls.at(-1)![2].graph!.nodes[0]).toMatchObject({ kind: "component", label: "Core", ref: { kind: "node", id: "core" } });
    expect(button("Unlink")).toBeUndefined();
    expect(container.querySelector('[aria-label="Link Fact: A fact"]')).toBeNull();
  });

  it("offers Structure nodes only from the project's own nodes, never as blank tiles", () => {
    const entities: StoreEntity[] = [{ kind: "node", id: "core", title: "Core", level: "component" }];
    mount(record("canvas", []), kinds, edges, entities);
    const library = container.querySelector('[aria-label="Shape library"]')!;
    for (const label of ["System", "Domain", "Component"]) expect(library.querySelector(`button[aria-label="${label}"]`)).toBeNull();
    expect(library.querySelector('button[aria-label="Add component: Core"]')).toBeTruthy();
  });

});
