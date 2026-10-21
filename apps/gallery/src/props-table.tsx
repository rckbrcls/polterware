import { For, Show } from "solid-js";
import { DataTable } from "@polterware/frontend-design-system";
import type { PropRow, PropsDoc } from "./docs-registry";

function Table(props: { rows: PropRow[] }) {
  return <DataTable.Root rows={props.rows} getRowId={row => row.name}>
    <DataTable.Table>
      <DataTable.Header>
        <DataTable.ColumnHeader id="name">Prop</DataTable.ColumnHeader>
        <DataTable.ColumnHeader id="type">Type</DataTable.ColumnHeader>
        <DataTable.ColumnHeader id="default">Default</DataTable.ColumnHeader>
        <DataTable.ColumnHeader id="description">Description</DataTable.ColumnHeader>
      </DataTable.Header>
      <DataTable.Body>{row => <DataTable.Row row={row}>
        <DataTable.Cell><code class="docs-code-inline">{row.name}{row.required ? "" : "?"}</code></DataTable.Cell>
        <DataTable.Cell><code class="docs-code-inline">{row.type}</code></DataTable.Cell>
        <DataTable.Cell>{row.default ?? "—"}</DataTable.Cell>
        <DataTable.Cell>{row.description ?? ""}</DataTable.Cell>
      </DataTable.Row>}</DataTable.Body>
    </DataTable.Table>
  </DataTable.Root>;
}

export function PropsTable(props: { exportName: string; doc: PropsDoc }) {
  return <section class="docs-props" aria-label={`${props.exportName} props`}>
    <h3>{props.exportName}</h3>
    <Show when={props.doc.extends?.length}>
      <p class="docs-muted">Also accepts <For each={props.doc.extends}>{(name, index) => <>{index() > 0 ? ", " : ""}<code class="docs-code-inline">{name}</code></>}</For>.</p>
    </Show>
    <Show when={props.doc.props.length} fallback={<p class="docs-muted">No documented props.</p>}>
      <Table rows={props.doc.props} />
    </Show>
  </section>;
}
