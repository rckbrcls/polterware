import { Show } from "solid-js";
import {
  Button,
  DataTable,
  DetailPanel,
  Eye,
  Package,
  PageError,
  PageLoading,
  FileText,
  Layers,
  ListFilter,
  Network,
  Settings,
  Tag,
} from "@polterware/frontend-design-system";
import type { ArchViewCard } from "./extra-fixtures";
import {
  emptyDescriptionCopy,
  hasEnvironments,
  hasMembershipList,
  hasTags,
  isDescriptionEmpty,
  membershipEmptyCopy,
  membershipRows,
} from "./view-detail-helpers";

export {
  emptyDescriptionCopy,
  hasEnvironments,
  hasMembershipList,
  hasTags,
  isDescriptionEmpty,
  isViewEnriched,
  membershipEmptyCopy,
  membershipRows,
} from "./view-detail-helpers";

function chips(values: readonly string[] | undefined) {
  return (values ?? []).map((value) => ({ id: value, title: value }));
}

export function ArchitectureViewDetail(props: {
  view: ArchViewCard | null | undefined;
  loading?: boolean;
  error?: string | null;
  notFound?: boolean;
  onOpen?: (viewId: string) => void;
  onEdit?: (view: ArchViewCard) => void;
  onDelete?: (view: ArchViewCard) => void;
  onOpenMember?: (memberId: string) => void;
}) {
  return (
    <DetailPanel.Content>
      <Show when={props.loading}>
        <DetailPanel.Header />
        <DetailPanel.Body>
          <DetailPanel.Main>
            <PageLoading layout="detail" label="Loading view…" />
          </DetailPanel.Main>
        </DetailPanel.Body>
      </Show>

      <Show when={!props.loading && (props.error || props.notFound || !props.view)}>
        <DetailPanel.Header />
        <DetailPanel.Body>
          <DetailPanel.Main>
            <PageError
              title={props.notFound || !props.view ? "View not found" : "Failed to load"}
              message={
                props.error ??
                "This architecture view is unavailable or was removed from the project."
              }
            />
          </DetailPanel.Main>
        </DetailPanel.Body>
      </Show>

      <Show when={!props.loading && props.view}>
        {(v) => {
          const members = () => membershipRows(v());
          const membershipKnown = () => hasMembershipList(v());

          return (
            <>
              <DetailPanel.Header />

              <DetailPanel.Body>
                <DetailPanel.Main>
                  <DetailPanel.Title
                    icon={<Eye size={16} />}
                    title={v().name}
                  />
                  <DetailPanel.Section title="Overview" icon={<FileText size={14} />} aside={
                    <div class="pw-detail-panel__actions">
                      <Button variant="secondary" size="sm" disabled={!props.onOpen} onClick={() => props.onOpen?.(v().id)}>Open</Button>
                      <Show when={props.onEdit}>
                        <Button variant="ghost" size="sm" onClick={() => props.onEdit?.(v())}>Edit view</Button>
                      </Show>
                    </div>
                  }>
                    <Show
                      when={!isDescriptionEmpty(v().description)}
                      fallback={
                        <p class="pw-detail-panel__text" data-empty>
                          {emptyDescriptionCopy()}
                        </p>
                      }
                    >
                      <p class="pw-detail-panel__text">{v().description}</p>
                    </Show>
                    <Show when={v().purpose}>
                      <p class="pw-detail-panel__text">{v().purpose}</p>
                    </Show>
                  </DetailPanel.Section>

                  <DetailPanel.Section title="Membership" icon={<Network size={14} />}>
                    <Show
                      when={membershipKnown() && members().length > 0}
                      fallback={
                        <p class="pw-detail-panel__text" data-empty>
                          {membershipEmptyCopy(v())}
                        </p>
                      }
                    >
                      <DataTable.Root rows={members()} getRowId={(member) => member.id}>
                        <DataTable.Table aria-label="View members">
                          <DataTable.Header>
                            <DataTable.ColumnHeader
                              id="name"
                              sortBy={(member) => member.name}
                            >
                              Component
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader
                              id="type"
                              sortBy={(member) => member.type ?? ""}
                            >
                              Type
                            </DataTable.ColumnHeader>
                            <DataTable.ColumnHeader
                              id="layer"
                              sortBy={(member) => member.layer ?? ""}
                            >
                              Layer
                            </DataTable.ColumnHeader>
                          </DataTable.Header>
                          <DataTable.Body>
                            {(member) => (
                              <DataTable.Row
                                row={member}
                                rowId={member.id}
                                onActivate={() => props.onOpenMember?.(member.id)}
                                aria-label={`Open ${member.name}`}
                              >
                                <DataTable.PrimaryCell
                                  icon={<Package size={16} />}
                                  iconTone="architecture"
                                  iconSeed={member.id}
                                  title={member.name}
                                />
                                <DataTable.Cell>
                                  {member.type ?? "—"}
                                </DataTable.Cell>
                                <DataTable.Cell class="text-[var(--color-text-muted)]">
                                  {member.layer ?? "—"}
                                </DataTable.Cell>
                              </DataTable.Row>
                            )}
                          </DataTable.Body>
                          <DataTable.Empty>No members in this view.</DataTable.Empty>
                        </DataTable.Table>
                      </DataTable.Root>
                    </Show>
                  </DetailPanel.Section>

                  <Show when={v().filterSummary}>
                    <DetailPanel.Section title="Filters" icon={<ListFilter size={14} />}>
                      <p class="pw-detail-panel__text">{v().filterSummary}</p>
                    </DetailPanel.Section>
                  </Show>

                  <Show when={v().notes}>
                    <DetailPanel.Section title="Notes" icon={<FileText size={14} />}>
                      <p class="pw-detail-panel__text">{v().notes}</p>
                    </DetailPanel.Section>
                  </Show>
                </DetailPanel.Main>

                <DetailPanel.Rail>
                  <DetailPanel.Section title="Properties" icon={<Settings size={14} />}>
                    <DetailPanel.Properties>
                      <DetailPanel.Property label="Nodes" value={String(v().nodeCount)} />
                      <DetailPanel.Property label="Owner" value={v().owner?.trim()} />
                      <DetailPanel.Property label="Updated" value={v().updated} />
                    </DetailPanel.Properties>
                    <Show when={props.onDelete}>
                      <Button variant="danger" size="sm" onClick={() => props.onDelete?.(v())}>Delete view</Button>
                    </Show>
                  </DetailPanel.Section>
                  <Show when={hasEnvironments(v())}>
                    <DetailPanel.Section title="Environments" icon={<Layers size={14} />}>
                      <DetailPanel.LinkedEntities items={chips(v().environments)} />
                    </DetailPanel.Section>
                  </Show>
                  <Show when={hasTags(v())}>
                    <DetailPanel.Section title="Tags" icon={<Tag size={14} />}>
                      <DetailPanel.LinkedEntities items={chips(v().tags)} />
                    </DetailPanel.Section>
                  </Show>
                </DetailPanel.Rail>
              </DetailPanel.Body>
            </>
          );
        }}
      </Show>
    </DetailPanel.Content>
  );
}
