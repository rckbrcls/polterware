import { Show } from "solid-js";
import { DataTable, FileText, Scale, StatusChip } from "@polterware/frontend-design-system";
import type { LibraryRow } from "./library-row";

function categoryIcon(row: LibraryRow) {
  return row.pinned ? <Scale size={16} /> : <FileText size={16} />;
}

export function LibraryTable(props: {
  rows: LibraryRow[];
  activeRowId?: string | null;
  onActivate: (row: LibraryRow) => void;
}) {
  return (
    <DataTable.Root
      rows={props.rows}
      getRowId={(item) => item.id}
      columnWidthsKey="knowledge-library"
      activeRowId={props.activeRowId ?? null}
      activateFirstRow
      onActiveRowChange={(id) => {
        if (!id) return;
        const row = props.rows.find((item) => item.id === id);
        if (row) props.onActivate(row);
      }}
    >
      <DataTable.Table aria-label="Library">
        <DataTable.Header>
          <DataTable.ColumnHeader<LibraryRow> id="title">Title</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="category">Category</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="statusLabel">Status</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="meta">Meta</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="updatedAt">Updated</DataTable.ColumnHeader>
        </DataTable.Header>
        <DataTable.Body<LibraryRow>>
          {(item) => (
            <DataTable.Row row={item} rowId={item.id} onActivate={() => props.onActivate(item)}>
              <DataTable.PrimaryCell
                icon={categoryIcon(item)}
                iconTone="knowledge"
                iconSeed={item.id}
                title={item.title}
              />
              <DataTable.Cell>{item.categoryLabel}</DataTable.Cell>
              <DataTable.Cell>
                <Show when={item.statusLabel}>
                  <StatusChip tone={item.statusTone} label={item.statusLabel} />
                </Show>
              </DataTable.Cell>
              <DataTable.Cell>{item.meta}</DataTable.Cell>
              <DataTable.Cell class="text-[var(--color-text-muted)]">{item.updatedAt}</DataTable.Cell>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  );
}
