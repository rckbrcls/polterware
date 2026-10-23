import { Show } from "solid-js";
import {
  Button,
  DataTable,
  DetailPanel,
  PageError,
  PageLoading,
  StatusChip,
  Link,
  Settings,
} from "@polterware/frontend-design-system";
import { FileText, Network } from "@polterware/frontend-design-system";
import { NodeIcon } from "./domain/node-icon";
import {
  architectureLifecycleLabel,
  architectureLinkResourceCaption,
  architectureLinkStatusLabel,
  connectionEvidenceLabel,
  connectionEvidenceTone,
} from "./node-detail-helpers";
import type { ArchitectureNodeView } from "./types";

export function ArchitectureNodeDetail(props: {
  node: ArchitectureNodeView | null | undefined;
  loading?: boolean;
  error?: string | null;
  notFound?: boolean;
  onOpenRelated?: (id: string) => void;
  onOpenOnCanvas?: (nodeId: string) => void;
  onLinkResource?: (nodeId: string) => void;
}) {
  return (
    <DetailPanel.Content>
      <Show when={props.loading}>
        <DetailPanel.Header />
        <DetailPanel.Body>
          <DetailPanel.Main>
            <PageLoading layout="detail" label="Loading node…" />
          </DetailPanel.Main>
        </DetailPanel.Body>
      </Show>
      <Show when={!props.loading && (props.error || props.notFound || !props.node)}>
        <DetailPanel.Header />
        <DetailPanel.Body>
          <DetailPanel.Main>
            <PageError
              title={props.notFound || !props.node ? "Node not found" : "Failed to load"}
              message={props.error ?? "This architecture node is unavailable."}
            />
          </DetailPanel.Main>
        </DetailPanel.Body>
      </Show>
      <Show when={!props.loading && props.node}>
        {(n) => {
          const linkCaption = () =>
            architectureLinkResourceCaption(n().linkStatus, n().resourceName);
          const canLink = () => Boolean(n().canLinkResource && props.onLinkResource);

          return (
            <>
              <DetailPanel.Header />
              <DetailPanel.Body>
                <DetailPanel.Main>
                  <DetailPanel.Title
                    icon={<NodeIcon type={n().kind} name={n().kind} size={16} />}
                    title={n().label}
                  />
                  <DetailPanel.Section title="Connected architecture" icon={<Network size={14} />} aside={
                    <Show when={props.onOpenOnCanvas}>
                      <Button variant="ghost" size="sm" onClick={() => props.onOpenOnCanvas?.(n().id)}>Open on canvas</Button>
                    </Show>
                  }>
                    <DataTable.Root
                      rows={n().connected}
                      getRowId={(connection) => connection.nodeId}
                    >
                      <DataTable.Table aria-label="Connected architecture">
                        <DataTable.Header>
                          <DataTable.ColumnHeader
                            id="label"
                            sortBy={(connection) => connection.label}
                          >
                            Node
                          </DataTable.ColumnHeader>
                          <DataTable.ColumnHeader
                            id="relation"
                            sortBy={(connection) => connection.relation}
                          >
                            Relation
                          </DataTable.ColumnHeader>
                          <DataTable.ColumnHeader
                            id="evidence"
                            sortBy={(connection) => connection.evidence}
                          >
                            Evidence
                          </DataTable.ColumnHeader>
                        </DataTable.Header>
                        <DataTable.Body>
                          {(connection) => (
                            <DataTable.Row
                              row={connection}
                              rowId={connection.nodeId}
                              onActivate={() => props.onOpenRelated?.(connection.nodeId)}
                            >
                              <DataTable.PrimaryCell
                                icon={<Network size={16} />}
                                iconTone="architecture"
                                iconSeed={connection.nodeId}
                                title={connection.label}
                              />
                              <DataTable.Cell>{connection.relation}</DataTable.Cell>
                              <DataTable.Cell>
                                <StatusChip
                                  tone={connectionEvidenceTone(connection.evidence)}
                                  label={connectionEvidenceLabel(connection.evidence)}
                                />
                              </DataTable.Cell>
                            </DataTable.Row>
                          )}
                        </DataTable.Body>
                        <DataTable.Empty>No connections listed.</DataTable.Empty>
                      </DataTable.Table>
                    </DataTable.Root>
                  </DetailPanel.Section>

                  <Show when={n().notes}>
                    <DetailPanel.Section title="Notes" icon={<FileText size={14} />}>
                      <p class="pw-detail-panel__text">{n().notes}</p>
                    </DetailPanel.Section>
                  </Show>
                  <Show when={n().docs.length > 0}>
                    <DetailPanel.Section title="Linked docs" icon={<Link size={14} />}>
                      <DetailPanel.LinkedEntities
                        items={n().docs.map((doc) => ({
                          id: doc.id,
                          title: doc.title,
                          icon: <FileText size={12} />,
                        }))}
                      />
                    </DetailPanel.Section>
                  </Show>
                </DetailPanel.Main>
                <Show
                  when={
                    canLink() ||
                    linkCaption() ||
                    n().role ||
                    n().owner ||
                    n().environment ||
                    n().lifecycle ||
                    n().linkStatus
                  }
                >
                  <DetailPanel.Rail>
                    <DetailPanel.Section title="Properties" icon={<Settings size={14} />}>
                      <DetailPanel.Properties>
                        <DetailPanel.Property
                          label="Lifecycle"
                          value={architectureLifecycleLabel(n().lifecycle)}
                        />
                        <DetailPanel.Property
                          label="Link"
                          value={architectureLinkStatusLabel(n().linkStatus)}
                        />
                        <DetailPanel.Property label="Resource" value={
                          <Show when={linkCaption() || canLink()}>
                            <div class="flex flex-wrap items-center gap-2">
                              <Show when={linkCaption()}><span>{linkCaption()}</span></Show>
                              <Show when={canLink()}>
                                <Button variant="ghost" size="sm" onClick={() => props.onLinkResource?.(n().id)}>Link resource</Button>
                              </Show>
                            </div>
                          </Show>
                        } />
                        <DetailPanel.Property label="Role" value={n().role} />
                        <DetailPanel.Property label="Owner" value={n().owner} />
                        <DetailPanel.Property label="Environment" value={n().environment} />
                      </DetailPanel.Properties>
                    </DetailPanel.Section>
                  </DetailPanel.Rail>
                </Show>
              </DetailPanel.Body>
            </>
          );
        }}
      </Show>
    </DetailPanel.Content>
  );
}
