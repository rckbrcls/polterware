import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import shellFeature, { NotesShell, createShellBridge, type ShellWireBridge, type NotesFeature } from "@polterware/feature-notes-shell";
import { fakeBridge } from "./fake-bridge";
import { createSearchStore } from "./store";
import { SearchPage } from "./search-page";
import { HighlightedSnippet } from "./snippet";
import searchFeature from "./index";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  localStorage.clear();
});

function mount(options: { empty?: boolean; fail?: "search" | "unavailable"; ftsDocuments?: number; notice?: string } = {}) {
  localStorage.setItem("pwnotes.shell.onboarding", "complete");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.isConnected && !this.closest("[hidden]")
      ? ([new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList)
      : ([] as unknown as DOMRectList);
  });
  const fake = fakeBridge({
    hits: options.empty ? [] : undefined, fail: options.fail, ftsDocuments: options.ftsDocuments, notice: options.notice,
  });
  const store = createSearchStore(() => fake.bridge, { debounceMs: 5, now: () => new Date(2026, 9, 4, 15, 0, 0) });
  const extra: NotesFeature = { ...searchFeature, routes: [{ path: "/search", title: "Search", component: () => <SearchPage store={store} /> }] };
  let onLink: ((link: { url: string; route: string }) => void) | undefined;
  const wire = {
    ...fake.bridge,
    notes: { list: async () => ({ notes: [], total: 0 }), get: async () => ({}) },
    reminders: { status: async () => ({ planned: 0, armed: 0, permission: "authorized" }) },
    search: fake.bridge.search,
    app: {
      onDeepLink: (callback: (link: { url: string; route: string }) => void) => { onLink = callback; return () => {}; },
      getDeepLink: async () => null,
      requestNotificationAuthorization: async () => true,
      openDeepLink: async (url: string) => { onLink?.({ url, route: "" }); },
    },
  };
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <NotesShell features={[shellFeature, extra]} bridge={createShellBridge(wire as unknown as ShellWireBridge)} />, host);
  return { host, store, fake, onLink: (url: string) => onLink?.({ url, route: "" }) };
}

async function openSearch(host: HTMLElement) {
  await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
  const commander = await vi.waitFor(() => {
    const button = [...host.querySelectorAll("button")].find(element => element.getAttribute("aria-label") === "Open Commander");
    expect(button).not.toBeUndefined();
    return button!;
  });
  commander.click();
  const input = await vi.waitFor(() => {
    const field = document.querySelector<HTMLInputElement>("#notes-command-input");
    expect(field).not.toBeNull();
    return field!;
  });
  input.value = "Go to Search";
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  const command = await vi.waitFor(() => {
    const button = [...document.querySelectorAll("button")].find(element => element.textContent?.trim() === "Go to Search");
    expect(button).not.toBeUndefined();
    return button!;
  });
  command.click();
  await vi.waitFor(() => expect(document.querySelector("[data-search-page]")).not.toBeNull());
}

describe("Search route", () => {
  it("registers the Search page and Commander Search notes command", () => {
    expect(searchFeature.routes[0]?.path).toBe("/search");
    expect(searchFeature.commands?.[0]).toMatchObject({ id: "search.open", label: "Search notes" });
  });

  it("shows the empty state, then fixture hits with highlighted snippets and no innerHTML", async () => {
    const { host, store } = mount();
    await openSearch(host);
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    expect(document.body.textContent).toContain("Search notes");
    expect(document.body.textContent).toContain("FTS5");
    store.setQuery("milk");
    await store.flush();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Buy milk"));
    const snippet = document.querySelector("[data-search-snippet]")!;
    expect(snippet.querySelector("strong")?.textContent).toBe("milk");
    expect(snippet.innerHTML).not.toContain("<b>");
    expect(document.querySelector("img")).toBeNull();
    const row = document.querySelector<HTMLElement>('[aria-label="Buy milk"]')!;
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

  it("shows no-results and degraded index copy", async () => {
    const { host, store } = mount({ empty: true, ftsDocuments: 0, notice: "Index rebuild in progress" });
    await openSearch(host);
    await vi.waitFor(() => expect(store.loadState()).toBe("live"));
    expect(document.body.textContent).toContain("Index empty");
    store.setQuery("zzzz");
    await store.flush();
    await vi.waitFor(() => expect(document.body.textContent).toContain("No results"));
    expect(document.body.textContent).toContain("Index rebuilding");
  });

  it("applies a trimmed FTS query from pwnotes://search?q= and executes search", async () => {
    const { host, store, fake, onLink } = mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    onLink("pwnotes://search?q=%20packaging%20");
    await vi.waitFor(() => expect(document.querySelector("[data-search-page]")).not.toBeNull());
    await vi.waitFor(() => expect(store.query()).toBe("packaging"));
    const box = document.querySelector<HTMLInputElement>('[aria-label="Search notes"]');
    expect(box?.value).toBe("packaging");
    await store.flush();
    await vi.waitFor(() => expect(fake.bridge.search.search).toHaveBeenCalledWith(expect.objectContaining({ query: "packaging" })));
  });

  it("renders untrusted snippet markup as text", () => {
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <HighlightedSnippet snippet={'<img src=x onerror=alert(1)> <b>milk</b>'} />, host);
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelector("strong")?.textContent).toBe("milk");
  });
});
