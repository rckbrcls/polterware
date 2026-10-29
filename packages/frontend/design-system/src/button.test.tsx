import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { Button, LinkButton, type ButtonVariant } from "./button";
import { FloatingSurfaceProvider, TextureFaceProvider } from "./floating-surface";

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

describe("Button inside a floating surface", () => {
  it("renders text buttons with the texture face and mapped tone", () => {
    const host = mount(() => <FloatingSurfaceProvider>
      <Button variant="primary">Save</Button>
      <Button variant="danger">Delete</Button>
      <Button variant="ghost">Cancel</Button>
      <Button>Back</Button>
    </FloatingSurfaceProvider>);
    const [primary, danger, ghost, secondary] = Array.from(host.querySelectorAll("button"));
    for (const button of [primary, danger, ghost, secondary]) {
      expect(button!.classList.contains("pw-texture-button")).toBe(true);
      expect(button!.classList.contains("pw-control-button")).toBe(false);
    }
    expect(primary!.dataset.textureTone).toBe("brand");
    expect(danger!.dataset.textureTone).toBe("danger");
    expect(ghost!.dataset.textureTone).toBe("neutral");
    expect(secondary!.dataset.textureTone).toBe("neutral");
  });

  it("keeps icon-only buttons flat and honours keepVariant", () => {
    const host = mount(() => <FloatingSurfaceProvider>
      <Button variant="icon" aria-label="Close">x</Button>
      <Button variant="ghost" keepVariant>Chip</Button>
    </FloatingSurfaceProvider>);
    const [icon, kept] = Array.from(host.querySelectorAll("button"));
    expect(icon!.classList.contains("pw-texture-button")).toBe(false);
    expect(kept!.classList.contains("pw-button-flat")).toBe(true);
  });
});

describe("TextureFaceProvider", () => {
  it("renders solid buttons, icon-only ones included, with the texture face and keeps keycaps outside it", () => {
    const host = mount(() => <>
      <Button variant="primary">Outside</Button>
      <TextureFaceProvider>
        <Button variant="primary">Save</Button>
        <Button variant="primary" size="icon" aria-label="Add">+</Button>
        <Button variant="danger">Delete</Button>
        <Button>Cancel</Button>
        <Button variant="ghost">Ghost</Button>
      </TextureFaceProvider>
    </>);
    const [outside, save, add, remove, cancel, ghost] = [...host.querySelectorAll("button")];
    expect(outside!.className).toContain("pw-control-button");
    expect(save!.dataset.textureTone).toBe("primary");
    expect(add!.dataset.textureTone).toBe("primary");
    expect(add!.className).not.toContain("control-field");
    expect(remove!.dataset.textureTone).toBe("danger");
    expect(cancel!.dataset.textureTone).toBe("neutral");
    expect(ghost!.className).toContain("pw-button-flat");
  });
});
