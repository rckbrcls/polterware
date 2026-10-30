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
  it("keeps the branch tree with one compact line per card that expands in place", async () => {
    const { host, open } = mount();
    await tick();
    expect(detailPanelStore.getState().open).toBe(false);
    expect(detailPanelStore.getState().available).toBe(false);
    const search = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    search.value = "api";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const api = host.querySelector<HTMLElement>('[data-part="item"][data-value="api"]')!;
    // One line: kind / technology and the record counts; the details start folded.
    expect(api.textContent).toContain("API / Go / 2 cards / 1 decision / 3 facts");
    const details = api.querySelector<HTMLElement>(".pw-structure-expand")!;
    expect(details.hidden).toBe(true);
    expect(api.querySelector('[aria-label="Actions for API"]')).not.toBeNull();
    // A component has no children, so its card offers no Add child; its system does.
    expect(api.querySelector('[aria-label^="Add child"]')).toBeNull();
    expect(host.querySelector('[aria-label="Add child to Application"]')).not.toBeNull();
    // Branch cards are led by a texture +/- key; the open project key shows the minus.
    const key = host.querySelector<HTMLElement>('.pw-tree__key[aria-label="Toggle Project"]')!;
    expect(key.classList.contains("pw-texture-button")).toBe(true);
    expect(key.dataset.state).toBe("open");
    expect(api.closest(".pw-tree__line")?.querySelector(".pw-tree__key--leaf")).not.toBeNull();
    api.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain("Serves the project");
    expect(details.textContent).toContain("backend/src/api");
    expect(details.textContent).toContain("app/api");
    // A click inside the details keeps them open; a click on the card folds them again.
    details.querySelector<HTMLElement>("dd")!.click();
    await tick();
    expect(details.hidden).toBe(false);
    api.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(details.hidden).toBe(true);
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
