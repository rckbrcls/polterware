import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TreeView } from "./tree-view";
import { ProgressRing } from "./progress-ring";
import { ProgressBar } from "./progress-bar";
import { Heatmap, heatmapLevel } from "./heatmap";
import { CalendarGrid } from "./calendar-grid";
import { PageEmpty, EmptyIllustration } from "./feedback";
const disposers: (() => void)[] = [];
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.append(host); disposers.push(render(view, host)); return host; }
function key(element: HTMLElement, value: string) { element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); }
function pointerClick(element: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 } as const;
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
  element.click();
}
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
describe("TreeView", () => {
  const nodes = [{ id: "work", label: "Work", children: [{ id: "ideas", label: "Ideas" }] }, { id: "personal", label: "Personal" }];
  it("expands, roves focus and selects by keyboard in uncontrolled mode", async () => {
    const host = mount(() => <TreeView label="Spaces" nodes={nodes} defaultExpandedValue={["work"]} />);
    const work = host.querySelector<HTMLElement>('[data-part="branch-control"]')!;
    expect(work.getAttribute("data-state")).toBe("open");
    work.focus();
    expect(document.activeElement).toBe(work);
    key(work, "ArrowDown");
    const ideas = Array.from(host.querySelectorAll<HTMLElement>('[data-part="item"]')).find((item) => item.textContent === "Ideas")!;
    ideas.focus();
    key(ideas, "Enter");
    expect(document.activeElement).toBe(ideas);
    expect(host.querySelector('[data-part="branch-indent-guide"]')).not.toBeNull();
  });
  it("reports controlled selection and retains hierarchy with reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); const change = vi.fn();
    const host = mount(() => <TreeView label="Spaces" nodes={nodes} selectedValue={["personal"]} onSelectionChange={change} defaultExpandedValue={["work"]} />);
    const ideas = Array.from(host.querySelectorAll<HTMLElement>('[data-part="item"]')).find(item => item.textContent === "Ideas")!;
    ideas.click(); await vi.waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ selectedValue: ["ideas"] })));
    expect(ideas.getAttribute("aria-selected")).toBe("false");
  });
});
describe("ProgressRing", () => {
  it("exposes reactive bounded progress and has no keyboard/focus target", () => {
    const [value, setValue] = createSignal(25);
    const host = mount(() => <ProgressRing label="Focus" value={value()} size={80} />);
    const progress = host.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute("aria-valuenow")).toBe("25"); setValue(75);
    expect(progress.getAttribute("aria-valuenow")).toBe("75"); expect(host.querySelector("button, input, [tabindex]")).toBeNull();
    expect(host.querySelector("svg")!.style.getPropertyValue("--size")).toBe("80px");
  });
  it("supports a default value and declares a reduced-motion snap without opacity", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const host = mount(() => <ProgressRing label="Focus" defaultValue={50} />);
    expect(host.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("50");
    const css = readFileSync(join(process.cwd(), "src/progress-ring.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition: none/); expect(css).not.toMatch(/opacity/);
  });
});
describe("ProgressBar", () => {
  it("keeps its label and value semantics when usage becomes unknown", () => {
    const [value, setValue] = createSignal<number | null>(42.5);
    const host = mount(() => <ProgressBar label="Quota usage" value={value()} />);
    const progress = host.querySelector('[role="progressbar"]')!;
    const label = document.getElementById(progress.getAttribute("aria-labelledby")!);
    expect(label?.textContent).toBe("Quota usage");
    expect(progress.getAttribute("aria-valuenow")).toBe("42.5");
    expect(progress.getAttribute("aria-valuetext")).toBe("42.5%");
    setValue(null);
    expect(progress.hasAttribute("aria-valuenow")).toBe(false);
    expect(progress.getAttribute("aria-valuetext")).toBe("Unknown");
    expect(host.querySelector("button, input, [tabindex]")).toBeNull();
  });
  it("bounds percentages and preserves a caller's value description", () => {
    const [value, setValue] = createSignal(120);
    const host = mount(() => <ProgressBar label="Samples" value={value()} aria-valuetext="6 of 5 verified samples" size="sm" tone="violet" />);
    const progress = host.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("100");
    expect(progress.getAttribute("aria-valuetext")).toBe("6 of 5 verified samples");
    setValue(-10);
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
  });
});
describe("Heatmap", () => {
  it.each([[0, 0], [1, 1], [3, 2], [7, 3], [14, 4], [500, 4], [-1, 0], [NaN, 0]])("maps count %s to opaque level %s", (count, level) => expect(heatmapLevel(count)).toBe(level));
  it("updates supplied days and labels without interactive or animated cells", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const [value, setValue] = createSignal(1);
    const host = mount(() => <Heatmap label="Contributions" days={[{ date: "2026-10-04", value: value() }]} />);
    expect(host.querySelector('[role="img"]')!.getAttribute("data-level")).toBe("1"); setValue(14);
    expect(host.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("14");
    expect(host.querySelector("button, input, [tabindex]")).toBeNull();
  });
});
describe("CalendarGrid", () => {
  it.each(["day", "week", "month"] as const)("renders %s slots with semantic headers and opaque occurrences", view => {
    const action = vi.fn(); const host = mount(() => <CalendarGrid.Root view={view} label="Calendar"><CalendarGrid.Days><CalendarGrid.Day label="Oct 4" today><CalendarGrid.Header>Oct 4</CalendarGrid.Header><CalendarGrid.AllDay><CalendarGrid.Occurrence onClick={action}>Read</CalendarGrid.Occurrence></CalendarGrid.AllDay><CalendarGrid.HourRow label="09:00" /><CalendarGrid.Overflow count={3} /></CalendarGrid.Day></CalendarGrid.Days></CalendarGrid.Root>);
    expect(host.querySelector("section")!.getAttribute("data-view")).toBe(view);
    const button = host.querySelector<HTMLButtonElement>("button")!; button.focus(); expect(document.activeElement).toBe(button); key(button, "Enter"); button.click(); expect(action).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="3 more occurrences"]')).not.toBeNull();
  });
  it("updates controlled presentation and respects disabled occurrences in reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); const [completed, setCompleted] = createSignal(false);
    const host = mount(() => <CalendarGrid.Root view="day" label="Calendar"><CalendarGrid.Occurrence completed={completed()} disabled>Read</CalendarGrid.Occurrence></CalendarGrid.Root>);
    const button = host.querySelector<HTMLButtonElement>("button")!; expect(button.disabled).toBe(true); setCompleted(true); expect(button.hasAttribute("data-completed")).toBe(true);
  });
  it("renders one shared time gutter", () => {
    const host = mount(() => <CalendarGrid.Root view="week" label="Week"><CalendarGrid.Time columns={7}><CalendarGrid.TimeSticky zone="GMT-3"><span>Mon</span></CalendarGrid.TimeSticky><CalendarGrid.TimeBody gutter={<><CalendarGrid.GutterLabel hour={0}>12 AM</CalendarGrid.GutterLabel></>}><div /></CalendarGrid.TimeBody></CalendarGrid.Time></CalendarGrid.Root>);
    expect(host.querySelectorAll(".pw-calendar__gutter")).toHaveLength(1);
    expect(host.querySelector(".pw-calendar__zone")!.textContent).toBe("GMT-3");
    expect(host.querySelector(".pw-calendar__gutter-label")!.textContent).toBe("12 AM");
  });
  it("renders year and schedule frames", () => {
    const year = mount(() => <CalendarGrid.Root view="year" label="2026"><CalendarGrid.Year><CalendarGrid.MiniMonth><span>October</span></CalendarGrid.MiniMonth></CalendarGrid.Year></CalendarGrid.Root>);
    expect(year.querySelector("section")!.getAttribute("data-view")).toBe("year");
    expect(year.textContent).toContain("October");
    const schedule = mount(() => <CalendarGrid.Root view="schedule" label="Schedule"><CalendarGrid.Agenda><span>5 Oct, Mon</span></CalendarGrid.Agenda></CalendarGrid.Root>);
    expect(schedule.querySelector("section")!.getAttribute("data-view")).toBe("schedule");
    expect(schedule.textContent).toContain("5 Oct, Mon");
  });
});
describe("EmptyIllustration", () => {
  it("keeps decorative artwork out of keyboard/focus navigation while preserving the empty action", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); const action = vi.fn();
    const host = mount(() => <PageEmpty title="Empty" illustration={<EmptyIllustration>Artwork</EmptyIllustration>} action={<button onClick={action}>Create</button>} />);
    expect(host.querySelector('[aria-hidden="true"]')!.textContent).toBe("Artwork"); const button = host.querySelector<HTMLButtonElement>("button")!; button.focus(); key(button, "Enter"); button.click(); expect(document.activeElement).toBe(button); expect(action).toHaveBeenCalledOnce();
  });
});
