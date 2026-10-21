import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import {
  CommanderFrame,
  CommanderSearchField,
  MainFrame,
  MainSurfaceFrame,
  SidebarFrame,
  SidebarItem,
  SidebarNavFrame,
  SidebarSection,
  ShellRoot,
  TitleBarFrame,
} from "./index";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

function mount(node: Parameters<typeof render>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(node, host);
  return host;
}

describe("shared shell chrome", () => {
  it("renders title bar traffic-light chrome and slots", () => {
    const host = mount(() => (
      <TitleBarFrame leading={<span>Back</span>} center={<span>Project</span>} trailing={<span>Search</span>} />
    ));
    const header = host.querySelector("header");
    expect(header?.getAttribute("role")).toBe("banner");
    expect(header?.className).toContain("window-title-bar");
    expect(header?.textContent).toContain("Back");
    expect(header?.textContent).toContain("Project");
    expect(header?.textContent).toContain("Search");
  });

  it("renders sidebar item/section slots without product labels", () => {
    const host = mount(() => (
      <SidebarFrame>
        <SidebarNavFrame aria-label="Primary">
          <SidebarSection label="PROJECT">
            <SidebarItem nav active onClick={() => undefined} icon={<span>+</span>}>
              Inbox
            </SidebarItem>
          </SidebarSection>
        </SidebarNavFrame>
      </SidebarFrame>
    ));
    expect(host.querySelector("aside")?.getAttribute("aria-label")).toBe("Sidebar");
    expect(host.querySelector(".pw-sidebar-group-label")?.textContent).toBe("PROJECT");
    const item = host.querySelector("button.pw-sidebar-item");
    expect(item?.getAttribute("aria-current")).toBe("page");
    expect(item?.className).toContain("pw-sidebar-item--nav");
  });

  it("renders main surface and gutter frames", () => {
    const host = mount(() => (
      <ShellRoot>
        <MainFrame>
          <MainSurfaceFrame>Page</MainSurfaceFrame>
        </MainFrame>
      </ShellRoot>
    ));
    expect(host.querySelector(".pw-shell-root")).not.toBeNull();
    expect(host.querySelector(".pw-shell-main-frame")).not.toBeNull();
    expect(host.querySelector("main.pw-main-surface")?.textContent).toBe("Page");
    expect(host.querySelector(".pw-shell-main-frame--opaque")).toBeNull();
  });

  it("keeps Polterware Notes gutters unglassed when requested", () => {
    const host = mount(() => (
      <MainFrame as="main" glass={false} aria-label="Today">
        <MainSurfaceFrame as="div">Body</MainSurfaceFrame>
      </MainFrame>
    ));
    expect(host.querySelector("main.pw-shell-main-frame--opaque")?.getAttribute("aria-label")).toBe("Today");
    expect(host.querySelector("div.pw-main-surface")?.textContent).toBe("Body");
  });

  it("opens the Commander overlay shell", async () => {
    const host = mount(() => (
      <CommanderFrame open title="Commander" description="Run a command" onClose={() => undefined}>
        <CommanderSearchField placeholder="Search or command" value="" onInput={() => undefined} />
      </CommanderFrame>
    ));
    await Promise.resolve();
    expect(document.querySelector('[role="dialog"]') ?? host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="searchbox"]')?.getAttribute("placeholder")).toBe("Search or command");
  });
});
