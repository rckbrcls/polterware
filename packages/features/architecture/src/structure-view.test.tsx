import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detailPanelDefaultState, detailPanelStore } from "@polterware/frontend-state";
import { STRUCTURE_SCOPE, StructureView, checkoutLabel, componentKindLabel, type StructureNode } from "./index";

const nodes: StructureNode[] = [
  { id: "sys", parentId: "", level: "system", path: "app", title: "Application", intent: "", repo: "", decisions: [] },
  { id: "api", parentId: "sys", level: "component", path: "app/api", title: "API", intent: "Serves the project", repo: "backend", folder: "src/api", kind: "api", tech: "Go", decisions: [] },
  { id: "web", parentId: "sys", level: "component", path: "app/web", title: "Web", intent: "", repo: "", decisions: [] },
];
let dispose: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function mount(options: { error?: string; loading?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const open = vi.fn((entityId: string) => { detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId, entityKind: "arch-node" }); });
  dispose = render(() => <StructureView projectName="Project" nodes={nodes} counts={{ api: { work: 2, decisions: 1, facts: 3 } }} projectCounts={{ work: 2, decisions: 1, facts: 3 }}
    onOpenNode={open} onSelect={() => {}} onOpenCreate={() => {}} onCloseCreate={() => {}} onCreate={async () => {}} onMove={async () => {}} onUses={async () => {}} {...options} />, host);
  return { host, open };
}
beforeEach(() => detailPanelStore.setState(detailPanelDefaultState));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("Structure collection", () => {
  it("keeps a compact branch tree with one line per node and shows the selected node's document beside it", async () => {
    const { host, open } = mount();
    await tick();
    // The document sits in the page, not the global panel; the project is shown first.
    expect(detailPanelStore.getState().available).toBe(false);
    expect(host.querySelector(".pw-tree--compact")).not.toBeNull();
    expect(host.querySelector(".card-panel")).toBeNull();
    expect(host.querySelector(".pw-structure__document h1")?.textContent).toBe("Project");
    const search = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    search.value = "api";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const api = host.querySelector<HTMLElement>('[data-part="item"][data-value="api"]')!;
    // One line with the title alone; the node's content lives in the document.
    expect(api.textContent).not.toContain("Go");
    expect(api.querySelector('[aria-label="Actions for API"]')).not.toBeNull();
    // A component has no children, so its row offers no Add child; its system does.
    expect(api.querySelector('[aria-label^="Add child"]')).toBeNull();
    expect(host.querySelector('[aria-label="Add child to Application"]')).not.toBeNull();
    // Branch rows are led by a texture +/- key; the open project key shows the minus.
    const key = host.querySelector<HTMLElement>('.pw-tree__key[aria-label="Toggle Project"]')!;
    expect(key.classList.contains("pw-texture-button")).toBe(true);
    expect(key.dataset.state).toBe("open");
    expect(api.closest(".pw-tree__line")?.querySelector(".pw-tree__key--leaf")).not.toBeNull();
    api.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(api.hasAttribute("data-selected")).toBe(true);
    const doc = host.querySelector<HTMLElement>(".pw-structure__document")!;
    expect(doc.querySelector("h1")?.textContent).toBe("API");
    // Metadata sits in one row under the title, the description below it.
    const meta = doc.querySelector(".pw-structure__meta")?.textContent ?? "";
    for (const text of ["Technology", "Go", "Decisions", "backend/src/api", "app/api"]) expect(meta).toContain(text);
    expect(meta).not.toContain("Serves the project");
    expect(doc.textContent).toContain("Serves the project");
  });
  it("retains the toolbar and exposes a collection error", async () => {
    const { host } = mount({ error: "Core unavailable" });
    await tick();
    expect(host.querySelector('[role="searchbox"]')).not.toBeNull();
    expect(host.textContent).toContain("Core unavailable");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Add node"]')?.disabled).toBe(true);
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
