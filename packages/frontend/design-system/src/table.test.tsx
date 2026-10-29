// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detailPanelDefaultState, detailPanelStore, createDetailPanelSelector } from "@polterware/frontend-state";

import { DetailPanel } from "./detail-panel";

import {
  DataTable,
  DataTableSelectionToolbarHost,
  getDataTableAriaSort,
  getDataTableSelectionMode,
  getNextDataTableSelectionForMode,
  getSelectedDataTableRows,
  groupDataTableRows,
  hasDataTablePrimaryLeading,
  getNextDataTableSelection,
  getNextDataTableSort,
  isDataTableActivationKey,
  isDataTableInteractiveTarget,
  pruneDataTableSelection,
  readDataTableColumnWidths,
  shouldRenderDataTableEmpty,
  sortDataTableRows,
  type DataTableSortState,
} from "./table";

const tableSource = readFileSync(resolve(import.meta.dirname, "./table.tsx"), "utf8");

describe("DataTable groups", () => {
  const entries = [
    { row: { id: "a", stage: "build" }, sourceIndex: 0, id: "a" },
    { row: { id: "b", stage: "shape" }, sourceIndex: 1, id: "b" },
    { row: { id: "c", stage: "build" }, sourceIndex: 2, id: "c" },
    { row: { id: "d", stage: "lost" }, sourceIndex: 3, id: "d" },
  ];
  const grouping = {
    by: (row: { stage: string }) => row.stage,
    groups: [{ id: "shape", label: "Shape" }, { id: "plan", label: "Plan" }, { id: "build", label: "Build" }],
  };

  it("splits rows into the listed groups in order, keeping their sort, with the rest under Other", () => {
    const sections = groupDataTableRows(entries, grouping);
    expect(sections.map((section) => [section.group.label, section.rows.map((entry) => entry.id)])).toEqual([
      ["Shape", ["b"]],
      ["Plan", []],
      ["Build", ["a", "c"]],
      ["Other", ["d"]],
    ]);
    expect(groupDataTableRows(entries, { ...grouping, showEmpty: false }).map((section) => section.group.label)).toEqual(["Shape", "Build", "Other"]);
  });

  it("hides a collapsed group's rows but keeps its count", () => {
    const build = groupDataTableRows(entries, grouping, new Set(["build"])).find((section) => section.group.id === "build");
    expect(build).toMatchObject({ rows: [], count: 2, collapsed: true });
  });

  it("renders group headers, collapses a group, and runs its +", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const added: string[] = [];
    const rows = entries.map((entry) => entry.row);
    const dispose = render(() => (
      <DataTable.Root rows={rows} density="list" grouping={{ ...grouping, groups: grouping.groups.map((group) => ({ ...group, onAdd: () => added.push(group.id) })) }}>
        <DataTable.Table aria-label="Grouped fixture">
          <DataTable.Body<{ id: string; stage: string }>>
            {(row) => <DataTable.Row row={row} rowId={row.id} onActivate={() => {}}><DataTable.Cell>{row.id}</DataTable.Cell></DataTable.Row>}
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    ), host);
    try {
      expect(host.querySelector(".pw-data-table-root")?.getAttribute("data-density")).toBe("list");
      const order = () => [...host.querySelectorAll("tbody tr")].map((row) => row.getAttribute("data-group-id") ?? row.getAttribute("data-row-id"));
      expect(order()).toEqual(["shape", "b", "plan", "build", "a", "c", "\u0000other", "d"]);
      host.querySelector<HTMLButtonElement>('[aria-label="Add to Plan"]')?.click();
      expect(added).toEqual(["plan"]);
      host.querySelector<HTMLButtonElement>('[aria-label="Collapse Build"]')?.click();
      expect(order()).toEqual(["shape", "b", "plan", "build", "\u0000other", "d"]);
      expect(host.querySelector('[data-group-id="build"] .pw-data-table-group-count')?.textContent).toBe("2");
    } finally {
      dispose();
      host.remove();
    }
  });

  it("selects the focused row with X", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
    const rows = [{ id: "one" }, { id: "two" }];
    const dispose = render(() => (
      <DataTable.Root rows={rows} selectionMode="multiple" selectedRowIds={selected()} onSelectionChange={setSelected}>
        <DataTable.Table aria-label="Selection fixture">
          <DataTable.Body<{ id: string }>>
            {(row) => <DataTable.Row row={row} rowId={row.id} onActivate={() => {}}><DataTable.Cell>{row.id}</DataTable.Cell></DataTable.Row>}
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    ), host);
    try {
      const row = host.querySelector<HTMLElement>('[data-row-id="two"]')!;
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
      expect([...selected()]).toEqual(["two"]);
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
      expect([...selected()]).toEqual([]);
    } finally {
      dispose();
      host.remove();
    }
  });
});

describe("DataTable", () => {
  it("renders and scrolls a measured virtualized viewport mounted after body creation", async () => {
    const size = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    const scrollTo = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() => this.callback([{ target, borderBoxSize: [{ inlineSize: 800, blockSize: 240 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver));
      }
      unobserve() {}
      disconnect() {}
    });
    const host = document.createElement("div");
    document.body.append(host);
    const previousScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    const [rows, setRows] = createSignal(Array.from({ length: 1000 }, (_, index) => ({ id: String(index), label: `Row ${index}` })));
    const dispose = render(() => <DataTable.Root rows={rows()} virtualized estimateRowHeight={40}>
      <DataTable.Table aria-label="Virtualized fixture">
        <DataTable.Body>{row => <DataTable.Row row={row} rowId={row.id} onActivate={() => {}}><DataTable.Cell>{row.label}</DataTable.Cell></DataTable.Row>}</DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>, host);
    try {
      await vi.waitFor(() => expect(host.querySelector('[data-row-id="0"]')).not.toBeNull());
      expect(host.querySelectorAll("[data-row-id]").length).toBeLessThan(30);
      const scroll = host.querySelector<HTMLElement>(".pw-data-table-scroll")!;
      const retained = host.querySelector<HTMLTableRowElement>('[data-row-id="12"]')!;
      retained.focus();
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
      await vi.waitFor(() => expect(host.querySelector('[data-row-id="20"]')).not.toBeNull());
      expect(host.querySelector('[data-row-id="12"]')).toBe(retained);
      expect(document.activeElement).toBe(retained);
      setRows(previous => [...previous, { id: "1000", label: "Row 1000" }]);
      expect(host.querySelector('[data-row-id="12"]')).toBe(retained);
      expect(document.activeElement).toBe(retained);
      scroll.scrollTop = 20000;
      scroll.dispatchEvent(new Event("scroll"));
      await vi.waitFor(() => expect(host.querySelector('[data-row-id="500"]')).not.toBeNull());
      expect(host.querySelector('[data-row-id="0"]')).toBeNull();
      expect(host.querySelectorAll("[data-row-id]").length).toBeLessThan(30);
      setRows(previous => previous.map(row => row.id === "500" ? { ...row, label: "Refreshed row" } : row));
      await vi.waitFor(() => expect(host.querySelector('[data-row-id="500"]')?.textContent).toBe("Refreshed row"));
    } finally {
      dispose(); host.remove(); size.mockRestore(); width.mockRestore();
      HTMLElement.prototype.scrollTo = previousScrollTo;
      vi.unstubAllGlobals();
    }
  });

  it("exports the complete compound component contract", () => {
    expect(Object.keys(DataTable)).toEqual([
      "Root",
      "Toolbar",
      "Table",
      "Header",
      "ColumnHeader",
      "Body",
      "Row",
      "Cell",
      "PrimaryCell",
      "SelectionCell",
      "Checkbox",
      "SelectionToolbar",
      "Empty",
      "Footer",
    ]);
    for (const component of Object.values(DataTable)) expect(component).toBeDefined();
    expect(DataTableSelectionToolbarHost).toBeDefined();
  });

  it("keeps dense checkbox changes separate from row activation and selection", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [checked, setChecked] = createSignal(false);
    const activate = vi.fn();
    const change = vi.fn((value: boolean) => setChecked(value));
    const dispose = render(() => <DataTable.Root rows={[{ id: "a" }]} selectionMode="multiple">
      <DataTable.Table><DataTable.Body>{row => <DataTable.Row row={row} onActivate={activate}>
        <DataTable.SelectionCell rowId={row.id} />
        <DataTable.Cell><DataTable.Checkbox checked={checked()} onCheckedChange={change} aria-label="Complete Alpha" /></DataTable.Cell>
      </DataTable.Row>}</DataTable.Body></DataTable.Table>
    </DataTable.Root>, host);
    try {
      const input = host.querySelector<HTMLInputElement>('[aria-label="Complete Alpha"]')!;
      expect(input.type).toBe("checkbox");
      input.focus();
      input.click();
      expect(change).toHaveBeenCalledWith(true);
      expect(input.checked).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(activate).not.toHaveBeenCalled();
      expect(host.querySelector('[data-row-id]')?.getAttribute("aria-selected")).toBe("false");
      setChecked(false);
      expect(input.checked).toBe(false);
    } finally { dispose(); host.remove(); }
  });

  it("cycles source, ascending, descending, and source order", () => {
    let state: DataTableSortState = null;
    state = getNextDataTableSort(state, "name");
    expect(state).toEqual({ columnId: "name", direction: "ascending" });
    state = getNextDataTableSort(state, "name");
    expect(state).toEqual({ columnId: "name", direction: "descending" });
    state = getNextDataTableSort(state, "name");
    expect(state).toBeNull();
    expect(getNextDataTableSort({ columnId: "name", direction: "ascending" }, "status"))
      .toEqual({ columnId: "status", direction: "ascending" });
  });

  it("sorts values naturally, keeps missing values last, and preserves equal source order", () => {
    const rows = [
      { id: "a", name: "Node 10", score: 2 },
      { id: "b", name: "Node 2", score: 2 },
      { id: "c", name: "Unknown", score: undefined },
    ];
    expect(
      sortDataTableRows(rows, { columnId: "name", direction: "ascending" }, {
        sortBy: (row) => row.name,
      }).map((row) => row.id),
    ).toEqual(["b", "a", "c"]);
    expect(
      sortDataTableRows(rows, { columnId: "score", direction: "ascending" }, {
        sortBy: (row) => row.score,
      }).map((row) => row.id),
    ).toEqual(["a", "b", "c"]);
    expect(
      sortDataTableRows(rows, { columnId: "score", direction: "descending" }, {
        sortBy: (row) => row.score,
      }).map((row) => row.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("sorts a 1,000-row collection without changing the source", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index),
      value: 1_000 - index,
    }));
    const sorted = sortDataTableRows(
      rows,
      { columnId: "value", direction: "ascending" },
      { sortBy: (row) => row.value },
    );
    expect(sorted[0]?.value).toBe(1);
    expect(sorted.at(-1)?.value).toBe(1_000);
    expect(rows[0]?.value).toBe(1_000);
  });

  it("selects one row or all visible rows while preserving hidden IDs", () => {
    const current = new Set(["hidden"]);
    expect([...getNextDataTableSelection(current, ["a", "b"], "a")]).toEqual([
      "hidden",
      "a",
    ]);
    const selected = getNextDataTableSelection(current, ["a", "b"]);
    expect([...selected]).toEqual(["hidden", "a", "b"]);
    expect([...getNextDataTableSelection(selected, ["a", "b"])]).toEqual(["hidden"]);
  });

  it("supports none, single, and multiple selection modes", () => {
    expect(getDataTableSelectionMode(undefined, false)).toBe("none");
    expect(getDataTableSelectionMode(undefined, true)).toBe("multiple");
    expect(getDataTableSelectionMode("single", true)).toBe("single");

    expect([
      ...getNextDataTableSelectionForMode(new Set(["a"]), ["a", "b"], "single", "b"),
    ]).toEqual(["b"]);
    expect([
      ...getNextDataTableSelectionForMode(new Set(["b"]), ["a", "b"], "single", "b"),
    ]).toEqual([]);
    expect([
      ...getNextDataTableSelectionForMode(new Set(), ["a", "b"], "multiple"),
    ]).toEqual(["a", "b"]);
  });

  it("prunes hidden IDs and resolves selected rows in source order", () => {
    const rows = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ];
    expect([...pruneDataTableSelection(new Set(["hidden", "b"]), ["a", "b", "c"], "multiple")])
      .toEqual(["b"]);
    expect([...pruneDataTableSelection(new Set(["c", "a"]), ["a", "b", "c"], "single")])
      .toEqual(["a"]);
    expect(getSelectedDataTableRows(rows, new Set(["c", "a"]), (row) => row.id))
      .toEqual([rows[0], rows[2]]);
  });

  it("maps controlled sorting to aria-sort", () => {
    expect(getDataTableAriaSort(null, "name")).toBe("none");
    expect(getDataTableAriaSort({ columnId: "name", direction: "ascending" }, "name"))
      .toBe("ascending");
    expect(getDataTableAriaSort({ columnId: "name", direction: "descending" }, "name"))
      .toBe("descending");
    expect(getDataTableAriaSort({ columnId: "name", direction: "ascending" }, "status"))
      .toBe("none");
    expect(getDataTableAriaSort(null, "actions", false)).toBeUndefined();
  });

  it("recognizes keyboard activation and isolates nested interactive actions", () => {
    expect(isDataTableActivationKey("Enter")).toBe(true);
    expect(isDataTableActivationKey(" ")).toBe(true);
    expect(isDataTableActivationKey("Escape")).toBe(false);

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const button = document.createElement("button");
    cell.append(button);
    row.append(cell);
    expect(isDataTableInteractiveTarget(button, row)).toBe(true);
    expect(isDataTableInteractiveTarget(cell, row)).toBe(false);
  });

  it("renders optional leading content and empty state only when applicable", () => {
    expect(hasDataTablePrimaryLeading(undefined)).toBe(false);
    expect(hasDataTablePrimaryLeading(null)).toBe(false);
    expect(hasDataTablePrimaryLeading("icon")).toBe(true);
    expect(shouldRenderDataTableEmpty(0)).toBe(true);
    expect(shouldRenderDataTableEmpty(1_000)).toBe(false);
  });

  it("renders single-line primary cells and shared row/header selection inputs", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const activate = vi.fn();
    const dispose = render(
      () => (
        <DataTable.Root
          rows={[
            { id: "a", name: "Alpha" },
            { id: "b", name: "Beta" },
          ]}
          selectionMode="multiple"
        >
          <DataTable.Table aria-label="Selection fixture">
            <DataTable.Header>
              <DataTable.SelectionCell />
              <DataTable.ColumnHeader id="name">Name</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id} onActivate={activate}>
                  <DataTable.SelectionCell rowId={row.id} label={`Select ${row.name}`} />
                  <DataTable.PrimaryCell icon={<span>Icon</span>} iconTone="identity" title={row.name} />
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    const inputs = host.querySelectorAll<HTMLInputElement>(".pw-data-table-selection-input");
    const headerInput = inputs[0]!;
    const firstRowInput = inputs[1]!;
    const firstRow = host.querySelector<HTMLTableRowElement>("[data-row-id='a']")!;
    expect(inputs).toHaveLength(3);
    expect(host.querySelector(".pw-data-table-primary-title")?.textContent).toBe("Alpha");
    expect(host.querySelector(".pw-data-table-primary-description")).toBeNull();
    expect(host.querySelector(".pw-icon-tile")?.getAttribute("data-size")).toBe("24");
    expect(host.querySelector(".pw-icon-tile-mark")?.textContent).toBe("Icon");

    firstRowInput.click();
    expect(firstRowInput.checked).toBe(true);
    await vi.waitFor(() => expect(headerInput.indeterminate).toBe(true));
    expect(activate).not.toHaveBeenCalled();

    firstRowInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(activate).not.toHaveBeenCalled();
    firstRow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(activate).toHaveBeenCalledWith({ id: "a", name: "Alpha" });
    dispose();
    host.remove();
  });

  it("keeps the legacy leading slot unwrapped", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <DataTable.Root rows={[{ id: "a" }]}>
          <DataTable.Table aria-label="Legacy leading fixture">
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id}>
                  <DataTable.PrimaryCell
                    leading={<span data-legacy-leading>Legacy</span>}
                    title={row.id}
                  />
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    expect(host.querySelector("[data-legacy-leading]")?.textContent).toBe("Legacy");
    expect(host.querySelector(".pw-icon-tile")).toBeNull();
    dispose();
    host.remove();
  });

  it("keeps the active row independent from checkbox selection", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [activeRowId, setActiveRowId] = createSignal<string | null>("a");
    const activate = vi.fn();
    const activeChange = vi.fn((rowId: string | null) => setActiveRowId(rowId));
    const dispose = render(
      () => (
        <DataTable.Root
          rows={[{ id: "a" }, { id: "b" }]}
          selectionMode="multiple"
          activeRowId={activeRowId()}
          onActiveRowChange={activeChange}
        >
          <DataTable.Table aria-label="Active row fixture">
            <DataTable.Header>
              <DataTable.SelectionCell />
              <DataTable.ColumnHeader id="id">ID</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id} onActivate={activate}>
                  <DataTable.SelectionCell rowId={row.id} />
                  <DataTable.Cell>{row.id}</DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    const firstRow = host.querySelector<HTMLTableRowElement>("[data-row-id='a']")!;
    const secondRow = host.querySelector<HTMLTableRowElement>("[data-row-id='b']")!;
    const secondCheckbox = secondRow.querySelector<HTMLInputElement>("input")!;
    expect(firstRow.getAttribute("aria-current")).toBe("true");
    expect(firstRow.classList.contains("pw-data-table-row--active")).toBe(true);

    secondCheckbox.click();
    await vi.waitFor(() => expect(secondCheckbox.checked).toBe(true));
    expect(activeChange).not.toHaveBeenCalled();
    expect(secondRow.getAttribute("aria-current")).toBeNull();
    expect(secondRow.classList.contains("pw-data-table-row--selected")).toBe(true);

    secondRow.click();
    await vi.waitFor(() => expect(secondRow.getAttribute("aria-current")).toBe("true"));
    expect(activeChange).toHaveBeenCalledWith("b");
    expect(activate).toHaveBeenCalledWith({ id: "b" });
    expect(secondCheckbox.checked).toBe(true);

    dispose();
    host.remove();
  });

  it("activates the first ordered visible row and repairs it after filtering", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [rows, setRows] = createSignal([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Charlie" },
    ]);
    const [activeRowId, setActiveRowId] = createSignal<string | null>(null);
    const activeChange = vi.fn((rowId: string | null) => setActiveRowId(rowId));
    const dispose = render(
      () => (
        <DataTable.Root
          rows={rows()}
          defaultSort={{ columnId: "name", direction: "descending" }}
          activeRowId={activeRowId()}
          onActiveRowChange={activeChange}
          activateFirstRow
        >
          <DataTable.Table aria-label="Automatic activation fixture">
            <DataTable.Header>
              <DataTable.ColumnHeader id="name" sortBy={(row) => row.name}>
                Name
              </DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id}>
                  <DataTable.Cell>{row.name}</DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    await vi.waitFor(() => expect(activeRowId()).toBe("c"));
    expect(host.querySelector("[data-row-id='c']")?.getAttribute("aria-current")).toBe("true");

    setRows([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ]);
    await vi.waitFor(() => expect(activeRowId()).toBe("b"));
    expect(host.querySelector("[data-row-id='b']")?.getAttribute("aria-current")).toBe("true");
    expect(activeChange).toHaveBeenLastCalledWith("b");

    dispose();
    host.remove();
  });

  it("omits the select-all input in single-selection mode", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <DataTable.Root rows={[{ id: "a" }, { id: "b" }]} selectionMode="single">
          <DataTable.Table aria-label="Single selection fixture">
            <DataTable.Header>
              <DataTable.SelectionCell />
              <DataTable.ColumnHeader id="id">ID</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id}>
                  <DataTable.SelectionCell rowId={row.id} />
                  <DataTable.PrimaryCell icon={<span>Icon</span>} iconTone="neutral" title={row.id} />
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    expect(host.querySelectorAll(".pw-data-table-selection-header input")).toHaveLength(0);
    expect(host.querySelectorAll(".pw-data-table-selection-cell input")).toHaveLength(2);
    dispose();
    host.remove();
  });

  it("delegates background dismissal to DetailPanel and keeps row double-click expansion", () => {
    expect(tableSource).not.toContain("hideDetailPanelFromCollectionBackground");
    expect(tableSource).toContain("onDblClick");
    expect(tableSource).toContain("designSystem.expandDetail()");
  });

  it("closes the shared floating detail on empty scroll background without clearing its target", () => {
    detailPanelStore.setState({
      ...detailPanelDefaultState,
      activeScope: "knowledge:evidence",
      activeTarget: {
        scopeId: "knowledge:evidence",
        entityId: "a",
        entityKind: "resource",
      },
      open: true,
      available: true,
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => {
        const open = createDetailPanelSelector((state) => state.open);
        return (
        <DetailPanel.Root open={open()} expanded={false} available
          onOpenChange={(next) => { if (next) detailPanelStore.getState().show(); else detailPanelStore.getState().hide(); }}
          onExpandedChange={() => undefined}>
        <DetailPanel.Collection>
        <DataTable.Root rows={[{ id: "a" }]} activeRowId="a">
          <DataTable.Table aria-label="Background fixture">
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id}>
                  <DataTable.Cell>{row.id}</DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
        </DetailPanel.Collection>
        </DetailPanel.Root>
        );
      },
      host,
    );

    const scroll = host.querySelector<HTMLElement>(".pw-data-table-scroll")!;
    scroll.click();
    expect(detailPanelStore.getState().open).toBe(false);
    expect(detailPanelStore.getState().activeTarget?.entityId).toBe("a");

    scroll.click();
    expect(detailPanelStore.getState().open).toBe(false);

    dispose();
    host.remove();
  });

  it("expands the detail sidebar when double-clicking an interactive row", () => {
    detailPanelStore.setState({
      ...detailPanelDefaultState,
      activeScope: "knowledge:evidence",
      activeTarget: {
        scopeId: "knowledge:evidence",
        entityId: "a",
        entityKind: "resource",
      },
      open: true,
      available: true,
    });

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <DataTable.Root
          rows={[{ id: "a" }]}
          activeRowId="a"
          onActiveRowChange={() => undefined}
        >
          <DataTable.Table aria-label="Double-click expand fixture">
            <DataTable.Body>
              {(row) => (
                <DataTable.Row row={row} rowId={row.id}>
                  <DataTable.Cell>{row.id}</DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      ),
      host,
    );

    const row = host.querySelector<HTMLElement>("[data-row-id='a']")!;
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(detailPanelStore.getState().expanded).toBe(true);

    dispose();
    host.remove();
  });
});

describe("DataTable column widths", () => {
  it("reads only positive finite stored widths", () => {
    window.localStorage.setItem("test.table.columns", JSON.stringify({ user: 120, bad: "x", zero: 0, nan: null }));
    expect(readDataTableColumnWidths("test.table.columns")).toEqual({ user: 120 });
    window.localStorage.setItem("test.table.columns", "{not json");
    expect(readDataTableColumnWidths("test.table.columns")).toEqual({});
    expect(readDataTableColumnWidths(undefined)).toEqual({});
    window.localStorage.removeItem("test.table.columns");
  });

  it("keeps the auto layout and wraps cells in reference tables", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => (
      <DataTable.Root rows={[{ id: "a", label: "Alpha" }]} getRowId={row => row.id} resizableColumns={false}>
        <DataTable.Table>
          <DataTable.Header><DataTable.ColumnHeader id="label">Label</DataTable.ColumnHeader></DataTable.Header>
          <DataTable.Body>{row => <DataTable.Row row={row} rowId={row.id}><DataTable.Cell>{row.label}</DataTable.Cell></DataTable.Row>}</DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    ), host);
    expect(host.querySelector("th")?.dataset.truncate).toBeUndefined();
    expect(host.querySelector(".pw-data-table-column-resizer")).toBeNull();
    expect(host.querySelector(".pw-inline-fade")).toBeNull();
    dispose();
    host.remove();
  });
});
