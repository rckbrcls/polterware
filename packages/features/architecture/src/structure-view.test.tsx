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
  const open = vi.fn((entityId: string) => detailPanelStore.getState().activateTarget({ scopeId: STRUCTURE_SCOPE, entityId, entityKind: "arch-node" }));
  dispose = render(() => <StructureView projectName="Project" nodes={nodes} counts={{ api: { work: 2, decisions: 1, facts: 3 } }} projectCounts={{ work: 2, decisions: 1, facts: 3 }}
    onOpenNode={open} onSelect={() => {}} onOpenCreate={() => {}} onCloseCreate={() => {}} onCreate={async () => {}} onMove={async () => {}} onUses={async () => {}} {...options} />, host);
  return { host, open };
}
beforeEach(() => detailPanelStore.setState(detailPanelDefaultState));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("Structure collection", () => {
  it("lists the tree as 44px rows and opens a node as its own page", async () => {
    const { host, open } = mount();
    await tick();
    expect(detailPanelStore.getState().open).toBe(false);
    expect(detailPanelStore.getState().available).toBe(false);
    const row = (id: string) => host.querySelector<HTMLElement>(`[aria-label="Project structure"] [data-row-id="${id}"]`);
    // Branches open from their disclosure; the project starts open, its system closed.
    expect(host.querySelector('button[aria-label="Collapse Project"]')).not.toBeNull();
    expect(row("api")).toBeNull();
    host.querySelector<HTMLButtonElement>('button[aria-label="Expand Application"]')!.click();
    await tick();
    const api = row("api")!;
    // A component reads its kind and technology; empty fields are left out.
    expect(api.textContent).toContain("API / Go");
    expect(api.textContent).toContain("backend/src/api");
    expect(api.textContent).toContain("2 cards / 1 decision / 3 facts");
    expect(api.querySelector('[aria-label="Actions for API"]')).not.toBeNull();
    expect(row("web")!.textContent).toContain("Component");
    const search = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    search.value = "web";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(row("api")).toBeNull();
    expect(row("web")).not.toBeNull();
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    row("api")!.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(detailPanelStore.getState().activeTarget?.entityId).toBe("api");
    // The page: the trail back through its system, the description, and the properties rail.
    expect(host.querySelector("h1")?.textContent).toBe("API");
    expect(host.textContent).toContain("Serves the project");
    expect(host.textContent).toContain("Application");
    expect(host.querySelector('[aria-label="Properties"]')?.textContent).toContain("API / Go");
    // A component has no children, so it offers no Add child.
    expect(host.textContent).not.toContain("Add child");
    host.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!.click();
    await tick();
    expect(row("api")).not.toBeNull();
    row("sys")!.click();
    await tick();
    expect(host.querySelector("h1")?.textContent).toBe("Application");
    expect(host.querySelector('[aria-label="Children of Application"]')?.textContent).toContain("Web");
    expect(host.textContent).toContain("Add child");
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
