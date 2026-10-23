import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { JSX } from "solid-js";
import { DesignSystemProvider } from "@polterware/frontend-design-system";
import feature, { AdvancedPanel, MapPanel, AgentsAccessPanel, DataPanel, GeneralPanel, NotificationsPanel, SearchPanel } from "./index";
import { fakeSettingsBridge } from "./fake-bridge";
import { settingsStore } from "./store";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup());
  settingsStore.reset();
  Reflect.deleteProperty(globalThis, "pwnotes");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mount(component: () => JSX.Element, seed?: Parameters<typeof fakeSettingsBridge>[0]) {
  const fake = fakeSettingsBridge(seed);
  Reflect.set(globalThis, "pwnotes", fake.bridge);
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <DesignSystemProvider storagePrefix="notes-settings-test">{component()}</DesignSystemProvider>, host);
  cleanups.push(() => { dispose(); host.remove(); });
  return { ...fake, host };
}

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === label || element.getAttribute("aria-label") === label);
}

function pointerClick(element: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, composed: true, clientX: 8, clientY: 8, buttons: 1 };
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
  element.click();
}

describe("settings panels", () => {
  it("registers every settings panel on the feature", () => {
    expect(feature.settingsPanels?.map(panel => panel.id)).toEqual([
      "general", "notifications", "focus", "calendar", "settings-map", "search", "agents-access", "agents-activity", "data", "shortcuts", "advanced",
    ]);
  });

  it("saves keep running in background through SettingsService.Set", async () => {
    const { host, bridge } = mount(() => <GeneralPanel />);
    await vi.waitFor(() => expect(host.textContent).toContain("Polterware Notes 0.1.0"));
    const toggle = host.querySelector<HTMLElement>(".pw-switch-row");
    expect(toggle).not.toBeNull();
    pointerClick(toggle!);
    await vi.waitFor(() => expect(bridge.settings.set).toHaveBeenCalledWith({ keys: ["app.keepRunningInBackground"], settings: { appKeepRunningInBackground: false } }));
  });

  it("asks for notification permission when it is not determined", async () => {
    const { host, bridge } = mount(() => <NotificationsPanel />);
    await vi.waitFor(() => expect(button("Enable notifications")).toBeTruthy());
    button("Enable notifications")!.click();
    await vi.waitFor(() => expect(bridge.app.requestNotificationAuthorization).toHaveBeenCalled());
  });

  it("tells the user to open macOS System Settings when notifications are denied", async () => {
    const fake = fakeSettingsBridge();
    fake.setPermission("denied");
    Reflect.set(globalThis, "pwnotes", fake.bridge);
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <DesignSystemProvider storagePrefix="notes-settings-test"><NotificationsPanel /></DesignSystemProvider>, host);
    cleanups.push(() => { dispose(); host.remove(); });
    await vi.waitFor(() => expect(host.textContent).toContain("Open System Settings"));
    expect(button("Enable notifications")).toBeFalsy();
  });

  it("reindexes and shows progress then the new document count", async () => {
    const { host } = mount(() => <SearchPanel />);
    await vi.waitFor(() => expect(host.textContent).toContain("12 documents"));
    button("Reindex")!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("24 documents"));
  });

  it("rotates the token and marks the previous value invalid", async () => {
    const { host } = mount(() => <AgentsAccessPanel />);
    await vi.waitFor(() => expect(button("Rotate")).toBeTruthy());
    const previous = settingsStore.agent()?.token;
    button("Rotate")!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("Previous token is no longer valid"));
    expect(settingsStore.agent()?.token).not.toBe(previous);
    expect(settingsStore.previousToken()).toBe(previous);
  });

  it("keeps tokens out of DOM text and form values until explicitly revealed", async () => {
    const { host } = mount(() => <AgentsAccessPanel />);
    await vi.waitFor(() => expect(settingsStore.agent()?.token).toBeTruthy());
    const previous = settingsStore.agent()!.token!;
    const dom = () => host.textContent + [...host.querySelectorAll("input, textarea")]
      .map(element => (element as HTMLInputElement).value).join(" ");
    expect(dom()).not.toContain(previous);
    button("Reveal token")!.click();
    expect(dom()).toContain(previous);
    button("Hide token")!.click();
    expect(dom()).not.toContain(previous);
    button("Rotate")!.click();
    await vi.waitFor(() => expect(settingsStore.tokenInvalidated()).toBe(true));
    const next = settingsStore.agent()!.token!;
    expect(settingsStore.revealedToken()).toBe(false);
    expect(dom()).not.toContain(previous);
    expect(dom()).not.toContain(next);
    button("Reveal token")!.click();
    expect(dom()).toContain(next);
    expect(dom()).not.toContain(previous);
  });

  it("reports Test connection failure when MCP is off", async () => {
    const { host } = mount(() => <AgentsAccessPanel />, { agentsMcpEnabled: false });
    await vi.waitFor(() => expect(button("Test connection")).toBeTruthy());
    button("Test connection")!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("MCP is off"));
  });

  it("requires typing RESET and does not delete data", async () => {
    const { host, bridge } = mount(() => <DataPanel />);
    await vi.waitFor(() => expect(host.textContent).toContain("Type RESET"));
    const reset = [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === "Reset local data")!;
    expect(reset.disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Type RESET to confirm"]')!;
    input.value = "RESET";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(reset.disabled).toBe(false));
    reset.click();
    expect(host.textContent).toContain("No data was changed");
    expect(bridge.maintenance.export).not.toHaveBeenCalled();
  });
  it("wires Advanced controls and keeps login unavailable", async () => {
    const { host, bridge } = mount(() => <AdvancedPanel />);
    await vi.waitFor(() => expect(button("Open logs")).toBeTruthy());
    button("Open logs")!.click();
    await vi.waitFor(() => expect(host.textContent).toContain("Log revealed in Finder."));
    button("Open data folder")!.click();
    await vi.waitFor(() => expect(bridge.app.openDataFolder).toHaveBeenCalledWith());
    const toggle = [...host.querySelectorAll<HTMLElement>(".pw-switch-row")].find(row => row.textContent?.includes("Reduce transparency"))!;
    pointerClick(toggle);
    await vi.waitFor(() => expect(bridge.app.setReduceTransparency).toHaveBeenCalledWith(true));
    expect(host.textContent).toContain("Automatic launch at login is unavailable");
    expect(host.textContent).toContain("Unavailable");
  });

  it("discloses address sharing and renderer reload before enabling geocoding", async () => {
    const { host, bridge } = mount(() => <MapPanel />);
    await vi.waitFor(() => expect(host.textContent).toContain("Typed address text is sent to Nominatim"));
    expect(host.textContent).toContain("reloads Polterware Notes");
    const toggle = [...host.querySelectorAll<HTMLElement>(".pw-switch-row")].find(row => row.textContent?.includes("Address search"))!;
    pointerClick(toggle);
    await vi.waitFor(() => expect(bridge.settings.set).toHaveBeenCalledWith({ keys: ["map.geocoding"], settings: { mapGeocoding: true } }));
  });

});
