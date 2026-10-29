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
  it("shows every node detail inside its tree card with no side panel or Cards view", async () => {
    const { host, open } = mount();
    await tick();
    expect(detailPanelStore.getState().open).toBe(false);
    expect(detailPanelStore.getState().available).toBe(false);
    expect(host.querySelector('[aria-label="Structure view"]')).toBeNull();
    const search = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    search.value = "api";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const api = host.querySelector<HTMLElement>('[data-part="item"][data-value="api"]')!;
    expect(api).not.toBeNull();
    expect(api.textContent).toContain("Serves the project");
    expect(api.querySelector('[aria-label="Kind API"]')).not.toBeNull();
    expect(api.querySelector('[aria-label="Technology Go"]')).not.toBeNull();
    expect(api.querySelector('[aria-label="Checkout backend/src/api"]')).not.toBeNull();
    // A component's kind replaces its level badge, and empty fields are left out.
    expect(api.textContent).not.toContain("Component");
    expect(api.textContent).not.toContain("No deploy targets yet.");
    expect(api.textContent).toContain("2 cards");
    expect(api.querySelector('[aria-label="2 Work cards"]')).not.toBeNull();
    expect(api.querySelector('[aria-label="1 Decision"]')).not.toBeNull();
    expect(api.querySelector('[aria-label="3 Facts"]')).not.toBeNull();
    expect(api.querySelector('[aria-label="Actions for API"]')).not.toBeNull();
    // Branch cards are led by a texture +/- key; the open project key shows the minus.
    const key = host.querySelector<HTMLElement>('.pw-tree__key[aria-label="Toggle Project"]')!;
    expect(key.classList.contains("pw-texture-button")).toBe(true);
    expect(key.dataset.state).toBe("open");
    expect(api.closest(".pw-tree__line")?.querySelector(".pw-tree__key--leaf")).not.toBeNull();
    api.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(detailPanelStore.getState().activeTarget?.entityId).toBe("api");
    search.value = "web";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const web = host.querySelector<HTMLElement>('[data-part="item"][data-value="web"]')!;
    expect(web.textContent).toContain("Component");
    expect(web.querySelector('[aria-label^="Technology"], [aria-label^="Checkout"]')).toBeNull();
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
