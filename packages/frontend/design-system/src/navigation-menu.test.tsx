import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPreviewPanel,
  NavigationMenuTrigger,
  navigationMenuTriggerClass,
} from "./navigation-menu";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function mount(view: () => import("solid-js").JSX.Element) {
  const host = document.createElement("div");
  document.body.append(host);
  cleanups.push(render(view, host));
  return host;
}

function Menu(props: { value?: string }) {
  return (
    <NavigationMenu aria-label="Main" value={props.value}>
      <NavigationMenuList>
        <NavigationMenuItem value="products">
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuPreviewPanel items={[
              { id: "polterware", title: "Polterware", description: "Context", href: "/polterware", preview: () => <p>Polterware preview</p> },
              { id: "vitals", title: "Vitals", description: "Hosts", href: "/vitals", preview: () => <p>Vitals preview</p> },
            ]} />
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/pricing" class={navigationMenuTriggerClass} active>Pricing</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

describe("NavigationMenu", () => {
  it("renders a labelled nav with a trigger button and a native top-level link", () => {
    const host = mount(() => <Menu />);
    const nav = host.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Main");
    const trigger = host.querySelector("button.pw-navmenu-trigger")!;
    expect(trigger.textContent).toContain("Products");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const link = host.querySelector<HTMLAnchorElement>(`a.${navigationMenuTriggerClass}`)!;
    expect(link.getAttribute("href")).toBe("/pricing");
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("opens the content in the shared viewport with the first preview shown", () => {
    const host = mount(() => <Menu value="products" />);
    const trigger = host.querySelector("button.pw-navmenu-trigger")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const rows = document.querySelectorAll<HTMLAnchorElement>(".pw-navmenu-preview-row");
    expect([...rows].map((row) => row.getAttribute("href"))).toEqual(["/polterware", "/vitals"]);
    expect(document.querySelector(".pw-navmenu-preview-pane")?.textContent).toContain("Polterware preview");
  });
});
