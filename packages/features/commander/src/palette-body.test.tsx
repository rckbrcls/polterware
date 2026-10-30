import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaletteBody, RUN_AGENT_PREFIX } from "./palette-body";
import type { PaletteItem } from "./palette-items";
import type { ComposerProperty } from "@polterware/frontend-design-system";

const ITEMS: PaletteItem[] = [
  { id: "nav.inbox", label: "Inbox", group: "Navigation" },
  { id: "nav.activity", label: "Activity", group: "Navigation" },
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

function mount(runProperties?: ComposerProperty[]) {
  const onCommand = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <PaletteBody items={ITEMS} onCommand={onCommand} runAgent runProperties={runProperties} />, host);
  const input = host.querySelector<HTMLInputElement>('input[role="searchbox"]')!;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  const press = (init: KeyboardEventInit) => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));
  return { host, input, type, press, onCommand };
}

describe("PaletteBody Run an agent", () => {
  it("leads the results with Run an agent", () => {
    const { host, type } = mount();
    expect(host.querySelector('[role="option"]')?.textContent).toContain("Run an agent");
    type("fix the toast");
    expect(host.querySelector('[role="option"]')?.textContent).toContain("Run an agent: “fix the toast”");
  });

  it("runs a matching command on Enter", () => {
    const { type, press, onCommand } = mount();
    type("inbox");
    press({});
    expect(onCommand).toHaveBeenCalledWith("nav.inbox");
  });

  it("runs the agent on Enter when no command matches", () => {
    const { type, press, onCommand } = mount();
    type("fix the toast spacing");
    press({});
    expect(onCommand).toHaveBeenCalledWith(`${RUN_AGENT_PREFIX}fix the toast spacing`);
  });

  it("always runs the agent on Cmd+Enter, and never without a prompt", () => {
    const { type, press, onCommand } = mount();
    press({ metaKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    type("inbox");
    press({ metaKey: true });
    expect(onCommand).toHaveBeenCalledWith(`${RUN_AGENT_PREFIX}inbox`);
  });

  it("shows Run an agent's pills under the search", () => {
    const { host } = mount([
      { id: "route", label: "Route", options: [{ value: "tier:normal", label: "Normal" }], value: "tier:normal", onChange: () => {} },
      { id: "card", label: "Card", options: [{ value: "", label: "No card" }], value: "", onChange: () => {}, hidden: true },
    ]);
    const pills = [...host.querySelectorAll('[aria-label="Properties"] button')].map((button) => button.getAttribute("aria-label"));
    expect(pills).toEqual(["Route: Normal"]);
  });
});
