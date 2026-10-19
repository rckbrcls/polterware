import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Button, LinkButton, type ButtonVariant } from "./button";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function mount(view: () => import("solid-js").JSX.Element) {
  const host = document.createElement("div");
  document.body.append(host);
  cleanups.push(render(view, host));
  return host;
}

describe("Button navigation", () => {
  it("keeps anchor semantics, URL, new-tab safety and accessible name", () => {
    const host = mount(() => <LinkButton href="https://example.com/source" target="_blank" rel="noopener noreferrer" aria-label="View source">Source</LinkButton>);
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/source");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe("View source");
    expect(link.hasAttribute("type")).toBe(false);
    expect(link.querySelector("button")).toBeNull();
    expect(link.tabIndex).toBe(0);
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("shares materials with buttons and updates reactive variant, class and href", () => {
    const [variant, setVariant] = createSignal<ButtonVariant>("secondary");
    const [href, setHref] = createSignal("/creations");
    const [selected, setSelected] = createSignal(false);
    const host = mount(() => <><Button variant={variant()} size="sm">Action</Button><LinkButton variant={variant()} size="sm" href={href()} classList={{ selected: selected() }}>Navigate</LinkButton></>);
    const link = host.querySelector("a")!;
    const button = host.querySelector("button")!;
    expect(link.className).toBe(button.className);
    setVariant("ghost"); setHref("/creations/polterware"); setSelected(true);
    expect(link.classList.contains("rounded-full")).toBe(true);
    expect(link.classList.contains("selected")).toBe(true);
    expect(link.getAttribute("href")).toBe("/creations/polterware");
    expect(button.classList.contains("rounded-full")).toBe(true);
  });

  it("preserves native Button type and disabled behavior inside a form", () => {
    const host = mount(() => <form><Button disabled>Disabled</Button><Button type="submit">Submit</Button></form>);
    const buttons = host.querySelectorAll("button");
    expect(buttons[0]!.type).toBe("button");
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[1]!.type).toBe("submit");
  });
});
