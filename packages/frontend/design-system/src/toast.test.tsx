// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ToastRegion, pushToast } from "./toast";

describe("pushToast", () => {
  let dispose: (() => void) | undefined;
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("renders an action that runs once and dismisses the toast", async () => {
    dispose = render(() => <ToastRegion />, document.body.appendChild(document.createElement("div")));
    const undo = vi.fn();
    pushToast("Archived “Sketch”", "default", { action: { label: "Undo", onClick: undo } });
    const action = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Undo");
      if (!found) throw new Error("no action yet");
      return found;
    });
    expect(document.body.textContent).toContain("Archived “Sketch”");
    action.click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(action.closest(".pw-toast-item")?.hasAttribute("data-exiting")).toBe(true);
  });

  it("keeps a plain toast without an action button", () => {
    dispose = render(() => <ToastRegion />, document.body.appendChild(document.createElement("div")));
    pushToast("Saved");
    const item = [...document.querySelectorAll(".pw-toast-item")].find((entry) => entry.textContent?.includes("Saved"));
    expect(item).toBeDefined();
    expect(item!.querySelector(".pw-toast-action")).toBeNull();
  });
});
