import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detailPanelDefaultState, detailPanelStore } from "@polterware/frontend-state";
import { STRUCTURE_SCOPE, StructureView, type StructureNode } from "./index";

const nodes: StructureNode[] = [
  { id: "sys", parentId: "", level: "system", path: "app", title: "Application", intent: "", repo: "", decisions: [] },
  { id: "api", parentId: "sys", level: "component", path: "app/api", title: "API", intent: "Serves the project", repo: "backend", decisions: [] },
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
  it("searches a nested node, opens its shared detail and keeps the same target in Cards", async () => {
    const { host, open } = mount();
    expect(detailPanelStore.getState().open).toBe(false);
    const search = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    search.value = "api";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const api = host.querySelector<HTMLElement>('[data-part="item"][data-value="api"]')!;
    expect(api).not.toBeNull();
    api.click();
    await tick();
    expect(open).toHaveBeenCalledWith("api");
    expect(detailPanelStore.getState().open).toBe(true);
    expect(host.textContent).toContain("No deploy target yet.");
    expect(host.textContent).toContain("Not recorded");
    expect(host.textContent).toContain("2 Work cards");
    const cards = [...host.querySelectorAll<HTMLElement>('[data-scope="segment-group"][data-part="item"]')].find((item) => item.textContent === "Cards")!;
    cards.click();
    await tick();
    const card = host.querySelector<HTMLButtonElement>('[data-detail-target-id="api"]')!;
    card.click();
    expect(open).toHaveBeenLastCalledWith("api");
    expect(detailPanelStore.getState().activeTarget?.entityId).toBe("api");
  });
  it("retains the toolbar and exposes a collection error", () => {
    const { host } = mount({ error: "Core unavailable" });
    expect(host.querySelector('[role="searchbox"]')).not.toBeNull();
    expect(host.textContent).toContain("Core unavailable");
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Add")?.disabled).toBe(true);
  });
});
