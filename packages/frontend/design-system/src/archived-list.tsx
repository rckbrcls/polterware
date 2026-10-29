import { Show, type JSX } from "solid-js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { PageEmpty } from "./feedback";
import { Archive, Delete, MoreHorizontal, Undo2 } from "./hugeicons";
import { DataTable } from "./table";

/** One archived row: the archive keeps it until it is restored or deleted. */
export type ArchivedListItem = {
  id: string;
  title: string;
  /** Short context such as the item's type or path. */
  detail?: string;
  /** Display date of the archive. */
  archivedAt: string;
};

/**
 * The archive of one surface. Each row offers Restore and Delete permanently;
 * deleting is the only way out of the archive that cannot be undone.
 */
export function ArchivedList(props: {
  items: ArchivedListItem[];
  /** Accessible name of the table, e.g. "Archived evidence". */
  label: string;
  icon?: JSX.Element;
  busy?: boolean;
  onRestore: (item: ArchivedListItem) => void;
  onDelete: (item: ArchivedListItem) => void;
}) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={<PageEmpty title="Nothing archived" mood="sleeping" />}
    >
      <DataTable.Root rows={props.items} getRowId={(item) => item.id} columnWidthsKey={`archived:${props.label}`}>
        <DataTable.Table aria-label={props.label}>
          <DataTable.Header>
            <DataTable.ColumnHeader<ArchivedListItem> id="title">Title</DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ArchivedListItem> id="detail">Type</DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ArchivedListItem> id="archivedAt">Archived</DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ArchivedListItem> id="actions" sortable={false}>
              <span class="sr-only">Actions</span>
            </DataTable.ColumnHeader>
          </DataTable.Header>
          <DataTable.Body<ArchivedListItem>>
            {(item) => (
              <DataTable.Row row={item} rowId={item.id}>
                <DataTable.PrimaryCell icon={props.icon ?? <Archive size={16} />} iconTone="neutral" iconSeed={item.id} title={item.title} />
                <DataTable.Cell class="text-[var(--color-text-muted)]">{item.detail || "—"}</DataTable.Cell>
                <DataTable.Cell class="text-[var(--color-text-muted)]">{item.archivedAt}</DataTable.Cell>
                <DataTable.Cell align="right" onClick={(event: MouseEvent) => event.stopPropagation()}>
                  <DropdownMenu positioning={{ placement: "bottom-end" }}>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${item.title}`}
                      disabled={props.busy}
                      class="h-7 w-7 shrink-0 justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <MoreHorizontal size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="min-w-44">
                      <DropdownMenuItem value="restore" onSelect={() => props.onRestore(item)}>
                        <Undo2 size={14} aria-hidden />
                        Restore
                      </DropdownMenuItem>
                      <DropdownMenuItem value="delete" danger onSelect={() => props.onDelete(item)}>
                        <Delete size={14} aria-hidden />
                        Delete permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </DataTable.Cell>
              </DataTable.Row>
            )}
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    </Show>
  );
}
