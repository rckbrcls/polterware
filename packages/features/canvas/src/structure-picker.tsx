import { Show, createMemo, createSignal } from "solid-js";
import { A11yDialog, Button, DataTable, Input } from "@polterware/frontend-design-system";
import { structureEntities } from "./types/architecture";
import type { StoreEntity } from "./references";

export function StructurePicker(props: { open: boolean; entities: readonly StoreEntity[]; onClose: () => void; onAdd: (entity: StoreEntity) => void }) {
  const [search, setSearch] = createSignal("");
  const matches = createMemo(() => structureEntities(props.entities).filter((entity) => `${entity.title} ${entity.level}`.toLowerCase().includes(search().toLowerCase())));
  return <A11yDialog open={props.open} title="Add from Structure" onClose={props.onClose} footer={<Button variant="ghost" onClick={props.onClose}>Close</Button>}>
    <p class="mb-3 text-sm text-[var(--color-text-muted)]">Add a referenced shape from the loaded workspace. This changes only this canvas.</p>
    <Input aria-label="Search Structure" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
    <DataTable.Root rows={matches()} getRowId={(entity) => entity.id}>
      <DataTable.Table aria-label="Structure nodes">
        <DataTable.Header><DataTable.ColumnHeader id="title">Node</DataTable.ColumnHeader><DataTable.ColumnHeader id="level">Level</DataTable.ColumnHeader></DataTable.Header>
        <DataTable.Body>{(entity) => <DataTable.Row row={entity} rowId={entity.id} aria-label={`Add ${entity.level}: ${entity.title}`} onActivate={() => props.onAdd(entity)}>
          <DataTable.Cell>{entity.title}</DataTable.Cell><DataTable.Cell>{entity.level}</DataTable.Cell>
        </DataTable.Row>}</DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
    <Show when={!matches().length}><p role="status" class="mt-3 text-sm text-[var(--color-text-muted)]">No matching system, domain or component nodes in the loaded workspace.</p></Show>
  </A11yDialog>;
}
