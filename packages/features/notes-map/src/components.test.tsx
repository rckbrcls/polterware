import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shellFeature, { NotesShell, createShellBridge, useNotesShell, type ShellWireBridge, type NotesFeature, type DetailSectionDef } from "@polterware/feature-notes-shell";
import { Button } from "@polterware/frontend-design-system";
import mapFeature from "./index";
import { MapPage } from "./map-page";
import { fakeMapBridge } from "./fake-bridge";
import { PLACE_NOTICE } from "./model";
import { createMapStore } from "./store";
import { createMapBridge } from "./bridge";

vi.mock("@polterware/frontend-map", async importOriginal => {
  const actual = await importOriginal<typeof import("@polterware/frontend-map")>();
  return {
    ...actual,
    MapView: (props: { online?: boolean }) => <div data-map-online={props.online ? "true" : "false"} role="application" aria-label="Map" />,
  };
});

let dispose: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("pwnotes.shell.onboarding", "complete");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.isConnected && !this.closest("[hidden]")
      ? ([new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList)
      : ([] as unknown as DOMRectList);
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  Reflect.deleteProperty(globalThis, "pwnotes");
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function OpenNote() {
  const shell = useNotesShell();
  return <Button onClick={() => shell.openNote("note-1")}>Open note</Button>;
}

function NoteEditor() {
  const shell = useNotesShell();
  return <>{shell.detailSections().map((section: DetailSectionDef) => {
    const Content = section.component;
    return <Content />;
  })}</>;
}

function namedButton(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll("button")].find(button => button.textContent?.replace(/\s+/g, " ").trim() === label);
  if (!found) throw new Error(`Button ${label} missing: ${host.textContent}`);
  return found;
}

function pointerClick(element: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 } as const;
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
  element.click();
}

function mount(path: "map" | "today", seed?: Parameters<typeof fakeMapBridge>[0]) {
  const fake = fakeMapBridge(seed);
  Reflect.set(globalThis, "pwnotes", fake.wire);
  const store = createMapStore(() => createMapBridge(fake.wire));
  const opener: NotesFeature = {
    id: "opener",
    routes: [
      { path: "/today", title: "Today", component: OpenNote },
      { path: "/note/:id", title: "Note", component: NoteEditor },
    ],
  };
  const feature: NotesFeature = {
    ...mapFeature,
    routes: [{ path: "/map", title: "Map", component: () => <MapPage store={store} /> }],
  };
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <NotesShell features={[shellFeature, opener, feature]} bridge={createShellBridge(fake.wire as unknown as ShellWireBridge)} />, host);
  return { host, fake, store, go: () => pointerClick(namedButton(host, path === "map" ? "Map" : "Open note")) };
}

describe("map route and place card", () => {
  it("renders the map and place list without a tile opt-in", async () => {
    const { host, go } = mount("map");
    await vi.waitFor(() => namedButton(host, "Map"));
    go();
    await vi.waitFor(() => expect(host.querySelector("[data-map-online='true']")).not.toBeNull());
    await vi.waitFor(() => expect(host.textContent).toContain("Buy milk"));
    expect(host.textContent).toContain("Home");
    expect(host.textContent).not.toContain("Use online tiles");
  });

  it("saves and clears a place with the note expectedRev", async () => {
    const { host, fake, go } = mount("today");
    await vi.waitFor(() => namedButton(host, "Open note"));
    go();
    await vi.waitFor(() => expect(host.querySelector("#place-name")).not.toBeNull());
    expect(host.textContent).toContain(PLACE_NOTICE);
    const name = host.querySelector<HTMLInputElement>("#place-name")!;
    name.value = "Studio";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    pointerClick(namedButton(host, "Save place"));
    await vi.waitFor(() => expect(fake.wire.places.set).toHaveBeenCalled());
    const sent = (fake.wire.places.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { expectedRev?: string; place?: { name?: string } };
    expect(sent.expectedRev).toBe("3");
    expect(typeof sent.expectedRev).toBe("string");
    expect(sent.place?.name).toBe("Studio");
    await vi.waitFor(() => {
      const clear = namedButton(host, "Clear place");
      if (clear.hasAttribute("disabled") || clear.getAttribute("aria-disabled") === "true") throw new Error("Clear still busy");
      return clear;
    });
    pointerClick(namedButton(host, "Clear place"));
    await vi.waitFor(() => expect(fake.wire.places.clear).toHaveBeenCalled());
    const cleared = (fake.wire.places.clear as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { expectedRev?: string; noteId?: string };
    expect(cleared).toMatchObject({ noteId: "note-1", expectedRev: "4" });
  });
  it("hides address search while off and never sends typed coordinates", async () => {
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const { host, go } = mount("today");
    await vi.waitFor(() => namedButton(host, "Open note")); go();
    await vi.waitFor(() => expect(host.querySelector("#place-name")).not.toBeNull());
    expect(host.querySelector("#place-address")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("searches only on explicit action and keeps the result unsaved until Save place", async () => {
    const send = vi.fn(async () => new Response(JSON.stringify([{ display_name: "Test place", lat: "1", lon: "2" }])));
    vi.stubGlobal("fetch", send);
    const { host, fake, go } = mount("today", { settings: { mapGeocoding: true } });
    await vi.waitFor(() => namedButton(host, "Open note")); go();
    await vi.waitFor(() => expect(host.querySelector("#place-address")).not.toBeNull());
    const address = host.querySelector<HTMLInputElement>("#place-address")!;
    address.value = "Test place"; address.dispatchEvent(new Event("input", { bubbles: true }));
    expect(send).not.toHaveBeenCalled();
    pointerClick(namedButton(host, "Search address"));
    await vi.waitFor(() => namedButton(host, "Use Test place"));
    pointerClick(namedButton(host, "Use Test place"));
    expect(host.querySelector<HTMLInputElement>("#place-lat")!.value).toBe("1");
    expect(host.querySelector<HTMLInputElement>("#place-lng")!.value).toBe("2");
    expect(fake.wire.places.set).not.toHaveBeenCalled();
    expect(host.textContent).toContain("unsaved place edits may be lost");
  });

  it("shows a blocked-host error without claiming a saved place", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { host, go } = mount("today", { settings: { mapGeocoding: true } });
    await vi.waitFor(() => namedButton(host, "Open note")); go();
    await vi.waitFor(() => expect(host.querySelector("#place-address")).not.toBeNull());
    const address = host.querySelector<HTMLInputElement>("#place-address")!;
    address.value = "Test place"; address.dispatchEvent(new Event("input", { bubbles: true }));
    pointerClick(namedButton(host, "Search address"));
    await vi.waitFor(() => expect(host.textContent).toContain("Nominatim may be blocked or unavailable"), { timeout: 2500 });
    expect(host.textContent).toContain("wait for Polterware Notes to reload");
  });

  it("registers Map navigation and delegates deep-link routing to the shell", async () => {
    const { fake } = mount("map");
    expect(mapFeature.sidebar?.[0]?.path).toBe("/map");
    await mapFeature.commands?.[0]?.run();
    expect(fake.wire.app.openDeepLink).toHaveBeenCalledWith("pwnotes://map");
    expect(mapFeature.onDeepLink?.(new URL("pwnotes://map"))).toBe(false);
    expect(mapFeature.onDeepLink?.(new URL("pwnotes://search"))).toBe(false);
  });

});
