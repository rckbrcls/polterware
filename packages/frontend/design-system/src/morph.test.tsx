// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Button } from "./button";
import { Morph } from "./morph";

function mount(onConfirm = vi.fn()) {
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => (
    <Morph.Root>
      <Morph.Trigger size="sm" hint="Set this aside.">Later</Morph.Trigger>
      <Morph.Panel title="Move to Later?">
        <Morph.Body>It stays in the Inbox.</Morph.Body>
        <Morph.Footer>
          <Morph.Close />
          <Button size="sm" variant="primary" data-autofocus onClick={onConfirm}>Move to Later</Button>
        </Morph.Footer>
      </Morph.Panel>
    </Morph.Root>
  ), host);
  return { dispose, trigger: host.querySelector<HTMLButtonElement>(".pw-morph-trigger")! };
}

const panel = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);

describe("Morph", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("turns the trigger into a titled dialog panel and focuses its primary button", async () => {
    const mounted = mount();
    dispose = mounted.dispose;
    expect(mounted.trigger.getAttribute("aria-haspopup")).toBe("dialog");
    mounted.trigger.click();
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    expect(mounted.trigger.getAttribute("aria-expanded")).toBe("true");
    const title = document.getElementById(panel()!.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Move to Later?");
    await vi.waitFor(() => expect(document.activeElement).toBe(button("Move to Later")));
  });

  it("closes on Escape, Cancel, and a pointerdown outside", async () => {
    const mounted = mount();
    dispose = mounted.dispose;
    mounted.trigger.click();
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    panel()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(mounted.trigger.getAttribute("aria-expanded")).toBe("false"));

    mounted.trigger.click();
    await vi.waitFor(() => expect(button("Cancel")).toBeDefined());
    button("Cancel")!.click();
    await vi.waitFor(() => expect(mounted.trigger.getAttribute("aria-expanded")).toBe("false"));

    mounted.trigger.click();
    await vi.waitFor(() => expect(mounted.trigger.getAttribute("aria-expanded")).toBe("true"));
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await vi.waitFor(() => expect(mounted.trigger.getAttribute("aria-expanded")).toBe("false"));
    await vi.waitFor(() => expect(panel()).toBeNull());
  });

  it("keeps keys inside the panel so page shortcuts do not fire", async () => {
    const mounted = mount();
    dispose = mounted.dispose;
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    mounted.trigger.click();
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    panel()!.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    window.removeEventListener("keydown", shortcut);
    expect(shortcut).not.toHaveBeenCalled();
  });

  it("follows a controlled open state", async () => {
    const [open, setOpen] = createSignal(false);
    const host = document.body.appendChild(document.createElement("div"));
    dispose = render(() => (
      <Morph.Root open={open()} onOpenChange={setOpen}>
        <Morph.Trigger>Dismiss</Morph.Trigger>
        <Morph.Panel title="Dismiss this item?"><Morph.Footer><Morph.Close /></Morph.Footer></Morph.Panel>
      </Morph.Root>
    ), host);
    setOpen(true);
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    button("Cancel")!.click();
    expect(open()).toBe(false);
  });
});
