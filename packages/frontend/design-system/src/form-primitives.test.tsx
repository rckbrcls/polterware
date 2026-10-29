import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { Checkbox, CheckboxRow } from "./checkbox";
import { SegmentedControl } from "./segmented-control";
import { NumberStepper } from "./number-stepper";
import { Slider } from "./slider";
const disposers: (() => void)[] = [];
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.append(host); disposers.push(render(view, host)); return host; }
function key(element: HTMLElement, value: string) { element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); element.dispatchEvent(new KeyboardEvent("keyup", { key: value, bubbles: true, cancelable: true })); }
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
describe("Checkbox", () => {
  it.each(["square", "round"] as const)("supports %s, native focus and uncontrolled toggling", async shape => {
    const host = mount(() => <Checkbox shape={shape} label="Complete note" defaultChecked={false} />);
    const input = host.querySelector<HTMLInputElement>("input")!;
    input.focus(); expect(document.activeElement).toBe(input); input.click();
    await vi.waitFor(() => expect(input.checked).toBe(true));
    expect(host.querySelector("label")!.dataset.shape).toBe(shape);
    input.click(); await vi.waitFor(() => expect(input.checked).toBe(false));
  });
  it("reports controlled changes without changing its owner and exposes mixed/disabled states", async () => {
    const change = vi.fn(); const [checked, setChecked] = createSignal(false);
    const host = mount(() => <><Checkbox checked={checked()} onCheckedChange={change} label="Controlled" /><Checkbox checked="indeterminate" label="Mixed" /><Checkbox disabled label="Disabled" /></>);
    const inputs = host.querySelectorAll<HTMLInputElement>("input"); inputs[0]!.click();
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ checked: true })));
    expect(host.querySelector('[data-part="control"]')!.getAttribute("data-state")).toBe("unchecked"); setChecked(true); expect(inputs[0]!.checked).toBe(true);
    expect(host.querySelectorAll('[data-part="control"]')[1]!.getAttribute("data-state")).toBe("indeterminate"); expect(inputs[2]!.disabled).toBe(true);
  });
  it("keeps checkbox activation available with reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const host = mount(() => <Checkbox label="Reduced" />); const input = host.querySelector<HTMLInputElement>("input")!;
    input.focus(); key(input, " "); // jsdom does not synthesize the browser's native Space click.
    input.click(); await vi.waitFor(() => expect(input.checked).toBe(true));
  });  it("renders a selection row with the checkbox first and reports boolean changes", async () => {
    const change = vi.fn();
    const host = mount(() => <CheckboxRow label="Staging" leading={<span data-icon />} trailing="2" checked={false} onCheckedChange={change} />);
    const row = host.querySelector<HTMLElement>(".pw-checkbox-row")!;
    expect(row.firstElementChild?.tagName).toBe("INPUT");
    expect(row.querySelector(".pw-checkbox-row__trailing")!.textContent).toBe("2");
    host.querySelector<HTMLInputElement>("input")!.click();
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(true));
  });
});
describe("SegmentedControl", () => {
  const options = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }];
  it("provides native radio keyboard targets, selection and disabled segments", async () => {
    const host = mount(() => <SegmentedControl aria-label="View" defaultValue="day" options={options} />);
    const inputs = host.querySelectorAll<HTMLInputElement>("input"); inputs[0]!.focus(); expect(document.activeElement).toBe(inputs[0]); key(inputs[0]!, "ArrowRight");
    // Native radio arrow activation is covered in the browser; jsdom supplies no default keyboard action.
    inputs[1]!.click(); inputs[1]!.focus();
    await vi.waitFor(() => expect(inputs[1]!.checked).toBe(true));
    expect(document.activeElement).toBe(inputs[1]); expect(inputs[2]!.disabled).toBe(true); inputs[0]!.click();
    await vi.waitFor(() => expect(inputs[0]!.checked).toBe(true));
  });
  it("preserves the controlled value and snaps its indicator under reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const change = vi.fn(); const [value, setValue] = createSignal("day");
    const host = mount(() => <SegmentedControl aria-label="View" options={options} value={value()} onValueChange={change} />);
    const inputs = host.querySelectorAll<HTMLInputElement>("input"); inputs[1]!.click();
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ value: "week" })));
    expect(host.querySelector('[data-part="item"]')!.getAttribute("data-state")).toBe("checked"); setValue("week"); expect(inputs[1]!.checked).toBe(true);
    await vi.waitFor(() => expect(host.querySelector<HTMLElement>(".pw-segmented__indicator")!.style.transform).toContain("translateX"));
  });
});
describe("NumberStepper", () => {
  it("steps by keyboard, focuses its input and clamps at the bounds", async () => {
    const host = mount(() => <NumberStepper label="Minutes" defaultValue="2" min={1} max={3} />);
    const input = host.querySelector<HTMLInputElement>("input")!; input.focus(); key(input, "ArrowUp");
    await vi.waitFor(() => expect(input.value).toBe("3"));
    key(input, "ArrowUp"); expect(input.value).toBe("3"); key(input, "ArrowDown");
    await vi.waitFor(() => expect(input.value).toBe("2")); expect(document.activeElement).toBe(input);
  });
  it("reports controlled increments and respects disabled with reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); const change = vi.fn();
    const host = mount(() => <><NumberStepper label="Controlled" value="5" onValueChange={change} /><NumberStepper label="Disabled" disabled /></>);
    const input = host.querySelector<HTMLInputElement>("input")!; input.focus(); key(input, "ArrowUp");
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ value: "6" })));
    expect(input.value).toBe("5"); expect(host.querySelectorAll<HTMLInputElement>("input")[1]!.disabled).toBe(true);
  });
});
describe("Slider", () => {
  it("supports keyboard value changes and focus in uncontrolled mode", async () => {
    const host = mount(() => <Slider label="Volume" defaultValue={[40]} step={5} />);
    const thumb = host.querySelector<HTMLElement>('[role="slider"]')!; thumb.focus(); await vi.waitFor(() => expect(thumb.hasAttribute("data-focus")).toBe(true)); key(thumb, "ArrowRight");
    await vi.waitFor(() => expect(thumb.getAttribute("aria-valuenow")).toBe("45")); expect(document.activeElement).toBe(thumb);
    key(thumb, "Home"); await vi.waitFor(() => expect(thumb.getAttribute("aria-valuenow")).toBe("0"));
  });
  it("reports controlled changes and exposes each range thumb under reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); const change = vi.fn();
    const host = mount(() => <Slider label="Range" value={[20, 80]} onValueChange={change} />);
    const thumbs = host.querySelectorAll<HTMLElement>('[role="slider"]'); thumbs[0]!.focus(); await vi.waitFor(() => expect(thumbs[0]!.hasAttribute("data-focus")).toBe(true)); key(thumbs[0]!, "ArrowRight");
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ value: [21, 80] })));
    expect(thumbs[0]!.getAttribute("aria-valuenow")).toBe("20"); expect(thumbs).toHaveLength(2);
  });
});
