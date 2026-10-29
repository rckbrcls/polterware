import { createSignal } from "solid-js";
import { Button } from "./button";
import { FileText } from "./hugeicons";
import { StatusChip } from "./status";
import { DataTable, DataTableSelectionToolbarHost, type DataTableSelectionState } from "./table";
import type { DocEntry } from "./docs/types";

const rows = [
  { id: "context", name: "Context compiler", state: "Build" },
  { id: "import", name: "Source import", state: "Verify" },
  { id: "history", name: "Change history", state: "Delivered" },
];
type Row = (typeof rows)[number];

function Selection() {
  const [selected, setSelected] = createSignal<DataTableSelectionState>(new Set());
  const [message, setMessage] = createSignal("Select rows to see shared actions.");
  return (
    // #region selection
    <DataTableSelectionToolbarHost>
      <DataTable.Root
        rows={rows}
        selectionMode="multiple"
        selectedRowIds={selected()}
        onSelectionChange={setSelected}
      >
        <DataTable.Table aria-label="Select work cards">
          <DataTable.Header>
            <DataTable.SelectionCell />
            <DataTable.ColumnHeader id="name">Name</DataTable.ColumnHeader>
            <DataTable.ColumnHeader id="state">Stage</DataTable.ColumnHeader>
          </DataTable.Header>
          <DataTable.Body<Row>>
            {(row) => (
              <DataTable.Row row={row}>
                <DataTable.SelectionCell rowId={row.id} label={`Select ${row.name}`} />
                <DataTable.PrimaryCell title={row.name} />
                <DataTable.Cell>{row.state}</DataTable.Cell>
              </DataTable.Row>
            )}
          </DataTable.Body>
        </DataTable.Table>
        <DataTable.SelectionToolbar<Row>>
          {(selection) => (
            <Button size="sm" onClick={() => {
              setMessage(`Reviewed ${selection.selectedRows().map((row) => row.name).join(", ")}.`);
              selection.clearSelection();
            }}>
              Mark reviewed
            </Button>
          )}
        </DataTable.SelectionToolbar>
        <DataTable.Footer><span aria-live="polite">{message()}</span></DataTable.Footer>
      </DataTable.Root>
    </DataTableSelectionToolbarHost>
    // #endregion
  );
}

function Grouped() {
  const [added, setAdded] = createSignal("Hover a group header for its +.");
  const stages = ["Build", "Verify", "Delivered"];
  return (
    // #region grouped
    <DataTable.Root
      rows={rows}
      density="list"
      grouping={{
        by: (row: Row) => row.state,
        groups: stages.map((stage) => ({ id: stage, label: stage, onAdd: () => setAdded(`Add a card in ${stage}.`) })),
      }}
    >
      <DataTable.Table aria-label="Work cards by stage">
        <DataTable.Header>
          <DataTable.ColumnHeader id="name">Name</DataTable.ColumnHeader>
          <DataTable.ColumnHeader id="state">Stage</DataTable.ColumnHeader>
        </DataTable.Header>
        <DataTable.Body<Row>>
          {(row) => (
            <DataTable.Row row={row} onActivate={() => setAdded(`Open ${row.name}.`)}>
              <DataTable.PrimaryCell icon={<FileText size={16} />} iconTone="knowledge" title={row.name} />
              <DataTable.Cell>{row.state}</DataTable.Cell>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
      <DataTable.Footer><span aria-live="polite">{added()}</span></DataTable.Footer>
    </DataTable.Root>
    // #endregion
  );
}

function Checkboxes() {
  const [checked, setChecked] = createSignal(false);
  return (
    // #region checkboxes
    <div class="flex items-center gap-3">
      <DataTable.Checkbox checked={checked()} onCheckedChange={setChecked} aria-label="Reviewed" />
      <span>Reviewed: {checked() ? "Yes" : "No"}</span>
      <DataTable.Checkbox checked disabled onCheckedChange={() => {}} aria-label="Locked review" />
    </div>
    // #endregion
  );
}

export default {
  name: "DataTable",
  group: "Data",
  summary:
    "Compound operational table with sortable, resizable columns and optional row selection. Primary cells provide entity identity, and the selection toolbar can render in a shared host outside the table.",
  exports: ["DataTable", "DataTableSelectionToolbarHost", "focusDataTableRow"],
  examples: [
    { id: "grouped", title: "List rows in collapsible groups", wide: true, render: () => <Grouped /> },
    {
      id: "default",
      title: "Sortable columns and primary cells",
      wide: true,
      render: () => (
        // #region default
        <DataTable.Root rows={rows} defaultSort={{ columnId: "name", direction: "ascending" }}>
          <DataTable.Toolbar><span>3 work cards</span></DataTable.Toolbar>
          <DataTable.Table aria-label="Work cards">
            <DataTable.Header>
              <DataTable.ColumnHeader id="name">Name</DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="state">Stage</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body<Row>>
              {(row) => (
                <DataTable.Row row={row}>
                  <DataTable.PrimaryCell title={row.name} icon={<FileText size={14} />} iconTone="neutral" iconSeed={row.id} />
                  <DataTable.Cell><StatusChip tone="muted" label={row.state} /></DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
          <DataTable.Footer>Click a column heading to cycle the sort order.</DataTable.Footer>
        </DataTable.Root>
        // #endregion
      ),
    },
    {
      id: "selection",
      title: "Controlled selection and shared toolbar host",
      wide: true,
      render: () => <Selection />,
    },
    {
      id: "empty",
      title: "Empty table",
      wide: true,
      render: () => (
        // #region empty
        <DataTable.Root rows={[]}>
          <DataTable.Table aria-label="Filtered work cards">
            <DataTable.Header>
              <DataTable.ColumnHeader id="name" sortable={false}>Name</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Empty>No work cards match these filters.</DataTable.Empty>
          </DataTable.Table>
        </DataTable.Root>
        // #endregion
      ),
    },
    {
      id: "checkboxes",
      title: "Dense checkbox and disabled state",
      render: () => <Checkboxes />,
    },
  ],
} satisfies DocEntry;
