// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ConfirmRegion, requestConfirm } from "./confirm";

const OPTIONS = { title: "Delete “Sketch” permanently?", description: "The canvas is removed.", recovery: "This cannot be undone.", confirmLabel: "Delete permanently" };

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
}

describe("requestConfirm", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("states scope and recovery, then resolves true on confirm", async () => {
    dispose = render(() => <ConfirmRegion />, document.body.appendChild(document.createElement("div")));
    const answer = requestConfirm(OPTIONS);
    await expect.poll(() => button("Delete permanently")).toBeDefined();
    expect(document.body.textContent).toContain("The canvas is removed.");
    expect(document.body.textContent).toContain("This cannot be undone.");
    button("Delete permanently")!.click();
    await expect(answer).resolves.toBe(true);
  });

  it("resolves false on cancel and when a newer request replaces it", async () => {
    dispose = render(() => <ConfirmRegion />, document.body.appendChild(document.createElement("div")));
    const replaced = requestConfirm(OPTIONS);
    const current = requestConfirm({ ...OPTIONS, confirmLabel: "Archive", tone: "default" });
    await expect(replaced).resolves.toBe(false);
    await expect.poll(() => button("Cancel")).toBeDefined();
    button("Cancel")!.click();
    await expect(current).resolves.toBe(false);
  });
});
