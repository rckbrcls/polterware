import { For } from "solid-js";
import { DataTable, FileText, StatusChip } from "@polterware/frontend-design-system";
import type { WorkspaceEvidence } from "@polterware/feature-shell";

export function EvidenceTable(props: {
  rows: WorkspaceEvidence[];
  activeRowId?: string | null;
  onActivate: (id: string) => void;
}) {
  return (
    <DataTable.Root
      rows={props.rows}
      getRowId={(item) => item.id}
      columnWidthsKey="knowledge-evidence"
      activeRowId={props.activeRowId ?? null}
      activateFirstRow
      onActiveRowChange={(id) => id && props.onActivate(id)}
    >
      <DataTable.Table aria-label="Evidence">
        <DataTable.Header>
          <DataTable.ColumnHeader<WorkspaceEvidence> id="title">Title</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceEvidence> id="tags">Tags</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceEvidence> id="path">Path</DataTable.ColumnHeader>
          <DataTable.ColumnHeader<WorkspaceEvidence> id="updatedAt">Updated</DataTable.ColumnHeader>
        </DataTable.Header>
        <DataTable.Body<WorkspaceEvidence>>
          {(item) => (
            <DataTable.Row row={item} rowId={item.id} onActivate={() => props.onActivate(item.id)}>
              <DataTable.PrimaryCell icon={<FileText size={16} />} iconTone="knowledge" iconSeed={item.id} title={item.title} />
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
