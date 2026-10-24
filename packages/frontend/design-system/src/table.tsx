import { ArrowDown, ArrowUp, X } from "./hugeicons";
import { IconTile, type IconTileTone } from "./icon-tile";
import { useDesignSystem } from "./provider";
import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Portal, isServer } from "solid-js/web";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { createFluidHover, FluidHoverHighlight, type FluidHover } from "./fluid-hover";
import { spring } from "./springs";
import { Tooltip } from "./tooltip";
import "./table.css";

export type DataTableSortDirection = "ascending" | "descending";

export type DataTableSortState = {
  columnId: string;
  direction: DataTableSortDirection;
} | null;

export type DataTableSortValue = string | number | boolean | Date | null | undefined;

export type DataTableSelectionState = ReadonlySet<string>;

export type DataTableSelectionMode = "none" | "single" | "multiple";

export type DataTableRootProps<T = any> = {
  rows: readonly T[];
  getRowId?: (row: T, index: number) => string;
  sort?: DataTableSortState;
  defaultSort?: DataTableSortState;
  onSortChange?: (sort: DataTableSortState) => void;
  selectionMode?: DataTableSelectionMode;
  /** @deprecated Use `selectionMode="multiple"`. */
  selectable?: boolean;
  selectedRowIds?: DataTableSelectionState;
  defaultSelectedRowIds?: Iterable<string>;
  onSelectionChange?: (selection: DataTableSelectionState) => void;
  activeRowId?: string | null;
  onActiveRowChange?: (rowId: string | null) => void;
  activateFirstRow?: boolean;
  virtualized?: boolean;
  estimateRowHeight?: number;
  /** Fixed outer row pitch, including the table row gap. */
  fixedRowHeight?: number;
  overscan?: number;
  gutters?: boolean;
  /** Header dividers resize columns, and cells truncate with a fade. Off for wrapping reference tables. */
  resizableColumns?: boolean;
  /** Persists resized column widths under the design system's storage prefix. */
  columnWidthsKey?: string;
  children: JSX.Element;
  class?: string;
};

export type DataTableSelectionToolbarState<T> = {
  selectedRows: Accessor<readonly T[]>;
  selectedRowIds: Accessor<DataTableSelectionState>;
  selectedCount: Accessor<number>;
  clearSelection: () => void;
};

export type DataTableSelectionToolbarProps<T = any> = {
  children: (selection: DataTableSelectionToolbarState<T>) => JSX.Element;
  hasActions?: boolean | ((selection: DataTableSelectionToolbarState<T>) => boolean);
  emptyActionsLabel?: string;
  class?: string;
};

export type DataTableColumnHeaderProps<T = any> = {
  id: string;
  children: JSX.Element;
  sortable?: boolean;
  sortBy?: (row: T) => DataTableSortValue;
  compare?: (left: T, right: T) => number;
  width?: string;
  /** Actions and icon-only columns keep their width and have no divider. */
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  class?: string;
};

type IndexedRow<T> = {
  row: T;
  sourceIndex: number;
  id: string;
};

type RegisteredColumn<T> = {
  id: string;
  sortable: boolean;
  sortBy: (row: T) => DataTableSortValue;
  compare?: (left: T, right: T) => number;
  resizable: boolean;
  /** An explicit `width` is a design choice; the initial distribution leaves it alone. */
  fixedWidth: boolean;
  minWidth: number;
  maxWidth: number;
};

type DataTableContextValue<T> = {
  rows: Accessor<readonly IndexedRow<T>[]>;
  registerColumn: (column: RegisteredColumn<T>) => VoidFunction;
  sort: Accessor<DataTableSortState>;
  cycleSort: (columnId: string) => void;
  selectionMode: Accessor<DataTableSelectionMode>;
  selectable: Accessor<boolean>;
  selectedRowIds: Accessor<DataTableSelectionState>;
  selectedRows: Accessor<readonly IndexedRow<T>[]>;
  activeRowId: Accessor<string | null>;
  activeEnabled: Accessor<boolean>;
  activateRow: (rowId: string) => void;
  toggleRow: (rowId: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  allVisibleSelected: Accessor<boolean>;
  someVisibleSelected: Accessor<boolean>;
  virtualized: Accessor<boolean>;
  estimateRowHeight: Accessor<number>;
  fixedRowHeight: Accessor<number | undefined>;
  overscan: Accessor<number>;
  scrollElement: Accessor<HTMLDivElement | null>;
  setScrollElement: (element: HTMLDivElement) => void;
  columnCount: Accessor<number>;
  resizableColumns: Accessor<boolean>;
  columnsFrozen: Accessor<boolean>;
  columnWidths: Accessor<Readonly<Record<string, number>>>;
  flexColumnId: Accessor<string | undefined>;
  registerHeader: (id: string, element: HTMLTableCellElement) => VoidFunction;
  setColumnWidth: (id: string, width: number) => void;
  resetColumnWidth: (id: string) => void;
  persistColumnWidths: () => void;
};

const DATA_TABLE_MIN_COLUMN_WIDTH = 48;
const DATA_TABLE_MAX_COLUMN_WIDTH = 360;
/** Room the flexible column keeps when the others outgrow the viewport. */
const DATA_TABLE_FLEX_COLUMN_MIN_WIDTH = 96;
const DATA_TABLE_SELECTION_COLUMN_WIDTH = 40;
/** Long content does not freeze a column wider than this; the divider widens it further. */
const DATA_TABLE_MAX_NATURAL_COLUMN_WIDTH = 320;
const DATA_TABLE_OVERFLOW_TOOLTIP_DELAY = 400;

export function clampDataTableColumnWidth(
  width: number,
  limits: { minWidth: number; maxWidth: number },
): number {
  return Math.round(Math.min(limits.maxWidth, Math.max(limits.minWidth, width)));
}

/**
 * Initial column widths: content widths, with the viewport's spare room shared in proportion
 * among the columns that have no explicit width (the flexible one weighs double). The flexible column keeps its share implicitly
 * (it gets no width), so it is left out of the result.
 */
export function distributeDataTableColumnWidths(
  natural: Readonly<Record<string, number>>,
  options: {
    available: number;
    flexColumnId: string | undefined;
    columns: ReadonlyMap<string, { resizable: boolean; fixedWidth: boolean; minWidth: number; maxWidth: number }>;
  },
): Record<string, number> {
  const total = Object.values(natural).reduce((sum, width) => sum + width, 0);
  // The flexible column usually holds the main value, so it takes a double share.
  const weight = (id: string): number => {
    if (id === options.flexColumnId) return 2;
    const column = options.columns.get(id);
    return column?.resizable && !column.fixedWidth ? 1 : 0;
  };
  const weightedTotal = Object.entries(natural).reduce((sum, [id, width]) => sum + width * weight(id), 0);
  const spare = Math.max(0, options.available - total);
  const widths: Record<string, number> = {};
  for (const [id, width] of Object.entries(natural)) {
    if (id === options.flexColumnId) continue;
    const column = options.columns.get(id);
    const grown = weightedTotal > 0 ? width + (spare * width * weight(id)) / weightedTotal : width;
    widths[id] = column?.resizable ? clampDataTableColumnWidth(grown, column) : Math.round(grown);
  }
  return widths;
}

export function readDataTableColumnWidths(key: string | undefined): Record<string, number> {
  if (!key || isServer) return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0),
    );
  } catch {
    return {};
  }
}

const DataTableContext = createContext<DataTableContextValue<never>>();
const DataTableSelectionToolbarHostContext = createContext<Accessor<HTMLElement | undefined>>();
/** The table's one row highlight; interactive rows join it by their position in the body. */
const DataTableHoverContext = createContext<{ hover: FluidHover; enabled: Accessor<boolean> }>();
const DataTableRowIndexContext = createContext<Accessor<number>>();

function bridgeDataTableContext<From, To>(
  context: DataTableContextValue<From>,
): DataTableContextValue<To> {
  // SAFETY: DataTable.Root and its compound children share one row type; the
  // context erases that generic only while crossing Solid's non-generic Context API.
  return context as never;
}

function useDataTable<T = never>(part: string): DataTableContextValue<T> {
  const context = useContext(DataTableContext);
  if (!context) throw new Error(`DataTable.${part} must be used inside DataTable.Root`);
  return bridgeDataTableContext<never, T>(context);
}

export function getNextDataTableSort(
  current: DataTableSortState,
  columnId: string,
): DataTableSortState {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "ascending" };
  }
  if (current.direction === "ascending") {
    return { columnId, direction: "descending" };
  }
  return null;
}

export function getDataTableAriaSort(
  current: DataTableSortState,
  columnId: string,
  sortable = true,
): DataTableSortDirection | "none" | undefined {
  if (!sortable) return undefined;
  return current?.columnId === columnId ? current.direction : "none";
}

function isNumberSortValue(value: DataTableSortValue): value is number {
  return Object.prototype.toString.call(value) === "[object Number]";
}

function isBooleanSortValue(value: DataTableSortValue): value is boolean {
  return value === true || value === false;
}

function isStringSortValue(value: DataTableSortValue): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function compareSortValues(left: DataTableSortValue, right: DataTableSortValue): number {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (isNumberSortValue(leftValue) && isNumberSortValue(rightValue)) {
    return leftValue - rightValue;
  }
  if (isBooleanSortValue(leftValue) && isBooleanSortValue(rightValue)) {
    return Number(leftValue) - Number(rightValue);
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isMissingSortValue(value: DataTableSortValue): boolean {
  return value === null || value === undefined || value === "";
}

export function sortDataTableRows<T>(
  rows: readonly T[],
  sort: DataTableSortState,
  column?: {
    sortBy: (row: T) => DataTableSortValue;
    compare?: (left: T, right: T) => number;
  },
): T[] {
  if (!sort || !column) return [...rows];
  const direction = sort.direction === "ascending" ? 1 : -1;
  return rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((left, right) => {
      let comparison: number;
      if (column.compare) {
        comparison = column.compare(left.row, right.row);
      } else {
        const leftValue = column.sortBy(left.row);
        const rightValue = column.sortBy(right.row);
        const leftMissing = isMissingSortValue(leftValue);
        const rightMissing = isMissingSortValue(rightValue);
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        comparison = compareSortValues(leftValue, rightValue);
      }
      return comparison === 0
        ? left.sourceIndex - right.sourceIndex
        : comparison * direction;
    })
    .map((entry) => entry.row);
}

export function getNextDataTableSelection(
  current: DataTableSelectionState,
  visibleRowIds: Iterable<string>,
  rowId?: string,
): DataTableSelectionState {
  const next = new Set(current);
  if (rowId !== undefined) {
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    return next;
  }

  const visible = [...visibleRowIds];
  const allVisibleSelected = visible.length > 0 && visible.every((id) => next.has(id));
  for (const id of visible) {
    if (allVisibleSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function getDataTableSelectionMode(
  selectionMode?: DataTableSelectionMode,
  selectable = false,
): DataTableSelectionMode {
  return selectionMode ?? (selectable ? "multiple" : "none");
}

export function getNextDataTableSelectionForMode(
  current: DataTableSelectionState,
  visibleRowIds: Iterable<string>,
  mode: DataTableSelectionMode,
  rowId?: string,
): DataTableSelectionState {
  if (mode === "none") return new Set();
  if (mode === "single") {
    if (rowId === undefined) return new Set(current);
    return current.has(rowId) ? new Set() : new Set([rowId]);
  }
  return getNextDataTableSelection(current, visibleRowIds, rowId);
}

export function pruneDataTableSelection(
  current: DataTableSelectionState,
  visibleRowIds: Iterable<string>,
  mode: DataTableSelectionMode,
): DataTableSelectionState {
  if (mode === "none") return new Set();
  const next = new Set<string>();
  for (const id of visibleRowIds) {
    if (!current.has(id)) continue;
    next.add(id);
    if (mode === "single") break;
  }
  return next;
}

export function getSelectedDataTableRows<T>(
  rows: readonly T[],
  selection: DataTableSelectionState,
  getRowId: (row: T, index: number) => string = (row, index) => defaultRowId(row, index),
): T[] {
  return rows.filter((row, index) => selection.has(getRowId(row, index)));
}

function dataTableSelectionsEqual(
  left: DataTableSelectionState,
  right: DataTableSelectionState,
): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function defaultRowId<T>(row: T, index: number): string {
  if (row instanceof Object && "id" in row) {
    // SAFETY: row is an object and has an id property, we can safely read it.
    const id = (row as Record<string, DataTableSortValue>).id;
    if (isStringSortValue(id) || isNumberSortValue(id)) return String(id);
  }
  return String(index);
}

function DataTableRoot<T = any>(props: DataTableRootProps<T>) {
  const [internalSort, setInternalSort] = createSignal<DataTableSortState>(
    props.defaultSort ?? null,
  );
  const [internalSelection, setInternalSelection] = createSignal<ReadonlySet<string>>(
    new Set(props.defaultSelectedRowIds ?? []),
  );
  const [internalActiveRowId, setInternalActiveRowId] = createSignal<string | null>(null);
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = createSignal(0);
  const [columnVersion, setColumnVersion] = createSignal(0);
  const columns = new Map<string, RegisteredColumn<T>>();
  const designSystem = useDesignSystem();
  const resizableColumns = () => props.resizableColumns !== false;
  const [columnsFrozen, setColumnsFrozen] = createSignal(false);
  const [columnWidths, setColumnWidths] = createSignal<Readonly<Record<string, number>>>({});
  const naturalWidths: Record<string, number> = {};
  // Only widths someone set persist; the rest re-measure, so better natural sizing still applies.
  const resizedColumns = new Set<string>();
  const headers = new Map<string, HTMLTableCellElement>();
  const widthsKey = () =>
    props.columnWidthsKey ? designSystem.storageKey(`table.${props.columnWidthsKey}.columns`) : undefined;
  // The last resizable column has no width of its own: it absorbs what the others leave.
  const flexColumnId = createMemo(() => {
    columnVersion();
    let last: string | undefined;
    for (const column of columns.values()) if (column.resizable) last = column.id;
    return last;
  });

  const sourceRows = createMemo<readonly IndexedRow<T>[]>((previous) => {
    const byId = new Map(previous?.map(entry => [entry.id, entry]));
    return props.rows.map((row, sourceIndex) => {
      const id = props.getRowId?.(row, sourceIndex) ?? defaultRowId(row, sourceIndex);
      const existing = byId.get(id);
      return existing?.row === row && existing.sourceIndex === sourceIndex
        ? existing
        : { row, sourceIndex, id };
    });
  });
  const sort = (): DataTableSortState =>
    props.sort !== undefined ? props.sort : internalSort();
  const selectionMode = (): DataTableSelectionMode =>
    getDataTableSelectionMode(props.selectionMode, Boolean(props.selectable));
  const rawSelectedRowIds = (): DataTableSelectionState =>
    props.selectedRowIds !== undefined ? props.selectedRowIds : internalSelection();
  const visibleIds = createMemo(() => new Set(sourceRows().map((entry) => entry.id)));
  const selectedRowIds = createMemo<DataTableSelectionState>(() =>
    pruneDataTableSelection(rawSelectedRowIds(), visibleIds(), selectionMode()),
  );
  const selectedRows = createMemo<readonly IndexedRow<T>[]>(() =>
    sourceRows().filter((entry) => selectedRowIds().has(entry.id)),
  );
  const activeEnabled = (): boolean =>
    props.activeRowId !== undefined ||
    props.onActiveRowChange !== undefined ||
    Boolean(props.activateFirstRow);
  const activeRowId = (): string | null =>
    props.activeRowId !== undefined ? props.activeRowId : internalActiveRowId();

  const orderedRows = createMemo<readonly IndexedRow<T>[]>(() => {
    columnVersion();
    const currentSort = sort();
    if (!currentSort) return sourceRows();
    const column = columns.get(currentSort.columnId);
    if (!column?.sortable) return sourceRows();
    return sortDataTableRows(sourceRows(), currentSort, {
      sortBy: (entry) => column.sortBy(entry.row),
      compare: column.compare
        ? (left, right) => column.compare!(left.row, right.row)
        : undefined,
    });
  });

  const updateSelection = (next: ReadonlySet<string>) => {
    if (props.selectedRowIds === undefined) setInternalSelection(next);
    props.onSelectionChange?.(next);
  };
  const updateActiveRow = (next: string | null) => {
    if (props.activeRowId === undefined) setInternalActiveRowId(next);
    props.onActiveRowChange?.(next);
  };
  createEffect(() => {
    const raw = rawSelectedRowIds();
    const next = selectedRowIds();
    if (!dataTableSelectionsEqual(raw, next)) updateSelection(next);
  });
  createEffect(() => {
    if (!props.activateFirstRow) return;
    const ordered = orderedRows();
    const current = activeRowId();
    const next = ordered.some((entry) => entry.id === current)
      ? current
      : ordered[0]?.id ?? null;
    if (next !== current) updateActiveRow(next);
  });
  const allVisibleSelected = createMemo(
    () =>
      selectionMode() === "multiple" &&
      visibleIds().size > 0 &&
      [...visibleIds()].every((id) => selectedRowIds().has(id)),
  );
  const someVisibleSelected = createMemo(
    () =>
      !allVisibleSelected() &&
      [...visibleIds()].some((id) => selectedRowIds().has(id)),
  );

  // Freeze the column widths once rows have painted, so live data never reflows columns.
  const freezeColumns = (): boolean => {
    const table = headers.values().next().value?.closest("table");
    const scroller = scrollElement();
    if (!table || !scroller) return false;
    // Measure at content width: a full-width table spreads its leftover space into every column.
    const previousWidth = table.style.width;
    table.style.width = "max-content";
    const natural: Record<string, number> = {};
    let hidden = false;
    for (const [id, element] of headers) {
      const width = element.offsetWidth;
      if (width === 0) hidden = true;
      natural[id] = Math.min(width, DATA_TABLE_MAX_NATURAL_COLUMN_WIDTH);
    }
    table.style.width = previousWidth;
    if (hidden) return false;
    const measured = distributeDataTableColumnWidths(natural, {
      available: scroller.clientWidth - (selectionMode() === "none" ? 0 : DATA_TABLE_SELECTION_COLUMN_WIDTH),
      flexColumnId: flexColumnId(),
      columns,
    });
    Object.assign(naturalWidths, measured);
    const stored = readDataTableColumnWidths(widthsKey());
    for (const [id, width] of Object.entries(stored)) {
      const column = columns.get(id);
      if (!(id in measured) || !column?.resizable) continue;
      measured[id] = clampDataTableColumnWidth(width, column);
      resizedColumns.add(id);
    }
    setColumnWidths(measured);
    setColumnsFrozen(true);
    return true;
  };
  createEffect(() => {
    if (!resizableColumns() || columnsFrozen() || orderedRows().length === 0) return;
    const scroller = scrollElement();
    if (!scroller) return;
    let observer: ResizeObserver | undefined;
    const frame = requestAnimationFrame(() => {
      if (freezeColumns() || typeof ResizeObserver === "undefined") return;
      // A hidden table measures zero; freeze once it gets a size.
      observer = new ResizeObserver(() => {
        if (freezeColumns()) observer?.disconnect();
      });
      observer.observe(scroller);
    });
    onCleanup(() => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    });
  });

  const context: DataTableContextValue<T> = {
    rows: orderedRows,
    registerColumn: (column) => {
      const isNew = !columns.has(column.id);
      columns.set(column.id, column);
      setColumnVersion((version) => version + 1);
      if (isNew) setColumnCount((count) => count + 1);
      return () => {
        if (columns.delete(column.id)) {
          setColumnVersion((version) => version + 1);
          setColumnCount((count) => Math.max(0, count - 1));
        }
      };
    },
    sort,
    cycleSort: (columnId) => {
      const next = getNextDataTableSort(sort(), columnId);
      if (props.sort === undefined) setInternalSort(next);
      props.onSortChange?.(next);
    },
    selectionMode,
    selectable: () => selectionMode() !== "none",
    selectedRowIds,
    selectedRows,
    activeRowId,
    activeEnabled,
    activateRow: updateActiveRow,
    toggleRow: (rowId) => {
      updateSelection(
        getNextDataTableSelectionForMode(
          selectedRowIds(),
          visibleIds(),
          selectionMode(),
          rowId,
        ),
      );
    },
    toggleAll: () => {
      if (selectionMode() !== "multiple") return;
      updateSelection(
        getNextDataTableSelectionForMode(selectedRowIds(), visibleIds(), "multiple"),
      );
    },
    clearSelection: () => updateSelection(new Set()),
    allVisibleSelected,
    someVisibleSelected,
    virtualized: () => Boolean(props.virtualized),
    estimateRowHeight: () => props.fixedRowHeight ?? props.estimateRowHeight ?? 38,
    fixedRowHeight: () => props.fixedRowHeight,
    overscan: () => props.overscan ?? 8,
    scrollElement,
    setScrollElement,
    columnCount: () => columnCount() + (selectionMode() === "none" ? 0 : 1),
    resizableColumns,
    columnsFrozen,
    columnWidths,
    flexColumnId,
    registerHeader: (id, element) => {
      headers.set(id, element);
      return () => {
        if (headers.get(id) === element) headers.delete(id);
      };
    },
    setColumnWidth: (id, width) => {
      const column = columns.get(id);
      resizedColumns.add(id);
      setColumnWidths((current) => ({ ...current, [id]: column ? clampDataTableColumnWidth(width, column) : Math.round(width) }));
    },
    resetColumnWidth: (id) => {
      const natural = naturalWidths[id];
      if (natural === undefined) return;
      resizedColumns.delete(id);
      setColumnWidths((current) => ({ ...current, [id]: natural }));
      context.persistColumnWidths();
    },
    persistColumnWidths: () => {
      const key = widthsKey();
      if (!key || isServer) return;
      const resizable = Object.fromEntries(
        Object.entries(columnWidths()).filter(([id]) => resizedColumns.has(id) && columns.get(id)?.resizable),
      );
      try { window.localStorage.setItem(key, JSON.stringify(resizable)); } catch { /* Resizing remains usable without storage. */ }
    },
  };

  return (
    <DataTableContext.Provider value={bridgeDataTableContext<T, never>(context)}>
      <div
        class={`pw-data-table-root ${props.class ?? ""}`}
        data-selection-active={selectedRows().length > 0 ? "true" : undefined}
        data-gutters={props.gutters === false ? "false" : undefined}
      >
        {props.children}
      </div>
    </DataTableContext.Provider>
  );
}

export function DataTableSelectionToolbarHost(props: {
  children: JSX.Element;
  class?: string;
}) {
  const [host, setHost] = createSignal<HTMLElement>();
  return (
    <DataTableSelectionToolbarHostContext.Provider value={host}>
      {props.children}
      <div
        ref={setHost}
        class={`pw-data-table-selection-toolbar-host ${props.class ?? ""}`}
      />
    </DataTableSelectionToolbarHostContext.Provider>
  );
}

function DataTableToolbar(props: { children: JSX.Element; class?: string }) {
  return <div class={`pw-data-table-toolbar ${props.class ?? ""}`}>{props.children}</div>;
}

function DataTableTable(props: {
  children: JSX.Element;
  class?: string;
  "aria-label"?: string;
}) {
  const context = useDataTable("Table");
  let scroll: HTMLDivElement | undefined;
  const [pointerInside, setPointerInside] = createSignal(false);
  const [focusInside, setFocusInside] = createSignal(false);
  // Empty gaps do not activate rows or collapse the floating detail card.
  const hover = createFluidHover(() => scroll, { gapClick: false });
  const entryAt = (index: number | null) =>
    index === null ? undefined : context.rows()[index];
  // Over a selected row the highlight takes the selected fill, so hover never hides selection.
  const hoverClass = () => {
    const entry = entryAt(hover.activeIndex());
    return entry && context.selectedRowIds().has(entry.id)
      ? "pw-data-table-hover pw-data-table-hover--selected"
      : "pw-data-table-hover";
  };
  const activeIndex = () => {
    const rowId = context.activeEnabled() ? context.activeRowId() : null;
    if (rowId === null) return null;
    const index = context.rows().findIndex((entry) => entry.id === rowId);
    return index < 0 ? null : index;
  };
  const activeRect = () => {
    const index = activeIndex();
    return index === null ? null : (hover.rects()[index] ?? null);
  };
  const tableMinWidth = () => {
    if (!context.columnsFrozen()) return undefined;
    const fixed = Object.entries(context.columnWidths())
      .reduce((sum, [id, width]) => (id === context.flexColumnId() ? sum : sum + width), 0);
    const selection = context.selectable() ? DATA_TABLE_SELECTION_COLUMN_WIDTH : 0;
    return `${fixed + selection + DATA_TABLE_FLEX_COLUMN_MIN_WIDTH}px`;
  };

  // One tooltip per table shows the full text of whichever truncated cell the pointer rests on.
  const [overflow, setOverflow] = createSignal<{ text: string; rect: DOMRect } | null>(null);
  // Live tables re-render rows, so a cell is tracked by row and column, not by element.
  let overflowKey: string | null = null;
  let overflowTimer: ReturnType<typeof setTimeout> | undefined;
  const closeOverflow = () => {
    if (overflowTimer !== undefined) clearTimeout(overflowTimer);
    overflowTimer = undefined;
    overflowKey = null;
    setOverflow(null);
  };
  const fadeTargetAt = (target: EventTarget | Element | null) =>
    target instanceof Element ? target.closest<HTMLElement>(".pw-inline-fade") : null;
  const overflowKeyOf = (target: HTMLElement) =>
    `${target.closest("tr")?.dataset.rowId ?? ""}:${target.closest<HTMLTableCellElement>("td, th")?.cellIndex ?? ""}`;
  const trackOverflow = (event: PointerEvent) => {
    const target = fadeTargetAt(event.target);
    const key = target ? overflowKeyOf(target) : null;
    if (key === overflowKey) return;
    closeOverflow();
    if (!target || target.scrollWidth <= target.clientWidth) return;
    overflowKey = key;
    const { clientX, clientY } = event;
    overflowTimer = setTimeout(() => {
      overflowTimer = undefined;
      const live = target.isConnected ? target : fadeTargetAt(document.elementFromPoint(clientX, clientY));
      const text = live && live.scrollWidth > live.clientWidth ? live.textContent?.trim() : undefined;
      if (text) setOverflow({ text, rect: live!.getBoundingClientRect() });
      else overflowKey = null;
    }, DATA_TABLE_OVERFLOW_TOOLTIP_DELAY);
  };
  onCleanup(closeOverflow);

  return (
    <DataTableHoverContext.Provider value={{ hover, enabled: () => pointerInside() || focusInside() }}>
      <div
        ref={(element) => {
          scroll = element;
          context.setScrollElement(element);
        }}
        class="pw-data-table-scroll"
        data-virtualized={context.virtualized() ? "true" : undefined}
        data-fixed-row-height={context.fixedRowHeight() !== undefined ? "true" : undefined}
        data-column-layout={context.columnsFrozen() ? "fixed" : undefined}
        style={{ "--table-row-pitch": `${context.estimateRowHeight()}px` }}
        onScroll={closeOverflow}
      >
        <FluidHoverHighlight hover={hover} class={hoverClass()} />
        {/* The active row's marker travels between rows; a re-sort that moves it snaps. */}
        <FluidHoverHighlight
          class="pw-data-table-active"
          rect={activeRect()}
          targetKey={context.activeRowId()}
          transition={spring.moderate}
        />
        <table
          class={`pw-data-table ${props.class ?? ""}`}
          aria-label={props["aria-label"]}
          style={{ "min-width": tableMinWidth() }}
          onPointerEnter={event => { setPointerInside(true); hover.handlers.onPointerEnter(event); }}
          onPointerMove={hover.handlers.onPointerMove}
          onPointerOver={trackOverflow}
          onPointerDown={closeOverflow}
          onPointerLeave={() => { setPointerInside(false); hover.handlers.onPointerLeave(); closeOverflow(); }}
          onFocusIn={event => { setFocusInside(true); hover.handlers.onFocusIn(event); }}
          onFocusOut={event => {
            setFocusInside(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));
            hover.handlers.onFocusOut(event);
          }}
        >
          {props.children}
        </table>
      </div>
      <Tooltip.Root
        open={overflow() !== null}
        onOpenChange={(open) => { if (!open) closeOverflow(); }}
        openDelay={0}
        getAnchorRect={() => overflow()?.rect ?? null}
      >
        <Tooltip.Content class="pw-data-table-overflow-tooltip">{overflow()?.text}</Tooltip.Content>
      </Tooltip.Root>
    </DataTableHoverContext.Provider>
  );
}

function DataTableHeader(props: { children: JSX.Element; class?: string }) {
  return (
    <thead class={props.class}>
      <tr>{props.children}</tr>
    </thead>
  );
}

function DataTableColumnHeader<T = any>(props: DataTableColumnHeaderProps<T>) {
  const context = useDataTable<T>("ColumnHeader");
  const sortable = () => props.sortable !== false;
  const sortBy = (row: T): DataTableSortValue => {
    if (props.sortBy) return props.sortBy(row);
    if (row instanceof Object && props.id in row) {
      // SAFETY: We verified row is an object containing the id key.
      return (row as Record<string, DataTableSortValue>)[props.id];
    }
    return undefined;
  };
  const resizable = () => context.resizableColumns() && props.resizable !== false;
  const dispose = context.registerColumn({
    id: props.id,
    sortable: sortable(),
    sortBy,
    compare: props.compare,
    resizable: resizable(),
    fixedWidth: props.width !== undefined,
    minWidth: props.minWidth ?? DATA_TABLE_MIN_COLUMN_WIDTH,
    maxWidth: props.maxWidth ?? DATA_TABLE_MAX_COLUMN_WIDTH,
  });
  onCleanup(dispose);
  const width = () => {
    if (!context.columnsFrozen()) return props.width;
    if (context.flexColumnId() === props.id) return undefined;
    const frozen = context.columnWidths()[props.id];
    return frozen === undefined ? props.width : `${frozen}px`;
  };
  const showResizer = () =>
    resizable() && context.columnsFrozen() && context.flexColumnId() !== props.id;
  const label = () => (typeof props.children === "string" ? props.children : props.id);

  const state = () =>
    context.sort()?.columnId === props.id ? context.sort()?.direction : undefined;
  const ariaSort = () => getDataTableAriaSort(context.sort(), props.id, sortable());
  const alignClass = () => `pw-data-table-align-${props.align ?? "left"}`;

  return (
    <th
      ref={(element) => onCleanup(context.registerHeader(props.id, element))}
      class={`pw-data-table-column-header ${alignClass()} ${props.class ?? ""}`}
      style={{ width: width() }}
      data-truncate={resizable() ? "true" : undefined}
      aria-sort={sortable() ? ariaSort() : undefined}
      scope="col"
    >
      <Show
        when={sortable()}
        fallback={<span class="pw-data-table-column-label">{props.children}</span>}
      >
        <button
          type="button"
          class="pw-data-table-sort-trigger"
          classList={{ "pw-data-table-sort-trigger--active": Boolean(state()) }}
          onClick={() => context.cycleSort(props.id)}
          aria-label={`Sort by ${String(props.children)}`}
        >
          <span class="pw-data-table-column-text">{props.children}</span>
          <Show when={state()}>
            {(direction) =>
              direction() === "ascending" ? (
                <ArrowUp size={13} aria-hidden />
              ) : (
                <ArrowDown size={13} aria-hidden />
              )
            }
          </Show>
        </button>
      </Show>
      <Show when={showResizer()}>
        <DataTableColumnResizer
          id={props.id}
          label={label()}
          minWidth={props.minWidth ?? DATA_TABLE_MIN_COLUMN_WIDTH}
          maxWidth={props.maxWidth ?? DATA_TABLE_MAX_COLUMN_WIDTH}
        />
      </Show>
    </th>
  );
}

/** The header divider: drag, arrow keys (16px; Shift 64px), Home/End for the limits, double-click to reset. */
function DataTableColumnResizer(props: { id: string; label: string; minWidth: number; maxWidth: number }) {
  const context = useDataTable("ColumnHeader");
  const width = () => context.columnWidths()[props.id] ?? 0;
  let cancelResize: VoidFunction | undefined;
  onCleanup(() => cancelResize?.());

  const beginResize = (event: PointerEvent) => {
    if (event.button !== 0 || cancelResize) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const start = width();
    let moved = false;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(pointerId);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) document.documentElement.dataset.columnResizing = "";
      moved = true;
      context.setColumnWidth(props.id, start + dx);
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      handle.removeEventListener("keydown", escape);
      cancelResize = undefined;
      delete document.documentElement.dataset.columnResizing;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (!moved) return;
      if (commit) context.persistColumnWidths();
      else context.setColumnWidth(props.id, start);
    };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(true); };
    const cancel = () => finish(false);
    const escape = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault();
      next.stopPropagation();
      finish(false);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.addEventListener("keydown", escape);
    cancelResize = cancel;
  };

  const resizeByKey = (event: KeyboardEvent) => {
    if (cancelResize || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "ArrowLeft" ? width() - step
      : event.key === "ArrowRight" ? width() + step
        : event.key === "Home" ? 0
          : event.key === "End" ? Number.POSITIVE_INFINITY
          : undefined;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    context.setColumnWidth(props.id, next);
    context.persistColumnWidths();
  };

  return (
    <div
      class="pw-data-table-column-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${props.label}`}
      aria-valuenow={width()}
      aria-valuemin={props.minWidth}
      aria-valuemax={props.maxWidth}
      tabIndex={0}
      onPointerDown={beginResize}
      onKeyDown={resizeByKey}
      onClick={(event) => event.stopPropagation()}
      onDblClick={() => context.resetColumnWidth(props.id)}
    />
  );
}

function DataTableBody<T = any>(props: {
  children: (row: T, index: Accessor<number>) => JSX.Element;
  class?: string;
}) {
  const context = useDataTable<T>("Body");
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    get count() {
      return context.rows().length;
    },
    // Solid refs run while template nodes still belong to an inert document.
    // Attach after mount so Virtualizer captures the real window and observers.
    getScrollElement: () => mounted() ? context.scrollElement() : null,
    estimateSize: context.estimateRowHeight,
    get overscan() { return context.overscan(); },
    get getItemKey() {
      const rows = context.rows();
      return (index: number) => rows[index]?.id ?? index;
    },
  });
  const virtualItems = () => virtualizer.getVirtualItems();
  // Key the DOM by source entry, not the adapter's mutable measurement objects.
  // A range update must not recreate overlapping rows or their focused controls.
  const rowsById = createMemo(() => new Map(context.rows().map(entry => [entry.id, entry])));
  const rowIndices = createMemo(() => new Map(context.rows().map((entry, index) => [entry.id, index])));
  // The virtualizer can briefly report indices past a shrunken row list (e.g. after a filter change).
  const virtualRowIds = createMemo(() => virtualItems().flatMap(item => {
    const entry = context.rows()[item.index];
    return entry ? [entry.id] : [];
  }));
  const topSpacer = () => virtualItems()[0]?.start ?? 0;
  const bottomSpacer = () => {
    const last = virtualItems().at(-1);
    return last ? Math.max(0, virtualizer.getTotalSize() - last.end) : 0;
  };
  const renderEntry = (entry: IndexedRow<T>, index: Accessor<number>) => (
    <DataTableRowIndexContext.Provider value={index}>
      {props.children(entry.row, index)}
    </DataTableRowIndexContext.Provider>
  );

  return (
    <tbody class={props.class}>
      <Show when={context.rows().length > 0}>
        <Show
          when={context.virtualized()}
          fallback={
            <For each={context.rows()}>
              {(entry, index) => renderEntry(entry, index)}
            </For>
          }
        >
          <Show when={topSpacer() > 0}>
            <tr aria-hidden="true" class="pw-data-table-spacer">
              <td colspan={context.columnCount()} style={{ height: `${topSpacer()}px` }} />
            </tr>
          </Show>
          <For each={virtualRowIds()}>
            {id => <Show keyed when={rowsById().get(id)}>
              {entry => renderEntry(entry, () => rowIndices().get(id)!)}
            </Show>}
          </For>
          <Show when={bottomSpacer() > 0}>
            <tr aria-hidden="true" class="pw-data-table-spacer">
              <td colspan={context.columnCount()} style={{ height: `${bottomSpacer()}px` }} />
            </tr>
          </Show>
        </Show>
      </Show>
    </tbody>
  );
}

export function isDataTableInteractiveTarget(
  target: EventTarget | null,
  row: HTMLTableRowElement,
): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(
    "button, a, input, select, textarea, summary, [role='button'], [role='link'], [data-row-action]",
  );
  return Boolean(interactive && interactive !== row);
}

export function isDataTableActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

export function hasDataTablePrimaryLeading(leading: JSX.Element): boolean {
  return Boolean(leading);
}

export function shouldRenderDataTableEmpty(rowCount: number): boolean {
  return rowCount === 0;
}

function DataTableRow<T = any>(props: {
  row: T;
  index?: number;
  rowId?: string;
  children: JSX.Element;
  onActivate?: (row: T) => void;
  onContextMenu?: (event: MouseEvent, row: T) => void;
  "aria-label"?: string;
  class?: string;
}) {
  const context = useDataTable("Row");
  const designSystem = useDesignSystem();
  const rowId = () => props.rowId ?? defaultRowId(props.row, props.index ?? 0);
  const selected = () => context.selectedRowIds().has(rowId());
  const active = () => context.activeEnabled() && context.activeRowId() === rowId();
  const interactive = () => Boolean(props.onActivate) || context.activeEnabled();
  const activate = () => {
    if (context.activeEnabled()) context.activateRow(rowId());
    props.onActivate?.(props.row);
  };
  // Only rows a click can land on join the highlight.
  const highlight = useContext(DataTableHoverContext);
  const bodyIndex = useContext(DataTableRowIndexContext);
  let rowElement: HTMLTableRowElement | undefined;
  onMount(() => {
    const element = rowElement;
    if (!highlight || !bodyIndex || !element) return;
    createEffect(() => {
      // Geometry is only needed for a visible hover/focus/active marker. A scroll
      // with no marker must not attach row observers or force layout reads.
      if (!interactive() || (!highlight.enabled() && !active())) return;
      onCleanup(highlight.hover.registerItem(bodyIndex(), element));
    });
  });

  return (
    <tr
      ref={rowElement}
      class={`pw-data-table-row ${props.class ?? ""}`}
      classList={{
        "pw-data-table-row--interactive": interactive(),
        "pw-data-table-row--selected": selected(),
        "pw-data-table-row--active": active(),
      }}
      data-row-id={rowId()}
      data-detail-opener={interactive() ? "" : undefined}
      aria-selected={context.selectable() ? selected() : undefined}
      aria-current={active() ? "true" : undefined}
      aria-label={props["aria-label"]}
      tabIndex={interactive() ? 0 : undefined}
      onContextMenu={(event) => props.onContextMenu?.(event, props.row)}
      onClick={(event) => {
        if (!interactive() || isDataTableInteractiveTarget(event.target, event.currentTarget)) return;
        activate();
      }}
      onDblClick={(event) => {
        if (!interactive() || isDataTableInteractiveTarget(event.target, event.currentTarget)) return;
        activate();
        designSystem.expandDetail();
      }}
      onKeyDown={(event) => {
        if (!interactive() || event.target !== event.currentTarget) return;
        if (isDataTableActivationKey(event.key)) {
          event.preventDefault();
          activate();
        }
      }}
    >
      {props.children}
    </tr>
  );
}

function DataTableCell(props: {
  children?: JSX.Element;
  class?: string;
  align?: "left" | "center" | "right";
  colspan?: number;
  /** Multi-line content keeps wrapping instead of truncating with a fade. */
  wrap?: boolean;
  onClick?: JSX.EventHandlerUnion<HTMLTableCellElement, MouseEvent>;
  leading?: JSX.Element;
}) {
  // A cell truncates when its column resizes; the header at the same index says so.
  const [truncate, setTruncate] = createSignal(false);
  let cell: HTMLTableCellElement | undefined;
  onMount(() => {
    if (!cell || props.wrap || (props.colspan ?? 1) > 1) return;
    const header = cell.closest("table")?.tHead?.rows[0]?.cells[cell.cellIndex];
    setTruncate(header?.dataset.truncate === "true");
  });
  return (
    <td
      ref={cell}
      class={`pw-data-table-cell pw-data-table-align-${props.align ?? "left"} ${props.class ?? ""}`}
      colspan={props.colspan}
      onClick={props.onClick}
    >
      <Show
        when={props.leading}
        fallback={
          <span class={truncate() ? "pw-data-table-cell-text pw-inline-fade" : "pw-data-table-cell-content"}>
            {props.children}
          </span>
        }
      >
        {(leading) => (
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="shrink-0">{leading()}</span>
            <span class={truncate() ? "pw-data-table-cell-text pw-inline-fade" : "pw-data-table-cell-content"}>
              {props.children}
            </span>
          </div>
        )}
      </Show>
    </td>
  );
}

export type DataTablePrimaryCellProps = {
  title: JSX.Element;
  trailing?: JSX.Element;
  class?: string;
  /** Seeds the icon tile's finish; pass the row's id so the tile keeps its look. */
  iconSeed?: string;
} & (
  | {
      icon: JSX.Element;
      iconTone: IconTileTone;
      iconBrand?: string | readonly string[];
      leading?: never;
    }
  | {
      icon?: never;
      iconTone?: never;
      iconBrand?: never;
      leading?: JSX.Element;
    }
);

function DataTablePrimaryCell(props: DataTablePrimaryCellProps) {
  // JSX slots can be getters that construct components. Resolve them once per
  // change, so checking presence and rendering do not construct the icon twice.
  const leading = createMemo(() => {
    const icon = props.icon;
    return icon ? (
      <IconTile size={24} tone={props.iconTone} brand={props.iconBrand} seed={props.iconSeed}>
        {icon}
      </IconTile>
    ) : props.leading;
  });
  return (
    <td class={`pw-data-table-cell pw-data-table-primary-cell ${props.class ?? ""}`}>
      <div class="pw-data-table-primary">
        <Show when={hasDataTablePrimaryLeading(leading())}>
          <span class="pw-data-table-primary-leading" aria-hidden>
            {leading()}
          </span>
        </Show>
        <span class="pw-data-table-primary-title pw-inline-fade">{props.title}</span>
        <Show when={props.trailing}>
          <span class="pw-data-table-primary-trailing">{props.trailing}</span>
        </Show>
      </div>
    </td>
  );
}

function DataTableSelectionCell(props: {
  rowId?: string;
  label?: string;
  class?: string;
}) {
  const context = useDataTable("SelectionCell");
  let input: HTMLInputElement | undefined;
  const header = () => props.rowId === undefined;
  const checked = () =>
    header() ? context.allVisibleSelected() : context.selectedRowIds().has(props.rowId!);
  createEffect(() => {
    const indeterminate = header() && context.someVisibleSelected();
    if (input) input.indeterminate = indeterminate;
  });

  return (
    <Show when={context.selectable()}>
      <Show
        when={header()}
        fallback={
          <td class={`pw-data-table-selection-cell ${props.class ?? ""}`}>
            <input
              ref={(el) => { input = el; }}
              class="pw-data-table-selection-input"
              type="checkbox"
              checked={checked()}
              aria-label={props.label ?? `Select row ${props.rowId}`}
              onClick={(event) => event.stopPropagation()}
              onChange={() => context.toggleRow(props.rowId!)}
            />
          </td>
        }
      >
        <th
          class={`pw-data-table-selection-header ${props.class ?? ""}`}
          scope="col"
          aria-label={context.selectionMode() === "single" ? "Selection" : undefined}
        >
          <Show when={context.selectionMode() === "multiple"}>
            <input
              ref={(el) => { input = el; }}
              class="pw-data-table-selection-input"
              type="checkbox"
              checked={checked()}
              aria-label={props.label ?? "Select all visible rows"}
              onChange={() => context.toggleAll()}
            />
          </Show>
        </th>
      </Show>
    </Show>
  );
}

/** Native binary checkbox for dense rows; no per-row form state machine. */
function DataTableCheckbox(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label": string;
  disabled?: boolean;
}) {
  return <input
    type="checkbox"
    class="pw-data-table-selection-input pw-data-table-checkbox"
    checked={props.checked}
    disabled={props.disabled}
    aria-label={props["aria-label"]}
    onClick={event => event.stopPropagation()}
    onChange={event => props.onCheckedChange(event.currentTarget.checked)}
  />;
}

function DataTableSelectionToolbar<T = any>(
  props: DataTableSelectionToolbarProps<T>,
) {
  const context = useDataTable<T>("SelectionToolbar");
  const host = useContext(DataTableSelectionToolbarHostContext);
  const state: DataTableSelectionToolbarState<T> = {
    selectedRows: () => context.selectedRows().map((entry) => entry.row),
    selectedRowIds: context.selectedRowIds,
    selectedCount: () => context.selectedRows().length,
    clearSelection: context.clearSelection,
  };

  const hasActions = () =>
    props.hasActions instanceof Function
      ? props.hasActions(state)
      : props.hasActions !== false;

  const toolbar = () => (
    <Show when={state.selectedCount() > 0}>
      <div
        class={`pw-data-table-selection-toolbar surface-panel-float ${props.class ?? ""}`}
        role="toolbar"
        aria-label="Selected row actions"
      >
        <span class="pw-data-table-selection-summary" aria-live="polite">
          {state.selectedCount()} selected
        </span>
        <span class="pw-data-table-selection-actions">
          <Show
            when={hasActions()}
            fallback={
              <span class="pw-data-table-selection-empty-actions">
                {props.emptyActionsLabel ?? "No shared actions"}
              </span>
            }
          >
            {props.children(state)}
          </Show>
        </span>
        <button
          type="button"
          class="pw-data-table-selection-clear"
          aria-label="Clear selection"
          title="Clear selection"
          onClick={state.clearSelection}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </Show>
  );

  return (
    <Show
      when={host?.()}
      fallback={<div class="pw-data-table-selection-toolbar-inline">{toolbar()}</div>}
    >
      {(mount) => <Portal mount={mount()}>{toolbar()}</Portal>}
    </Show>
  );
}

function DataTableEmpty(props: { children: JSX.Element; class?: string; colspan?: number }) {
  const context = useDataTable("Empty");
  return (
    <Show when={shouldRenderDataTableEmpty(context.rows().length)}>
      <tbody>
        <tr>
          <td
            colspan={props.colspan ?? Math.max(1, context.columnCount())}
            class={`pw-data-table-empty ${props.class ?? ""}`}
          >
            {props.children}
          </td>
        </tr>
      </tbody>
    </Show>
  );
}

function DataTableFooter(props: { children: JSX.Element; class?: string }) {
  return <div class={`pw-data-table-footer ${props.class ?? ""}`}>{props.children}</div>;
}

export const DataTable = {
  Root: DataTableRoot,
  Toolbar: DataTableToolbar,
  Table: DataTableTable,
  Header: DataTableHeader,
  ColumnHeader: DataTableColumnHeader,
  Body: DataTableBody,
  Row: DataTableRow,
  Cell: DataTableCell,
  PrimaryCell: DataTablePrimaryCell,
  SelectionCell: DataTableSelectionCell,
  Checkbox: DataTableCheckbox,
  SelectionToolbar: DataTableSelectionToolbar,
  Empty: DataTableEmpty,
  Footer: DataTableFooter,
};
