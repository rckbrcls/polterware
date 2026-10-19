// @vitest-environment jsdom

import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DETAIL_PANEL_DEFAULT_WIDTH,
  DETAIL_PANEL_MAX_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  DetailPanel,
  clampDetailPanelWidth,
} from "./detail-panel";
import { readDetailPanelWidth } from "./detail-panel";
import { A11yDialog } from "./dialog";
import { PageToolbar } from "./page";
import { ActiveFilterBar } from "./active-filter-bar";
import { spring } from "./springs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./dropdown-menu";
import { repoPath } from "../test/repo-path";

const css = () =>
  readFileSync(repoPath("packages/frontend/design-system/src/detail-panel.css"), "utf8");
const source = () =>
  readFileSync(repoPath("packages/frontend/design-system/src/side-panel/side-panel.tsx"), "utf8");

type Harness = {
  host: HTMLDivElement;
  root: () => HTMLElement;
  sidebar: () => HTMLElement;
  open: () => boolean;
  setOpen: (open: boolean) => void;
  expanded: () => boolean;
  setExpanded: (expanded: boolean) => void;
  setFilters: (active: boolean) => void;
  positioner: () => HTMLDivElement;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

function mount(options: {
  open?: boolean;
  expanded?: boolean;
  available?: boolean;
  storageKey?: string;
  legacyStorageKey?: string;
  mode?: "reserve" | "overlay";
  resizable?: boolean;
  dismissOnOutsideClick?: boolean;
  shortcuts?: boolean;
  content?: () => JSX.Element;
} = {}): Harness {
  let dimensions = { width: 1200, height: 800 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("pw-detail-panel__workspace") ? new DOMRect(0, 0, dimensions.width, dimensions.height) : new DOMRect();
  });
  const host = document.createElement("div");
  document.body.append(host);
  const [open, setOpen] = createSignal(options.open ?? true);
  const [expanded, setExpanded] = createSignal(options.expanded ?? false);
  const [filters, setFilters] = createSignal(false);
  const dispose = render(
    () => (
      <DetailPanel.Root
        open={open()}
        expanded={expanded()}
        available={options.available ?? true}
        activeEntityId="alpha"
        onOpenChange={(next) => { setOpen(next); if (!next) setExpanded(false); }}
        onExpandedChange={setExpanded}
        storageKey={options.storageKey}
        legacyStorageKey={options.legacyStorageKey}
        mode={options.mode}
        resizable={options.resizable}
        dismissOnOutsideClick={options.dismissOnOutsideClick}
        shortcuts={options.shortcuts}
      >
        <DetailPanel.Collection>
          <PageToolbar.Root><PageToolbar.Actions><button>Filter</button></PageToolbar.Actions></PageToolbar.Root>
          <ActiveFilterBar items={filters() ? [{ id: "status", label: "Open", onRemove: () => setFilters(false) }] : []} />
          <button data-detail-opener data-detail-target-id="alpha" onClick={() => { setOpen(true); }}>Alpha row</button>
        </DetailPanel.Collection>
        <DetailPanel.Content>
          {options.content?.() ?? (
            <>
              <DetailPanel.Header />
              <DetailPanel.Body>
                <button type="button">Inside detail</button>
              </DetailPanel.Body>
            </>
          )}
        </DetailPanel.Content>
      </DetailPanel.Root>
    ),
    host,
  );
  return {
    host,
    root: () => host.querySelector<HTMLElement>(".pw-detail-panel-root")!,
    sidebar: () => host.querySelector<HTMLElement>(".pw-detail-panel__frame")!,
    open,
    setOpen,
    expanded,
    setExpanded,
    setFilters,
    positioner: () => host.querySelector<HTMLDivElement>(".pw-detail-panel__frame")!,
    resize: (width, height) => { dimensions = { width, height }; window.dispatchEvent(new Event("resize")); },
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

function press(init: KeyboardEventInit, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, ...init }));
}

function pointer(target: HTMLElement, type: string, x: number, y: number) {
  target.setPointerCapture ??= vi.fn();
  target.hasPointerCapture ??= () => true;
  target.releasePointerCapture ??= vi.fn();
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
  target.dispatchEvent(event);
}

function pointerClick(target: HTMLElement) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, button: 0 }));
}

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.replaceChildren();
});

describe("lateral DetailPanel", () => {
  it("clamps width for the sidebar and ignores floating JSON preferences", () => {
    expect(clampDetailPanelWidth(NaN, 0)).toBe(400);
    expect(clampDetailPanelWidth(5000, 1200)).toBe(720);
    expect(clampDetailPanelWidth(100, 1200)).toBe(320);
    expect(clampDetailPanelWidth(400, 250)).toBe(234);
    expect(readDetailPanelWidth("480")).toBe(480);
    for (const raw of [null, "bad", "{}", '{"version":2,"dock":"left","width":520,"height":420}']) {
      expect(readDetailPanelWidth(raw)).toBe(400);
    }
  });
  it("migrates numeric legacy width without overwriting floating geometry", () => {
    const oldKey = "test.old", newKey = "test.sidebar";
    const floating = JSON.stringify({ version: 2, dock: "bottom-right", width: 520, height: 420 });
    localStorage.setItem(oldKey, floating);
    const panel = mount({ storageKey: newKey, legacyStorageKey: oldKey });
    expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("400px");
    press({ key: "ArrowLeft" }, panel.host.querySelector<HTMLElement>(".pw-detail-panel__resize-handle")!);
    expect(localStorage.getItem(oldKey)).toBe(floating);
    expect(localStorage.getItem(newKey)).toBe("416");
    panel.dispose(); localStorage.removeItem(newKey); localStorage.setItem(oldKey, "480");
    const migrated = mount({ storageKey: newKey, legacyStorageKey: oldKey });
    expect(migrated.root().style.getPropertyValue("--detail-panel-width")).toBe("480px");
    migrated.dispose();
  });
  it("opens only from entity activation and returns focus to that entity on close", async () => {
    const panel = mount({ open: false });
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    expect(panel.positioner().hidden).toBe(true);
    expect(panel.host.querySelector('[aria-label="Show details"]')).toBeNull();
    expect(panel.host.querySelector("[data-detail-panel-toggle]")).toBeNull();
    const row = panel.host.querySelector<HTMLButtonElement>("[data-detail-opener]")!;
    row.focus(); row.click();
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("408px");
    const close = panel.host.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!;
    close.focus(); close.click();
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    expect(panel.sidebar().hasAttribute("inert")).toBe(true);
    await Promise.resolve();
    expect(document.activeElement).toBe(row);
    panel.dispose();
  });
  it("keeps toolbar and changing filters above the workspace in every panel state", () => {
    const panel = mount();
    const header = panel.host.querySelector<HTMLElement>(".pw-detail-panel__collection-header")!;
    const workspace = panel.host.querySelector<HTMLElement>(".pw-detail-panel__workspace")!;
    const toolbar = panel.host.querySelector<HTMLElement>(".pw-page-toolbar")!;
    expect(header.parentElement).toBe(panel.root());
    expect(header.nextElementSibling).toBe(workspace);
    expect(header.contains(toolbar)).toBe(true);
    expect(workspace.contains(panel.sidebar())).toBe(true);
    expect(workspace.contains(toolbar)).toBe(false);
    expect(header.querySelector(".pw-active-filter-bar")).toBeNull();
    panel.setFilters(true);
    const filter = panel.host.querySelector<HTMLElement>(".pw-active-filter-bar")!;
    expect(header.contains(filter)).toBe(true);
    expect(toolbar.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    panel.setExpanded(true);
    expect(header.querySelector(".pw-page-toolbar")).toBe(toolbar);
    expect(toolbar.closest("[inert]")).toBeNull();
    expect(panel.host.querySelector(".pw-detail-panel__collection")!.hasAttribute("inert")).toBe(true);
    panel.resize(700, 400);
    panel.setExpanded(false);
    panel.setOpen(false);
    expect(header.contains(toolbar)).toBe(true);
    expect(header.contains(filter)).toBe(true);
    expect(css()).toMatch(/\.pw-detail-panel__workspace\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--detail-panel-space\);/);
    expect(css()).not.toMatch(/\.pw-detail-panel-root\s*{[^}]*grid-template-columns/);
    expect(readFileSync(repoPath("packages/frontend/design-system/src/tabs.css"), "utf8")).toContain("padding: 8px 8px 4px;");
    panel.dispose();
  });
  it("renders collection controls inline without a panel", () => {
    const host = document.createElement("div"); document.body.append(host);
    const dispose = render(() => <div>
      <PageToolbar.Root><PageToolbar.Actions><button>Filter</button></PageToolbar.Actions></PageToolbar.Root>
      <ActiveFilterBar items={[{ id: "status", label: "Open", onRemove: () => undefined }]} />
    </div>, host);
    expect(host.querySelector(".pw-page-toolbar")!.parentElement).toBe(host.firstElementChild);
    expect(host.querySelector(".pw-active-filter-bar")!.parentElement).toBe(host.firstElementChild);
    dispose(); host.remove();
  });
  it("expands without losing its saved lateral width", () => {
    const panel = mount({ storageKey: "test.sidebar" });
    const divider = panel.host.querySelector<HTMLElement>(".pw-detail-panel__resize-handle")!;
    press({ key: "ArrowLeft", shiftKey: true }, divider);
    expect(localStorage.getItem("test.sidebar")).toBe("464");
    panel.setExpanded(true);
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    expect(divider.hidden).toBe(true);
    panel.setExpanded(false);
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("472px");
    panel.resize(250, 200);
    expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("234px");
    expect(localStorage.getItem("test.sidebar")).toBe("464");
    panel.resize(1200, 800);
    expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("464px");
    panel.dispose();
  });
  it("captures resize gestures, restores cancellations and persists only the result", () => {
    const panel = mount({ storageKey: "test.sidebar" });
    const divider = panel.host.querySelector<HTMLElement>(".pw-detail-panel__resize-handle")!;
    pointer(divider, "pointerdown", 800, 200);
    pointer(divider, "pointermove", 700, 200);
    expect(localStorage.getItem("test.sidebar")).toBeNull();
    press({ key: "Escape" });
    expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("400px");
    pointer(divider, "pointerdown", 800, 200);
    pointer(divider, "pointermove", 700, 200);
    pointer(divider, "pointerup", 700, 200);
    expect(localStorage.getItem("test.sidebar")).toBe("500");
    divider.click();
    expect(panel.open()).toBe(true);
    panel.dispose();
  });
  it("never reserves collection space for an overlay, including resize, expand and exit", async () => {
    const panel = mount({ mode: "overlay", storageKey: "test.overlay" });
    try {
      expect(panel.root().dataset.mode).toBe("overlay");
      expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
      const divider = panel.host.querySelector<HTMLElement>(".pw-detail-panel__resize-handle")!;
      press({ key: "ArrowLeft", shiftKey: true }, divider);
      expect(localStorage.getItem("test.overlay")).toBe("464");
      expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("464px");
      expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
      panel.setExpanded(true);
      expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
      panel.setExpanded(false);
      await nextPaint();
      panel.setOpen(false);
      expect(panel.sidebar().hidden).toBe(false);
      expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
      await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
      expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    } finally { panel.dispose(); }
    const restored = mount({ mode: "overlay", storageKey: "test.overlay" });
    try { expect(restored.root().style.getPropertyValue("--detail-panel-width")).toBe("464px"); }
    finally { restored.dispose(); }
  });
  it("uses distinct frame ids and dispatches each shortcut to the focused root only", () => {
    const first = mount(), second = mount();
    try {
      expect(first.sidebar().id).not.toBe(second.sidebar().id);
      for (const panel of [first, second]) {
        expect(panel.host.querySelector('[role="separator"]')?.getAttribute("aria-controls")).toBe(panel.sidebar().id);
      }
      first.host.querySelector<HTMLButtonElement>(".pw-detail-panel__body button")!.focus();
      press({ key: "j", metaKey: true, shiftKey: true });
      expect(first.expanded()).toBe(true);
      expect(second.expanded()).toBe(false);
      press({ key: "j", metaKey: true });
      expect(first.open()).toBe(false);
      expect(second.open()).toBe(true);
    } finally { second.dispose(); first.dispose(); }
  });
  it("can disable resizing, outside dismissal and global shortcuts while retaining local controls", () => {
    const panel = mount({ resizable: false, dismissOnOutsideClick: false, shortcuts: false });
    const outside = document.createElement("button"); document.body.append(outside);
    try {
      const divider = panel.host.querySelector<HTMLElement>('[role="separator"]')!;
      expect(divider.hidden).toBe(true);
      press({ key: "ArrowLeft" }, divider);
      expect(panel.root().style.getPropertyValue("--detail-panel-width")).toBe("400px");
      outside.click();
      press({ key: "j", metaKey: true });
      expect(panel.open()).toBe(true);
      press({ key: "j", metaKey: true, shiftKey: true });
      expect(panel.expanded()).toBe(false);
      panel.host.querySelector<HTMLButtonElement>('[aria-label="Expand details"]')!.click();
      expect(panel.expanded()).toBe(true);
      panel.host.querySelector<HTMLButtonElement>(".pw-detail-panel__body button")!.focus();
      press({ key: "Escape" });
      expect(panel.expanded()).toBe(false);
      panel.host.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click();
      expect(panel.open()).toBe(false);
    } finally { outside.remove(); panel.dispose(); }
  });
  it("does not dismiss or claim shortcuts from hidden page roots", () => {
    const panel = mount();
    const outside = document.createElement("button"); document.body.append(outside);
    try {
      for (const hidden of ["hidden", "inert", "aria-hidden", "display"] as const) {
        if (hidden === "display") panel.host.style.display = "none";
        else panel.host.setAttribute(hidden, hidden === "aria-hidden" ? "true" : "");
        outside.click();
        press({ key: "j", metaKey: true });
        expect(panel.open(), hidden).toBe(true);
        panel.host.removeAttribute(hidden);
        panel.host.style.display = "";
      }
      outside.click();
      expect(panel.open()).toBe(false);
    } finally { outside.remove(); panel.dispose(); }
  });
  it("keeps controls without a feature header and hides them when details are unavailable", () => {
    for (const message of ["No selection", "Loading details", "Details could not be loaded"]) {
      const panel = mount({ content: () => <div>{message}</div> });
      expect(panel.host.querySelector('[aria-label="Close details"]')).not.toBeNull();
      expect(panel.host.querySelector('[aria-label="Expand details"]')).not.toBeNull();
      expect(panel.host.querySelector(".pw-detail-panel__collection-header .pw-page-toolbar")).not.toBeNull();
      panel.dispose();
    }
    const unavailable = mount({ available: false });
    expect(unavailable.sidebar().hidden).toBe(true);
    expect(unavailable.host.querySelector("[data-detail-panel-toggle]")).toBeNull();
    expect(unavailable.host.querySelector(".pw-page-toolbar")).not.toBeNull();
    unavailable.dispose();
  });
  it("retains shell shortcuts and leaves selection activation separate", () => {
    const panel = mount({ open: false });
    press({ key: "j", metaKey: true }); expect(panel.open()).toBe(false);
    press({ key: "j", metaKey: true, shiftKey: true }); expect(panel.expanded()).toBe(false);
    panel.host.querySelector<HTMLButtonElement>("[data-detail-opener]")!.click();
    expect(panel.open()).toBe(true);
    press({ key: "j", metaKey: true, shiftKey: true }); expect(panel.expanded()).toBe(true);
    press({ key: "j", metaKey: true }); expect(panel.open()).toBe(false);
    panel.dispose();
  });
  it("exports the compound contract without header icon actions", () => {
    expect(Object.keys(DetailPanel)).toEqual([
      "Root",
      "Collection",
      "CollectionHeader",
      "Header",
      "Title",
      "PrimaryAction",
      "MenuItem",
      "Body",
      "Main",
      "Rail",
      "Section",
      "Properties",
      "Property",
      "LinkedEntities",
      "Content",
    ]);
    for (const component of Object.values(DetailPanel)) {
      expect(component).toBeDefined();
    }
  });
  it("composes record main, properties rail, and hides empty properties", async () => {
    const onAdd = vi.fn();
    const panel = mount({
      content: () => (
        <>
          <DetailPanel.Header />
          <DetailPanel.Body>
            <DetailPanel.Main>
              <DetailPanel.Section title="Overview">Description</DetailPanel.Section>
            </DetailPanel.Main>
            <DetailPanel.Rail>
              <DetailPanel.Properties>
                <DetailPanel.Property label="Provider" value="AWS" />
                <DetailPanel.Property label="Region" value="us-east-1" mono />
                <DetailPanel.Property label="Owner" value={null} />
                <DetailPanel.Property label="Tags" value="" onAdd={onAdd} />
              </DetailPanel.Properties>
            </DetailPanel.Rail>
          </DetailPanel.Body>
        </>
      ),
    });

    await vi.waitFor(() =>
      expect(panel.host.querySelector(".pw-detail-panel__record")).not.toBeNull(),
    );
    const record = panel.host.querySelector(".pw-detail-panel__record")!;
    expect(record.querySelector(":scope > .pw-detail-panel__main h3")?.textContent).toBe("Overview");
    expect(record.querySelector(":scope > aside.pw-detail-panel__rail")).not.toBeNull();
    expect(
      Array.from(panel.host.querySelectorAll(".pw-detail-panel__property dt"), (dt) => dt.textContent),
    ).toEqual(["Provider", "Region", "Tags"]);
    expect(panel.host.querySelector("dd.font-mono")?.textContent).toBe("us-east-1");
    panel.host.querySelector<HTMLButtonElement>(".pw-detail-panel__property-add")!.click();
    expect(onAdd).toHaveBeenCalledOnce();

    expect(css()).toMatch(
      /\.pw-detail-panel__record:has\(> \.pw-detail-panel__rail\)\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) 280px;/,
    );
    expect(css()).toMatch(/@container \(max-width: 720px\)/);

    panel.dispose();
  });
  it("nests DataTable rows without dark surface fills inside sections", () => {
    const styles = css();
    expect(styles).toMatch(
      /\.pw-detail-panel__section \.pw-data-table-scroll\s*{[^}]*padding-inline: 0;/,
    );
    expect(styles).toMatch(
      /\.pw-detail-panel__section \.pw-data-table-cell::before[\s\S]*?background: transparent;/,
    );
    expect(styles).not.toMatch(/\.pw-detail-panel__section \.pw-data-table-row:hover/);
    expect(styles).toMatch(
      /\.pw-detail-panel__section \.pw-data-table-active,[\s\S]*?background: var\(--color-surface-selected\);/,
    );
  });
  it("outside activation preserves its action and focus; opener and card clicks stay open", async () => {
    const panel = mount();
    panel.host.querySelector<HTMLButtonElement>("[data-detail-opener]")!.click();
    expect(panel.open()).toBe(true);
    const inside = panel.host.querySelector<HTMLButtonElement>(".pw-detail-panel__body button")!;
    inside.focus(); inside.click();
    expect(panel.open()).toBe(true);
    const outside = document.createElement("button");
    const action = vi.fn(); outside.onclick = action; document.body.append(outside);
    await nextPaint();
    pointer(outside, "pointerdown", 0, 0);
    expect(panel.open()).toBe(true);
    expect(panel.sidebar().hasAttribute("inert")).toBe(false);
    outside.focus();
    pointer(outside, "pointerup", 0, 0);
    expect(panel.open()).toBe(true);
    pointerClick(outside);
    expect(panel.open()).toBe(false);
    expect(panel.sidebar().hasAttribute("inert")).toBe(true);
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("408px");
    expect(action).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(document.activeElement).toBe(outside);
    await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    panel.dispose();
  });
  it("keeps the full-width toolbar action and focus when it dismisses expanded details", async () => {
    const panel = mount({ expanded: true });
    const toolbar = panel.host.querySelector<HTMLElement>(".pw-page-toolbar")!;
    const button = toolbar.querySelector<HTMLButtonElement>("button")!;
    const action = vi.fn(); button.onclick = action;
    panel.host.querySelector<HTMLButtonElement>(".pw-detail-panel__body button")!.focus();
    await nextPaint();
    pointer(button, "pointerdown", 0, 0);
    expect(panel.open()).toBe(true);
    button.focus();
    pointer(button, "pointerup", 0, 0); pointerClick(button);
    expect(panel.open()).toBe(false);
    expect(panel.sidebar().dataset.expanded).toBe("true");
    await Promise.resolve();
    expect(action).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(button);
    expect(panel.host.querySelector(".pw-page-toolbar")).toBe(toolbar);
    panel.dispose();
  });
  it("keeps a held external press open without leaving an empty reserved column", async () => {
    const panel = mount();
    const outside = document.createElement("button"); document.body.append(outside);
    await nextPaint();
    pointer(outside, "pointerdown", 10, 10);
    // Longer than either exit tier: a held press must not start any dismissal.
    await new Promise<void>((resolve) => window.setTimeout(resolve, spring.slow.exit.duration * 1000 + 32));
    expect(panel.open()).toBe(true);
    expect(panel.sidebar().hidden).toBe(false);
    expect(panel.sidebar().style.opacity).toBe("1");
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("408px");
    pointer(outside, "pointerup", 10, 10); pointerClick(outside);
    expect(panel.open()).toBe(false);
    await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    panel.dispose();
  });
  it("ignores the release click after drag, scroll, cancellation or loss of focus", () => {
    const panel = mount();
    const outside = document.createElement("button"); document.body.append(outside);
    for (const gesture of ["drag", "scroll", "wheel", "cancel", "capture", "blur"] as const) {
      pointer(outside, "pointerdown", 10, 10);
      if (gesture === "drag") {
        pointer(outside, "pointermove", 13, 10);
        pointer(outside, "pointermove", 10, 10);
      } else if (gesture === "scroll") {
        outside.dispatchEvent(new Event("scroll"));
      } else if (gesture === "wheel") {
        outside.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 20 }));
      } else if (gesture === "cancel" || gesture === "capture") {
        pointer(outside, gesture === "cancel" ? "pointercancel" : "lostpointercapture", 10, 10);
      } else window.dispatchEvent(new Event("blur"));
      pointer(outside, "pointerup", 10, 10); pointerClick(outside);
      expect(panel.open(), gesture).toBe(true);
    }
    // A new click remains available; the observer never takes external capture.
    expect(outside.setPointerCapture).not.toHaveBeenCalled();
    pointer(outside, "pointerdown", 10, 10);
    pointer(outside, "pointerup", 12, 10); pointerClick(outside);
    expect(panel.open()).toBe(false);
    panel.dispose();
  });
  it("keeps keyboard-generated outside clicks available after an ignored drag", () => {
    const panel = mount();
    const outside = document.createElement("button"); document.body.append(outside);
    const action = vi.fn(); outside.onclick = action;
    pointer(outside, "pointerdown", 0, 0);
    pointer(outside, "pointermove", 10, 0);
    pointer(outside, "pointerup", 10, 0); pointerClick(outside);
    expect(panel.open()).toBe(true);
    outside.focus(); outside.click();
    expect(panel.open()).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(action).toHaveBeenCalledTimes(2);
    panel.dispose();
  });
  it("keeps saved width until the slide and fade end, then releases the column", async () => {
    const panel = mount({ storageKey: "test.sidebar" });
    const divider = panel.host.querySelector<HTMLElement>(".pw-detail-panel__resize-handle")!;
    press({ key: "ArrowLeft", shiftKey: true }, divider);
    await nextPaint();
    const timeout = vi.spyOn(window, "setTimeout");
    panel.host.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click();
    expect(panel.open()).toBe(false);
    expect(panel.sidebar().hidden).toBe(false);
    expect(panel.sidebar().hasAttribute("inert")).toBe(true);
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("472px");
    expect(divider.hidden).toBe(true);
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), spring.slow.exit.duration * 1000);
    await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
    expect(panel.sidebar().style.transform).toBe("translate3d(16px, 0, 0)");
    expect(panel.sidebar().style.opacity).toBe("0");
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    expect(localStorage.getItem("test.sidebar")).toBe("464");
    panel.dispose();
  });
  it("keeps expanded geometry for the whole exit and limits the frame to the workspace", async () => {
    const panel = mount({ expanded: true });
    await nextPaint();
    panel.host.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click();
    expect(panel.expanded()).toBe(false);
    expect(panel.sidebar().dataset.expanded).toBe("true");
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    expect(panel.sidebar().parentElement?.classList.contains("pw-detail-panel__workspace")).toBe(true);
    expect(css()).toMatch(/\.pw-detail-panel__frame\[data-expanded="true"\]\s*{[^}]*inset: 0;/);
    await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
    expect(panel.sidebar().dataset.expanded).toBe("false");
    panel.dispose();
  });
  it("uses only the short fade with reduced motion and does not animate first paint", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const panel = mount();
    expect(panel.sidebar().style.transform).toBe("translate3d(0px, 0, 0)");
    expect(panel.sidebar().style.opacity).toBe("1");
    await nextPaint();
    const timeout = vi.spyOn(window, "setTimeout");
    press({ key: "j", metaKey: true });
    expect(panel.open()).toBe(false);
    expect(panel.sidebar().style.transform).toBe("translate3d(0px, 0, 0)");
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), spring.fast.exit.duration * 1000);
    await vi.waitFor(() => expect(panel.sidebar().hidden).toBe(true));
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("0px");
    panel.dispose();
  });
  it("places primary collection creation after search, filters and auxiliary actions", () => {
    const knowledge = readFileSync(repoPath("packages/features/knowledge/src/index.tsx"), "utf8");
    const actions = knowledge.slice(knowledge.indexOf("<PageToolbar.Actions>"), knowledge.indexOf("</PageToolbar.Actions>"));
    expect(actions.indexOf("<SearchBar")).toBeLessThan(actions.indexOf("<FilterPopover"));
    expect(actions.indexOf('label="Import from project root"')).toBeLessThan(actions.indexOf('label="Add source"'));
    expect(actions.indexOf('label="Add source"')).toBeLessThan(actions.indexOf("label={createLabel()}"));
    const atlas = readFileSync(repoPath("packages/features/architecture/src/index.tsx"), "utf8");
    const atlasActions = atlas.slice(atlas.indexOf("<PageToolbar.Actions>"), atlas.indexOf("</PageToolbar.Actions>"));
    expect(atlasActions.indexOf('label="Auto layout"')).toBeLessThan(atlasActions.indexOf('label="Add component"'));
  });
  it("registers callback-owned sibling confirmations", async () => {
    const [confirm, setConfirm] = createSignal(false);
    const panel = mount({ content: () => <button onClick={() => setConfirm(true)}>Confirm action</button> });
    const dialogHost = document.createElement("div"); document.body.append(dialogHost);
    const disposeDialog = render(() => <A11yDialog open={confirm()} title="Confirm action" onClose={() => setConfirm(false)}><button>Keep editing</button></A11yDialog>, dialogHost);
    panel.host.querySelector<HTMLButtonElement>(".pw-detail-panel__content button")!.click();
    await vi.waitFor(() => expect(document.querySelector(".pw-dialog-content")).not.toBeNull());
    const dialogButton = document.querySelector<HTMLButtonElement>(".pw-dialog-content button:last-child")!;
    pointer(dialogButton, "pointerdown", 0, 0); pointer(dialogButton, "pointerup", 0, 0); pointerClick(dialogButton);
    expect(panel.open()).toBe(true);
    setConfirm(false);
    disposeDialog(); dialogHost.remove(); panel.dispose();
  });
  it("keeps an owned portalled menu interactive while unrelated dialogs dismiss details", async () => {
    const [menuOpen, setMenuOpen] = createSignal(false);
    const action = vi.fn();
    const panel = mount({ content: () => (
      <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger aria-label="Detail options">Options</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem value="edit" onSelect={action}>Edit detail</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    ) });
    const trigger = panel.host.querySelector<HTMLButtonElement>('[aria-label="Detail options"]')!;
    trigger.focus(); trigger.click();
    await vi.waitFor(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull());
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    pointer(item, "pointerdown", 0, 0); pointer(item, "pointerup", 0, 0); pointerClick(item);
    expect(panel.open()).toBe(true);
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    const outside = document.createElement("button"); document.body.append(outside);
    outside.focus();
    const [unrelated, setUnrelated] = createSignal(false);
    const dialogHost = document.createElement("div"); document.body.append(dialogHost);
    const disposeDialog = render(() => <A11yDialog open={unrelated()} title="Unrelated" onClose={() => setUnrelated(false)}><button>External action</button></A11yDialog>, dialogHost);
    setUnrelated(true);
    await vi.waitFor(() => expect(document.querySelector(".pw-dialog-content")).not.toBeNull());
    const unrelatedDialog = document.querySelector<HTMLElement>(".pw-dialog-content")!;
    pointer(unrelatedDialog, "pointerdown", 0, 0);
    expect(panel.open()).toBe(true);
    pointer(unrelatedDialog, "pointerup", 0, 0); pointerClick(unrelatedDialog);
    expect(panel.open()).toBe(false);
    disposeDialog(); dialogHost.remove(); panel.dispose();
  });
  it("can interrupt a close by explicitly opening another item", async () => {
    const panel = mount();
    await nextPaint();
    panel.host.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click();
    await nextPaint();
    const pose = panel.sidebar().style.transform;
    panel.host.querySelector<HTMLButtonElement>("[data-detail-opener]")!.click();
    // Interrupting resamples the in-flight spring between paints; it must not snap to an endpoint.
    const offset = (value: string) => Number(/translate3d\(([^p]+)px/.exec(value)?.[1]);
    expect(Math.abs(offset(panel.sidebar().style.transform) - offset(pose))).toBeLessThan(2);
    await vi.waitFor(() => expect(panel.positioner().style.opacity).toBe("1"));
    expect(panel.root().dataset.state).toBe("open");
    expect(panel.positioner().hidden).toBe(false);
    expect(panel.sidebar().hasAttribute("inert")).toBe(false);
    await new Promise<void>((resolve) => window.setTimeout(resolve, spring.slow.exit.duration * 1000 + 32));
    expect(panel.sidebar().hidden).toBe(false);
    expect(panel.root().style.getPropertyValue("--detail-panel-space")).toBe("408px");
    panel.dispose();
  });
  it("exits expanded with Escape and returns focus to the active row from inside the detail", async () => {
    const panel = mount({ expanded: true });
    const inside = () =>
      Array.from(panel.host.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Inside detail",
      )!;
    await vi.waitFor(() => expect(inside()).toBeDefined());

    inside().focus();
    press({ key: "Escape" });
    expect(panel.expanded()).toBe(false);

    inside().focus();
    press({ key: "Escape" });
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("data-detail-target-id")).toBe("alpha"),
    );
    expect(panel.open()).toBe(true);

    panel.dispose();
  });
  it("hands focus back to the active row when the sidebar hides with focus inside", async () => {
    const panel = mount();
    const inside = () =>
      Array.from(panel.host.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Inside detail",
      )!;
    await vi.waitFor(() => expect(inside()).toBeDefined());

    inside().focus();
    panel.setOpen(false);
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute("data-detail-target-id")).toBe("alpha"),
    );

    panel.dispose();
  });
  it("keeps only panel controls in the header and identity in the body", async () => {
    const panel = mount({
      content: () => (
        <>
          <DetailPanel.Header />
          <DetailPanel.Body>
            <DetailPanel.Title title="Alpha detail" meta={<span data-testid="meta">Active</span>} />
            Body
          </DetailPanel.Body>
        </>
      ),
    });
    await vi.waitFor(() =>
      expect(panel.host.querySelector(".pw-detail-panel__header")).not.toBeNull(),
    );
    const header = panel.host.querySelector(".pw-detail-panel__header")!;
    expect(header.querySelector(".pw-detail-panel__title")).toBeNull();
    expect(header.querySelector("[data-testid='meta']")).toBeNull();
    expect(header.querySelector("[aria-label='More actions']")).toBeNull();
    const body = panel.host.querySelector(".pw-detail-panel__body")!;
    expect(body.querySelector(".pw-detail-panel__title")?.textContent).toBe("Alpha detail");
    expect(body.querySelector("[data-testid='meta']")?.textContent).toBe("Active");
    (header.querySelector("[aria-label='Expand details']") as HTMLButtonElement).click();
    expect(panel.expanded()).toBe(true);
    (header.querySelector("[aria-label='Restore details']") as HTMLButtonElement).click();
    expect(panel.expanded()).toBe(false);
    expect(source()).toContain('createShortcutLabel("shell.maximize_detail")');
    panel.dispose();
  });
  it("keeps retained entity surfaces on the shared DetailPanel", () => {
    const featureFiles = [
      "packages/features/architecture/src/node-detail.tsx",
      "packages/features/architecture/src/view-detail.tsx",
      "packages/features/knowledge/src/knowledge-document-shell.tsx",
      "packages/features/knowledge/src/work-card-detail.tsx",
      "packages/features/settings/src/agent-run-history-card.tsx",
    ];

    for (const file of featureFiles) {
      const featureSource = readFileSync(repoPath(file), "utf8");
      expect(featureSource, file).toContain("<DetailPanel.Content>");
      expect(featureSource, file).toContain("<DetailPanel.Header");
      expect(featureSource, file).not.toMatch(/DetailPanel\.(Actions|Action|Overflow)\b/);
    }
  });
});
