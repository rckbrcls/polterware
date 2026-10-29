import { For } from "solid-js";
import { DataTable, StatusChip } from "@polterware/frontend-design-system";
import type { WorkspaceDoc } from "@polterware/feature-shell";
import { docTypeIcon, docTypeLabel } from "./doc-type";

export function DocsTable(props: {
  rows: WorkspaceDoc[];
  activeRowId?: string | null;
  onActivate: (id: string) => void;
  /** Marks a row active without opening it, when J/K or a removed row moves the marker. */
  onFocusRow?: (id: string) => void;
}) {
  return (
    <DataTable.Root
      rows={props.rows}
      getRowId={(item) => item.id}
      columnWidthsKey="knowledge-docs"
      activeRowId={props.activeRowId ?? null}
      activateFirstRow
      onActiveRowChange={(id) => id && (props.onFocusRow ?? props.onActivate)(id)}
    >
      <DataTable.Table aria-label="Docs">
        <DataTable.Header>
          <DataTable.ColumnHeader<WorkspaceDoc> id="title">Title</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceDoc> id="docType" sortBy={(row) => row.docType}>Type</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceDoc> id="tags">Tags</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceDoc> id="path">Path</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceDoc> id="updatedAt">Updated</DataTable.ColumnHeader>
        </DataTable.Header>
        <DataTable.Body<WorkspaceDoc>>
          {(item) => (
            <DataTable.Row row={item} rowId={item.id} onActivate={() => props.onActivate(item.id)}>
              <DataTable.PrimaryCell icon={docTypeIcon(item.docType)} iconTone="knowledge" iconSeed={item.id} title={item.title} />
              <DataTable.Cell>{docTypeLabel(item.docType)}</DataTable.Cell>
              <DataTable.Cell>
                <div class="flex flex-wrap items-center gap-1">
                  <For each={item.tags}>{(tag) => <StatusChip tone="muted">{tag}</StatusChip>}</For>
                </div>
              </DataTable.Cell>
              <DataTable.Cell class="font-mono pw-selectable text-[12px] text-[var(--color-text-muted)]">
                {item.path || "—"}
              </DataTable.Cell>
              <DataTable.Cell class="text-[var(--color-text-muted)]">{item.updatedAt}</DataTable.Cell>
            </DataTable.Row>
          )}
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  );
}
