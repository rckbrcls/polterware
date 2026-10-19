import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import shellFeature, { NotesShell, createShellBridge, type ShellWireBridge, type NotesFeature } from "@polterware/feature-notes-shell";
import { fakeBridge } from "./fake-bridge";
import { createFocusStore } from "./store";
import { FocusPage } from "./focus-page";
import focusFeature from "./index";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mount() {
  localStorage.setItem("pwnotes.shell.onboarding", "complete");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.isConnected && !this.closest("[hidden]")
      ? ([new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList)
      : ([] as unknown as DOMRectList);
  });
  const fake = fakeBridge();
  const store = createFocusStore(() => fake.bridge, { autotick: false, now: () => Date.parse("2026-10-04T12:00:00.000Z"), play: async () => "skipped" });
  const extra: NotesFeature = { ...focusFeature, routes: [{ path: "/focus", title: "Focus", component: () => <FocusPage store={store} /> }] };
  const wire = {
    ...fake.bridge,
    spaces: { list: async () => ({ spaces: [] }) },
    tags: { list: async () => ({ tags: [] }) },
    search: { search: async () => ({ hits: [] }) },
    app: { onDeepLink: () => () => {}, getDeepLink: async () => null, requestNotificationAuthorization: async () => true },
  };
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <NotesShell features={[shellFeature, extra]} bridge={createShellBridge(wire as unknown as ShellWireBridge)} />, host);
  return { host, store, fake };
}

describe("Focus route", () => {
  it("starts a quick session from the Focus page", async () => {
    const { host, store, fake } = mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    const focusNav = await vi.waitFor(() => {
      const button = [...host.querySelectorAll("button")].find(element => element.textContent?.trim() === "Focus");
      expect(button).not.toBeUndefined();
      return button!;
    });
    focusNav.click();
    const start = await vi.waitFor(() => {
      const button = [...document.querySelectorAll("button")].find(element => element.textContent?.trim() === "Start");
      expect(button).not.toBeUndefined();
      return button!;
    });
    start.click();
    await store.flush();
    await vi.waitFor(() => expect(fake.bridge.reminders.armOneOff).toHaveBeenCalled());
    expect(store.snapshot().isRunning).toBe(true);
    expect(document.body.textContent).toContain("Quick focus");
    const pause = [...document.querySelectorAll("button")].find(element => element.textContent?.trim() === "Pause");
    pause?.click();
    await store.flush();
    expect(store.snapshot().isRunning).toBe(false);
  });

  it("registers Start focus and the Focus route", () => {
    expect(focusFeature.routes[0]?.path).toBe("/focus");
    expect(focusFeature.commands?.[0]?.label).toBe("Start focus");
    expect(focusFeature.onDeepLink?.(new URL("pwnotes://note/note-1?action=focus"))).toBe(false);
    expect(focusFeature.onDeepLink?.(new URL("pwnotes://today"))).toBe(false);
  });
});
