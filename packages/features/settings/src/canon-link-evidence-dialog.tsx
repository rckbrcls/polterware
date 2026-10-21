import { Show, createSignal } from "solid-js";
import {
  A11yDialog,
  Button,
  DataTable,
  Field,
  Input,
  PageEmpty,
  StatusChip, FormStack } from "@polterware/frontend-design-system";
import type { CanonEvidenceRow } from "./canon-facts-types";

export function CanonLinkEvidenceDialog(props: {
  open: boolean;
  evidence: CanonEvidenceRow[];
  linkedIds: string[];
  busy: boolean;
  onClose: () => void;
  onLink: (evidenceId: string) => void;
}) {
  const [filter, setFilter] = createSignal("");
  const available = () => {
    const linked = new Set(props.linkedIds);
    const query = filter().trim().toLowerCase();
    return props.evidence.filter((item) => {
      if (linked.has(item.id)) return false;
      if (!query) return true;
      return (
        item.summary.toLowerCase().includes(query)
        || item.id.toLowerCase().includes(query)
        || item.path.toLowerCase().includes(query)
      );
    });
  };

  return (
    <A11yDialog
      open={props.open}
      title="Link evidence"
      description="Pick existing project evidence to support the selected fact."
      size="lg"
      onClose={() => props.onClose()}
      footer={
        <Button size="sm" variant="ghost" onClick={() => props.onClose()}>
          Close
        </Button>
      }
    >
      <FormStack>
        <Field label="Filter">
          <Input
            value={filter()}
            placeholder="Search summary, id, or path"
            onInput={(event) => setFilter(event.currentTarget.value)}
          />
        </Field>
        <div class="max-h-80 overflow-auto rounded-[var(--radius-card)] border border-[var(--color-border-subtle)]">
          <DataTable.Root rows={available()} getRowId={(row) => row.id}>
            <DataTable.Table aria-label="Available evidence">
              <DataTable.Header>
                <DataTable.ColumnHeader id="summary" sortBy={(row) => row.summary}>
                  Evidence
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="kind" sortBy={(row) => row.kind}>
                  Kind
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="action" resizable={false}>Action</DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body>
                {(row) => (
                  <DataTable.Row row={row}>
                    <DataTable.Cell>
                      <div class="font-medium">{row.summary || row.id}</div>
                      <div class="mt-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                        {row.id}
                        {row.path ? ` · ${row.path}` : ""}
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <StatusChip tone="muted" label={row.kind || "other"} />
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={props.busy}
                        onClick={() => props.onLink(row.id)}
                      >
                        Link
                      </Button>
                    </DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
              <DataTable.Empty>
                <PageEmpty
                  title="No evidence to link"
                  description="Create evidence first, or all project evidence is already linked."
                />
              </DataTable.Empty>
            </DataTable.Table>
          </DataTable.Root>
        </div>
        <Show when={available().length === 0 && props.evidence.length > 0}>
          <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
            All listed evidence is already linked or filtered out.
          </p>
        </Show>
      </FormStack>
    </A11yDialog>
  );
}
