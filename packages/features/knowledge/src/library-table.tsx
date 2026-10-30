import { Show } from "solid-js";
import { DataTable, FileText, Scale, StatusChip } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";
import { ContextChips } from "./context-chips";
import type { LibraryRow } from "./library-row";

function levelIcon(row: LibraryRow) {
  return row.pinned ? <Scale size={16} /> : <FileText size={16} />;
}

export function LibraryTable(props: {
  rows: LibraryRow[];
  /** Structure nodes, to name each row's Context. */
  nodes?: readonly ScopeNodeItem[];
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
          <DataTable.ColumnHeader<LibraryRow> id="context" sortable={false}>Context</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="statusLabel">Status</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<LibraryRow> id="updatedAt">Updated</DataTable.ColumnHeader>
        </DataTable.Header>
        <DataTable.Body<LibraryRow>>
          {(item) => (
            <DataTable.Row row={item} rowId={item.id} onActivate={() => props.onActivate(item)}>
              <DataTable.PrimaryCell
                icon={levelIcon(item)}
                iconTone="knowledge"
                iconSeed={item.id}
                title={item.title}
              />
              <DataTable.Cell><ContextChips ids={item.scopeNodeIds} nodes={props.nodes ?? []} /></DataTable.Cell>
              <DataTable.Cell>
                <Show when={item.statusLabel}>
                  <StatusChip tone={item.statusTone} label={item.statusLabel} />
                </Show>
              </DataTable.Cell>
              <DataTable.Cell class="text-[var(--color-text-muted)]">{item.updatedAt}</DataTable.Cell>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  );
}
