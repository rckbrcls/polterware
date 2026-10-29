// @vitest-environment jsdom

import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveFilterBar } from "./active-filter-bar";
import { FilterPopover } from "./filter-popover";
import type { FilterClause, FilterField, SavedFilter } from "./filter-model";

const FIELDS: FilterField[] = [
  {
    id: "stage",
    label: "Stage",
    kind: "multi",
    options: [
      { id: "shape", label: "Shape" },
      { id: "build", label: "Build" },
      { id: "verify", label: "Verify" },
    ],
  },
  { id: "pinned", label: "Card", kind: "boolean", options: [{ id: "pinned", label: "Pinned" }] },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(initial: FilterClause[], saved?: { items: SavedFilter[]; onApply: (filter: SavedFilter) => void }) {
  const host = document.createElement("div");
  document.body.append(host);
  const [clauses, setClauses] = createSignal<FilterClause[]>(initial);
  const changes: FilterClause[][] = [];
  const dispose = render(
    () => (
      <>
        <FilterPopover ariaLabel="Filters" fields={FIELDS} clauses={clauses()} onClausesChange={(next) => { changes.push(next); setClauses(next); }} saved={saved} />
        <ActiveFilterBar fields={FIELDS} clauses={clauses()} onClausesChange={(next) => { changes.push(next); setClauses(next); }} />
      </>
    ),
    host,
  );
  return { host, clauses, changes, dispose: () => { dispose(); host.remove(); } };
}

const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ActiveFilterBar", () => {
  it("is hidden without clauses", () => {
    const view = mount([]);
    expect(view.host.querySelector(".pw-active-filter-bar")).toBeNull();
    view.dispose();
  });

  it("renders one segmented pill per clause with operator and value summary", () => {
    const view = mount([
      { id: "a", field: "stage", operator: "is", values: ["build", "verify"] },
      { id: "b", field: "stage", operator: "is_not", values: ["shape"] },
      { id: "c", field: "pinned", operator: "is", values: ["pinned"] },
    ]);
    const pills = [...view.host.querySelectorAll(".pw-filter-pill")].map((pill) =>
      [...pill.querySelectorAll(".pw-filter-pill__seg")].map((segment) => segment.textContent?.trim()),
    );
    expect(pills).toEqual([
      ["Stage", "is any of", "2 stages"],
      ["Stage", "is not", "Shape"],
      ["Card", "is", "Pinned"],
    ]);
    view.dispose();
  });

  it("removes one pill and clears all", () => {
    const view = mount([
      { id: "a", field: "stage", operator: "is", values: ["build"] },
      { id: "c", field: "pinned", operator: "is", values: ["pinned"] },
    ]);
    view.host.querySelector<HTMLButtonElement>('[aria-label="Remove Stage filter"]')!.click();
    expect(view.clauses().map((clause) => clause.id)).toEqual(["c"]);
    [...view.host.querySelectorAll("button")].find((button) => button.textContent === "Clear")!.click();
    expect(view.clauses()).toEqual([]);
    view.dispose();
  });

  it("edits values from the pill and drops the pill with its last value", async () => {
    const view = mount([{ id: "a", field: "stage", operator: "is", values: ["build"] }]);
    byLabel("Edit Stage values")!.click();
    await flush();
    byLabel("Toggle Verify")!.click();
    await flush();
    expect(view.clauses()[0]?.values).toEqual(["build", "verify"]);
    expect(view.host.querySelector(".pw-filter-pill__value")?.textContent).toContain("2 stages");
    byLabel("Toggle Build")!.click();
    await flush();
    byLabel("Toggle Verify")!.click();
    await flush();
    expect(view.clauses()).toEqual([]);
    view.dispose();
  });
});

describe("FilterPopover", () => {
  it("adds a clause per add: label click picks one value and closes", async () => {
    const view = mount([{ id: "a", field: "stage", operator: "is", values: ["build"] }]);
    byLabel("Filters")!.click();
    await flush();
    const stage = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Stage")!;
    stage.click();
    await flush();
    const verify = [...document.querySelectorAll<HTMLButtonElement>(".pw-filter-option__body")].find((button) => button.textContent?.includes("Verify"))!;
    verify.click();
    await flush();
    expect(view.clauses().map((clause) => clause.values)).toEqual([["build"], ["verify"]]);
    view.dispose();
  });

  it("checkbox clicks keep editing the clause the first check created", async () => {
    const view = mount([]);
    byLabel("Filters")!.click();
    await flush();
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Stage")!.click();
    await flush();
    byLabel("Toggle Shape")!.click();
    await flush();
    byLabel("Toggle Build")!.click();
    await flush();
    expect(view.clauses()).toHaveLength(1);
    expect(view.clauses()[0]?.values).toEqual(["shape", "build"]);
    view.dispose();
  });

  it("lists Field › Value results for a root search and applies saved filters", async () => {
    const applied = vi.fn();
    const saved = { items: [{ id: "s", name: "Shipping", clauses: [{ id: "x", field: "stage", operator: "is", values: ["verify"] }] }], onApply: applied };
    const view = mount([], saved);
    byLabel("Filters")!.click();
    await flush();
    expect(document.body.textContent).toContain("Saved filters");
    const search = document.querySelector<HTMLInputElement>('input[placeholder="Add filter…"]')!;
    search.value = "bui";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flush();
    expect([...document.querySelectorAll(".pw-filter-path")].map((node) => node.parentElement?.textContent)).toEqual(["Stage › Build"]);
    search.value = "ship";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flush();
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Shipping"))!.click();
    expect(applied).toHaveBeenCalledWith(saved.items[0]);
    view.dispose();
  });
});
