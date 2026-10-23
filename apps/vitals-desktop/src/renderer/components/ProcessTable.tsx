import { ContextMenu, Copy, DataTable, pushToast, SquareTerminal, Stop } from "@polterware/frontend-design-system";
import { createSignal } from "solid-js";
import type { ProcessRow } from "../api";

type ProcessMenu = { row: ProcessRow; x: number; y: number };

export function ProcessTable(props: { rows: ProcessRow[]; onKill: (pid: number) => void }) {
  const [menu, setMenu] = createSignal<ProcessMenu | null>(null);

  // One delegated listener: the row under the pointer names the process the menu acts on.
  const openMenu = (event: MouseEvent) => {
    const rowId = (event.target as Element | null)?.closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId;
    const row = rowId ? props.rows.find((candidate) => String(candidate.pid) === rowId) : undefined;
    if (!row) return;
    event.preventDefault();
    setMenu({ row, x: event.clientX, y: event.clientY });
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => pushToast(`${label} copied`),
      () => pushToast(`Failed to copy ${label.toLowerCase()}`, "danger"),
    );
  };

  return (
    <div class="vitals-process-table" onContextMenu={openMenu}>
      <DataTable.Root
        rows={props.rows}
        getRowId={(row) => String(row.pid)}
        defaultSort={{ columnId: "cpu", direction: "descending" }}
        virtualized={false}
        estimateRowHeight={34}
        columnWidthsKey="processes"
      >
        <DataTable.Table aria-label="Processes">
          <DataTable.Header>
            <DataTable.ColumnHeader<ProcessRow> id="pid" sortBy={(row) => row.pid} width="72px">
              PID
            </DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ProcessRow> id="user" sortBy={(row) => row.user}>
              User
            </DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ProcessRow> id="cpu" sortBy={(row) => row.cpuPercent} width="88px">
              CPU %
            </DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ProcessRow> id="mem" sortBy={(row) => row.memPercent} width="88px">
              MEM %
            </DataTable.ColumnHeader>
            <DataTable.ColumnHeader<ProcessRow> id="command" sortBy={(row) => row.command}>
              Command
            </DataTable.ColumnHeader>
          </DataTable.Header>
          <DataTable.Body<ProcessRow>>
            {(row) => (
              <DataTable.Row row={row} rowId={String(row.pid)} class={menu()?.row.pid === row.pid ? "vitals-process-row--menu" : undefined}>
                <DataTable.Cell>{row.pid}</DataTable.Cell>
                <DataTable.Cell>{row.user}</DataTable.Cell>
                <DataTable.Cell>{row.cpuPercent.toFixed(1)}</DataTable.Cell>
                <DataTable.Cell>{row.memPercent.toFixed(1)}</DataTable.Cell>
                <DataTable.Cell>{row.command}</DataTable.Cell>
              </DataTable.Row>
            )}
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
      <ContextMenu.Root
        open={menu() !== null}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        anchorPoint={menu()}
      >
        <ContextMenu.Content>
          <ContextMenu.Item value="copy-pid" onSelect={() => { const target = menu(); if (target) copy(String(target.row.pid), "PID"); }}>
            <Copy size={14} aria-hidden />
            Copy PID
          </ContextMenu.Item>
          <ContextMenu.Item value="copy-command" onSelect={() => { const target = menu(); if (target) copy(target.row.command, "Command"); }}>
            <SquareTerminal size={14} aria-hidden />
            Copy command
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item value="kill" danger onSelect={() => { const target = menu(); if (target) props.onKill(target.row.pid); }}>
            <Stop size={14} aria-hidden />
            Kill process
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </div>
  );
}
