import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detailPanelDefaultState, detailPanelStore } from "@polterware/frontend-state";
import { STRUCTURE_SCOPE, StructureView, checkoutLabel, componentKindLabel, type StructureNode, type StructureNodePatch } from "./index";

const nodes: StructureNode[] = [
  { id: "sys", parentId: "", level: "domain", path: "app", title: "Application", intent: "", repo: "", decisions: [] },
  { id: "api", parentId: "", level: "component", path: "api", title: "API", intent: "Serves the project", repo: "backend", folder: "src/api", kind: "api", tech: "Go", decisions: [] },
  { id: "core", parentId: "", level: "domain", path: "core", title: "Core", intent: "", repo: "", decisions: [] },
  { id: "web", parentId: "sys", level: "component", path: "app/web", title: "Web", intent: "", repo: "", decisions: [] },
];
let dispose: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function mount(options: { error?: string; loading?: boolean; onEditNode?: (nodeId: string, patch: StructureNodePatch) => Promise<void>; onLinkRecord?: (kind: string, id: string, nodeId: string, linked: boolean) => Promise<void>; onMove?: (nodeId: string, parentId: string) => Promise<void> } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const open = vi.fn((entityId: string) => { detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId, entityKind: "arch-node" }); });
  const openRecord = vi.fn();
  dispose = render(() => <StructureView projectName="Project" nodes={nodes} records={{ api: { cards: [{ id: "api-auth", title: "Add auth", caption: "Build", direct: true }], decisions: [{ id: "dec-1", title: "Use Go", caption: "Active", direct: true }], rules: [], docs: [] } }}
    projectRecords={{ cards: [{ id: "api-auth", title: "Add auth" }], decisions: [{ id: "dec-1", title: "Use Go" }, { id: "dec-2", title: "Keep one core" }], rules: [], docs: [] }} onOpenRecord={openRecord}
    onOpenNode={open} onSelect={() => {}} onOpenCreate={() => {}} onCloseCreate={() => {}} onCreate={async () => {}} onMove={async () => {}} {...options} />, host);
  return { host, open, openRecord };
}
beforeEach(() => detailPanelStore.setState(detailPanelDefaultState));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("Structure collection", () => {
  it("searches the tree, keeping the ancestors of each match", async () => {
    const { host } = mount();
    await tick();
    const search = host.querySelector<HTMLInputElement>('.pw-structure__tree [role="searchbox"]')!;
    search.value = "web";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick();
    const labels = () => [...host.querySelectorAll('.pw-structure__tree [data-part="item"], .pw-structure__tree [data-part="branch"]')].map((item) => item.getAttribute("data-value"));
    expect(labels()).toContain("web");
    expect(labels()).toContain("sys");
    expect(labels()).not.toContain("api");
    search.value = "nothing here";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick();
    expect(host.querySelector(".pw-structure__tree-empty")?.textContent).toBe("No matching nodes");
  });
  it("keeps a compact branch tree with one line per node and shows the selected node's document beside it", async () => {
    const { host, open, openRecord } = mount();
    await tick();
    // The document sits in the page, not the global panel; the project is shown first.
    expect(detailPanelStore.getState().available).toBe(false);
    expect(host.querySelector(".pw-tree--compact")).not.toBeNull();
    expect(host.querySelector(".pw-tree__row.card-panel")).toBeNull();
    expect(host.querySelector(".pw-structure__document h1")?.textContent).toBe("Project");
    // The toolbar holds only the tree toggle and Draw as canvas; search and filter live in the tree card.
    expect(host.querySelector('.pw-page-toolbar [role="searchbox"]')).toBeNull();
    expect(host.querySelector('.pw-structure__tree [role="searchbox"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Add node"]')).toBeNull();
    detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId: "web", entityKind: "arch-node" });
    await tick();
    const api = host.querySelector<HTMLElement>('[data-part="item"][data-value="api"]')!;
    // One line with the title alone; the node's content lives in the document.
    expect(api.textContent).not.toContain("Go");
    // The row carries no actions menu; the node's actions sit in its document.
    expect(api.querySelector('[aria-label="Actions for API"]')).toBeNull();
    // A component has no children, so its row offers no add; a domain adds a component and the project a domain.
    expect(api.querySelector('[aria-label^="Add component"]')).toBeNull();
    expect(host.querySelector('[aria-label="Add component to Application"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Add domain"]')).not.toBeNull();
    // Branch rows are led by a texture +/- key; the open project key shows the minus.
    const key = host.querySelector<HTMLElement>('.pw-tree__key[aria-label="Toggle Project"]')!;
    expect(key.classList.contains("pw-texture-button")).toBe(true);
    expect(key.dataset.state).toBe("open");
    expect(api.closest(".pw-tree__line")?.querySelector(".pw-tree__key--leaf")).not.toBeNull();
    // Every row leads with its level's tile.
    expect(api.querySelector(".pw-structure__level")).not.toBeNull();
    expect(host.querySelector('[data-value="sys"] .pw-structure__level')).not.toBeNull();
    api.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(api.hasAttribute("data-selected")).toBe(true);
    const doc = host.querySelector<HTMLElement>(".pw-structure__document")!;
    expect(doc.querySelector("h1")?.textContent).toBe("API");
    expect(doc.querySelector('button[aria-label="Actions for API"]')).not.toBeNull();
    // The description is the summary under the title; the metadata sits on labeled lines below it.
    expect(doc.querySelector(".pw-structure__summary")?.textContent).toBe("Serves the project");
    const head = doc.querySelector(".pw-structure__head")?.textContent ?? "";
    for (const text of ["Properties", "Component", "Go", "Checkout", "backend/src/api", "api"]) expect(head).toContain(text);
    // Every card and decision that cites the node is a table row that opens it; empty sections are left out.
    expect(doc.textContent).toContain("Add auth");
    expect(doc.textContent).not.toContain("Rules");
    expect(doc.querySelector('table[aria-label="Decisions"]')).not.toBeNull();
    doc.querySelector<HTMLElement>('tr[aria-label="Use Go"]')!.click();
    expect(openRecord).toHaveBeenCalledWith("decision", "dec-1");
    // The toolbar closes the tree pane; it stays mounted but leaves the tab order.
    host.querySelector<HTMLButtonElement>('button[aria-label="Hide structure tree"]')!.click();
    await tick();
    expect(host.querySelector<HTMLElement>(".pw-structure__tree")!.inert).toBe(true);
    expect(host.querySelector('button[aria-label="Show structure tree"]')?.getAttribute("aria-expanded")).toBe("false");
  });
  it("edits a node's document in place and links and unlinks its records", async () => {
    const onEditNode = vi.fn(async () => {});
    const onLinkRecord = vi.fn(async () => {});
    const { host } = mount({ onEditNode, onLinkRecord });
    await tick();
    detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId: "api", entityKind: "arch-node" });
    await tick();
    const doc = host.querySelector<HTMLElement>(".pw-structure__document")!;
    const commit = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new FocusEvent("blur"));
    };
    commit(doc.querySelector<HTMLInputElement>('[aria-label="Title"]')!, "Public API");
    expect(onEditNode).toHaveBeenLastCalledWith("api", { title: "Public API" });
    commit(doc.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]')!, "Serves every client");
    expect(onEditNode).toHaveBeenLastCalledWith("api", { intent: "Serves every client" });
    commit(doc.querySelector<HTMLInputElement>('input[aria-label="Technology"]')!, "Go 1.24");
    expect(onEditNode).toHaveBeenLastCalledWith("api", { tech: "Go 1.24" });
    // An empty title is refused and restored; an unchanged value writes nothing.
    const calls = onEditNode.mock.calls.length;
    commit(doc.querySelector<HTMLInputElement>('[aria-label="Title"]')!, " ");
    commit(doc.querySelector<HTMLInputElement>('input[aria-label="Folder"]')!, "src/api");
    expect(onEditNode.mock.calls.length).toBe(calls);
    // A direct link has Unlink; the section's + links what is not linked yet.
    doc.querySelector<HTMLButtonElement>('button[aria-label="Unlink Use Go"]')!.click();
    expect(onLinkRecord).toHaveBeenLastCalledWith("decision", "dec-1", "api", false);
    expect(doc.querySelector('button[aria-label="Link decision"]')).not.toBeNull();
    expect(doc.textContent).toContain("Rules");
  });
  it("changes a node's level and parent from pickers with icon tiles", async () => {
    const onEditNode = vi.fn(async () => {});
    const onMove = vi.fn(async () => {});
    const { host } = mount({ onEditNode, onMove });
    await tick();
    detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId: "api", entityKind: "arch-node" });
    await tick();
    const pick = async (trigger: string, option: string) => {
      host.querySelector<HTMLButtonElement>(`button[aria-label="${trigger}"]`)!.click();
      await tick();
      const row = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes(option))!;
      expect(row.querySelector(".pw-icon-tile, [data-icon-tile]") ?? row.querySelector(".pw-property-picker__icon > span")).not.toBeNull();
      row.click();
      await tick();
    };
    // Right under the project with no children, a component can become a domain; its kind is cleared.
    await pick("Level: Component", "Domain");
    expect(onEditNode).toHaveBeenLastCalledWith("api", { level: "domain", kind: "" });
    await pick("Parent: Project", "Core");
    expect(onMove).toHaveBeenLastCalledWith("api", "core");
    // A domain with children has no parent and keeps its level.
    detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId: "sys", entityKind: "arch-node" });
    await tick();
    expect(host.querySelector('button[aria-label^="Level:"]')).toBeNull();
    expect(host.querySelector('button[aria-label^="Parent:"]')).toBeNull();
  });
  it("exposes a collection error", async () => {
    const { host } = mount({ error: "Core unavailable" });
    await tick();
    expect(host.textContent).toContain("Core unavailable");
  });
});

describe("component labels", () => {
  it("reads kinds from the canvas palette and joins the checkout", () => {
    expect(componentKindLabel("frontend")).toBe("Web app");
    expect(componentKindLabel("database")).toBe("Database");
    expect(componentKindLabel("custom")).toBe("custom");
    expect(checkoutLabel("api", "src/auth")).toBe("api/src/auth");
    expect(checkoutLabel("api", "")).toBe("api");
    expect(checkoutLabel("", "src/auth")).toBe("src/auth");
    expect(checkoutLabel()).toBe("");
  });
});
