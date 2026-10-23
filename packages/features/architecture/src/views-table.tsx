import { DataTable, Eye, PageContent } from "@polterware/frontend-design-system";
import type { ArchViewCard } from "./extra-fixtures";
import type { ArchitectureViewTemplate } from "./create-templates";
import { ArchitectureViewsEmpty, architectureFilterEmpty } from "./architecture-empty";

function updatedAgeInMinutes(value: string): number {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return Number.MAX_SAFE_INTEGER;
  if (value.includes("d")) return amount * 24 * 60;
  if (value.includes("h")) return amount * 60;
  return amount;
}

export function ViewsTable(props: {
  views: ArchViewCard[];
  sourceCount?: number;
  dataSource?: string;
  activeRowId?: string | null;
  onActivate?: (id: string) => void;
  onCreateView?: () => void;
  onCreateFromTemplate?: (template: ArchitectureViewTemplate) => void;
}) {
  const sourceCount = () => props.sourceCount ?? props.views.length;

  return (
    <div class="flex h-full min-h-0 flex-col">
      <PageContent class="p-0">
        {sourceCount() === 0 ? (
          <ArchitectureViewsEmpty
            onCreateView={props.onCreateView}
            onCreateFromTemplate={props.onCreateFromTemplate}
          />
        ) : props.views.length === 0 ? (
          architectureFilterEmpty("views")
        ) : (
          <DataTable.Root
            rows={props.views}
            getRowId={(view) => view.id}
            columnWidthsKey="atlas-views"
            activeRowId={props.activeRowId}
            activateFirstRow
            onActiveRowChange={(id) => {
              if (id) props.onActivate?.(id);
            }}
          >
            <DataTable.Table aria-label="Saved architecture views">
              <DataTable.Header>
                <DataTable.ColumnHeader<ArchViewCard> id="name" sortBy={(view) => view.name}>
                  View
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader<ArchViewCard>
                  id="nodeCount"
                  sortBy={(view) => view.nodeCount}
                >
                  Nodes
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader<ArchViewCard>
                  id="updated"
                  sortBy={(view) => updatedAgeInMinutes(view.updated)}
                >
                  Updated
                </DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<ArchViewCard>>
                {(view) => (
                  <DataTable.Row
                    row={view}
                    rowId={view.id}
                    onActivate={() => props.onActivate?.(view.id)}
                    aria-label={`Open ${view.name}`}
                  >
                    <DataTable.PrimaryCell icon={<Eye size={16} />} iconTone="architecture" iconSeed={view.id} title={view.name} />
                    <DataTable.Cell>{view.nodeCount}</DataTable.Cell>
                    <DataTable.Cell class="text-[var(--color-text-muted)]">{view.updated}</DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        )}
      </PageContent>
    </div>
  );
}
