import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { DesignSystemProvider, useDesignSystem } from "./provider";
import { DataTable } from "./table";
import { DetailPanel } from "./detail-panel";
import { IconTile, registerIconTileAccents, resolveIconTileAccent } from "./icon-tile";
import { PageEmpty, PageForbidden, PageOffline, EmptyIllustration, FixtureBanner } from "./feedback";
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); localStorage.clear(); });
describe("app adapters and defaults", () => {
  it("namespaces generated keys, preserves explicit widths and delegates table expansion", () => {
    const expand = vi.fn();
    localStorage.setItem("polterware.shell.detail.sidebar.width", "464");
    localStorage.setItem("pwnotes.shell.detail.sidebar.width", "512");
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => <DesignSystemProvider storagePrefix="pwnotes" expandDetail={expand}>
      <DetailPanel.Root open expanded={false} onOpenChange={() => {}} onExpandedChange={() => {}} storageKey="polterware.shell.detail.sidebar.width">
        <DetailPanel.Collection><DataTable.Root rows={[{ id: "one" }]}><DataTable.Table><DataTable.Body>{row => <DataTable.Row row={row} onActivate={() => {}}><DataTable.Cell>Note</DataTable.Cell></DataTable.Row>}</DataTable.Body></DataTable.Table></DataTable.Root></DetailPanel.Collection>
        <DetailPanel.Content>Details</DetailPanel.Content>
      </DetailPanel.Root>
    </DesignSystemProvider>, host);
    expect(host.querySelector<HTMLElement>(".pw-detail-panel-root")!.style.getPropertyValue("--detail-panel-width")).toBe("464px");
    host.querySelector("tr")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(expand).toHaveBeenCalledOnce();
    expect(localStorage.getItem("pwnotes.shell.detail.sidebar.width")).toBe("512");
  });
  it("supports isolated shortcut adapters, nested prefixes and reactive labels", () => {
    const [label, setLabel] = createSignal("Custom chord");
    const match = vi.fn(() => true);
    function Probe() { const ds = useDesignSystem(); const shortcut = ds.createShortcutLabel("shell.toggle_detail"); ds.matchesShortcut("shell.toggle_detail", new KeyboardEvent("keydown")); return <span>{ds.storageKey("width")} {shortcut()}</span>; }
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => <DesignSystemProvider storagePrefix="polterware"><DesignSystemProvider storagePrefix="pwnotes" matchesShortcut={match} createShortcutLabel={() => label}><Probe /></DesignSystemProvider></DesignSystemProvider>, host);
    expect(host.textContent).toBe("pwnotes.width Custom chord");
    setLabel("Changed chord"); expect(host.textContent).toBe("pwnotes.width Changed chord");
    expect(match).toHaveBeenCalledOnce();
  });
  it("reads generated Polterware Notes width without inheriting Polterware preferences", () => {
    localStorage.setItem("pwnotes.shell.detail.sidebar.width", "512");
    localStorage.setItem("polterware.shell.detail.sidebar.width", "464");
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => <DesignSystemProvider storagePrefix="pwnotes"><DetailPanel.Root open expanded={false} onOpenChange={() => {}} onExpandedChange={() => {}}><DetailPanel.Collection>Collection</DetailPanel.Collection><DetailPanel.Content>Detail</DetailPanel.Content></DetailPanel.Root></DesignSystemProvider>, host);
    expect(host.querySelector<HTMLElement>(".pw-detail-panel-root")!.style.getPropertyValue("--detail-panel-width")).toBe("512px");
  });
  it("keeps feedback defaults, supports app artwork and leaves fixture banners hidden", () => {
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => <><PageOffline /><PageForbidden icon={<span>Custom icon</span>} message="Unavailable" /><PageEmpty title="Empty" illustration={<EmptyIllustration>Art</EmptyIllustration>} /><FixtureBanner visible message="Hidden" /></>, host);
    expect(host.textContent).toContain("Polter cannot reach the local backend");
    expect(host.textContent).toContain("Custom icon");
    expect(host.textContent).toContain("○");
    expect(host.textContent).not.toContain("Hidden");
  });
  it("extends accents reversibly and gives explicit Space colors precedence", () => {
    const unregister = registerIconTileAccents({ "Polterware Notes space": "var(--color-brand)" });
    try {
      expect(resolveIconTileAccent("Polterware Notes space")).toBe("var(--color-brand)");
      expect(resolveIconTileAccent("github")).toBe("#EDEDED");
      const host = document.createElement("div"); document.body.append(host);
      dispose = render(() => <IconTile brand="github" accent="var(--color-brand)">S</IconTile>, host);
      expect(host.firstElementChild?.getAttribute("style")).toContain("var(--color-brand)");
    } finally { unregister(); }
    expect(resolveIconTileAccent("Polterware Notes space")).toBe("var(--color-icon-tile-accent-neutral)");
  });
});
