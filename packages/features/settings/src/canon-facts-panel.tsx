import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import {
  Button,
  DataTable,
  DetailPanel,
  IconTile,
  PageEmpty,
  Skeleton,
  StatusChip,
  pushToast,
  History,
  Link,
  ScrollText,
} from "@polterware/frontend-design-system";
import { openDetail } from "@polterware/feature-shell";
import { detailPanelStore } from "@polterware/frontend-state";
import { CanonFactFormDialog } from "./canon-fact-form-dialog";
import { CanonLinkEvidenceDialog } from "./canon-link-evidence-dialog";
import type {
  CanonEvidenceRow,
  CanonFactDetail,
  CanonFactDraft,
  CanonFactRow,
  CanonFactTruthClass,
} from "./canon-facts-types";

export type CanonChangeEnvelope = {
  summary: string;
  rationale: string;
  agentRunId?: string;
};

export type CanonJustifyChange = (input: {
  title: string;
  description?: string;
  defaultSummary?: string;
}) => Promise<CanonChangeEnvelope | null>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapFact(value: unknown): CanonFactRow | undefined {
  const raw = asRecord(value);
  const id = asString(raw.id);
  if (!id) return undefined;
  return {
    id,
    projectId: asString(raw.projectId),
    statement: asString(raw.statement),
    truthClass: asString(raw.truthClass),
    source: asString(raw.source),
    actor: asString(raw.actor),
    entityId: asString(raw.entityId),
    observedAt: asString(raw.observedAt),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

function mapEvidence(value: unknown): CanonEvidenceRow | undefined {
  const raw = asRecord(value);
  const id = asString(raw.id);
  if (!id) return undefined;
  return {
    id,
    projectId: asString(raw.projectId),
    kind: asString(raw.kind),
    summary: asString(raw.summary),
    source: asString(raw.source),
    path: asString(raw.path),
    actor: asString(raw.actor),
    observedAt: asString(raw.observedAt),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

function ProvenanceValue(props: { value: string }) {
  return (
    <span class="block w-full min-w-0 truncate text-left" title={props.value}>
      {props.value}
    </span>
  );
}

function provenanceValue(value: string) {
  const text = value.trim();
  return text ? <ProvenanceValue value={text} /> : null;
}

function truthTone(truthClass: string): "ok" | "warn" | "muted" | "syncing" {
  switch (truthClass) {
    case "verified":
      return "ok";
    case "declared":
      return "syncing";
    case "observed":
      return "ok";
    case "inferred":
      return "warn";
    default:
      return "muted";
  }
}

type CanonBridge = {
  listFacts: (payload: { projectId: string; entityId?: string }) => Promise<unknown>;
  getFact: (payload: { id: string }) => Promise<unknown>;
  upsertFact: (payload: Record<string, unknown>) => Promise<unknown>;
  listEvidence: (payload: { projectId: string }) => Promise<unknown>;
  upsertEvidence: (payload: Record<string, unknown>) => Promise<unknown>;
  linkEvidenceToFact: (payload: Record<string, unknown>) => Promise<unknown>;
};

function canonBridge(): CanonBridge | undefined {
  const root = globalThis as {
    polterware?: {
      core?: {
        canon?: {
          listFacts?: CanonBridge["listFacts"];
          getFact?: CanonBridge["getFact"];
          upsertFact?: CanonBridge["upsertFact"];
          listEvidence?: CanonBridge["listEvidence"];
          upsertEvidence?: CanonBridge["upsertEvidence"];
          linkEvidenceToFact?: CanonBridge["linkEvidenceToFact"];
        };
      };
    };
  };
  const canon = root.polterware?.core?.canon;
  if (
    !canon?.listFacts
    || !canon.getFact
    || !canon.upsertFact
    || !canon.listEvidence
    || !canon.upsertEvidence
    || !canon.linkEvidenceToFact
  ) {
    return undefined;
  }
  return {
    listFacts: canon.listFacts,
    getFact: canon.getFact,
    upsertFact: canon.upsertFact,
    listEvidence: canon.listEvidence,
    upsertEvidence: canon.upsertEvidence,
    linkEvidenceToFact: canon.linkEvidenceToFact,
  };
}

function changePayload(change: { summary: string; rationale: string; agentRunId?: string }) {
  return {
    summary: change.summary,
    rationale: change.rationale,
    agentRunId: change.agentRunId ?? "",
  };
}

const FACTS_SCOPE = "truth:facts";

/** Agents → Facts: list/inspect Canon facts and evidence; mutate with change envelope. */
export function CanonFactsPanel(props: {
  projectId: string;
  query: string;
  truthClasses: readonly string[];
  /** Bumped by the page toolbar's add button. */
  createToken: number;
  busy: boolean;
  justifyChange: CanonJustifyChange;
  onBusyChange: (busy: boolean) => void;
}) {
  const [facts, setFacts] = createSignal<CanonFactRow[]>([]);
  const [selectedId, setSelectedId] = createSignal("");
  const [detail, setDetail] = createSignal<CanonFactDetail | undefined>();
  const [projectEvidence, setProjectEvidence] = createSignal<CanonEvidenceRow[]>([]);
  const [factDialogOpen, setFactDialogOpen] = createSignal(false);
  const [factDialogMode, setFactDialogMode] = createSignal<"create" | "edit">("create");
  const [factDraft, setFactDraft] = createSignal<CanonFactDraft | undefined>();
  const [linkDialogOpen, setLinkDialogOpen] = createSignal(false);

  const visibleFacts = createMemo(() => {
    const needle = props.query.trim().toLowerCase();
    return facts().filter(
      (fact) =>
        (props.truthClasses.length === 0 || props.truthClasses.includes(fact.truthClass)) &&
        (!needle || [fact.statement, fact.id, fact.entityId, fact.source].some((value) => value.toLowerCase().includes(needle))),
    );
  });

  const loadDetail = async (id: string) => {
    const bridge = canonBridge();
    if (!bridge || !id) {
      setDetail(undefined);
      return;
    }
    try {
      const response = asRecord(await bridge.getFact({ id }));
      const fact = mapFact(response.fact);
      if (!fact) {
        setDetail(undefined);
        return;
      }
      const evidenceRaw = Array.isArray(response.evidence) ? response.evidence : [];
      setDetail({
        fact,
        evidence: evidenceRaw.flatMap((item) => {
          const row = mapEvidence(item);
          return row ? [row] : [];
        }),
      });
    } catch (error: unknown) {
      setDetail(undefined);
      pushToast(error instanceof Error ? error.message : "Could not load fact.", "danger");
    }
  };

  const refresh = async () => {
    const bridge = canonBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      setFacts([]);
      setDetail(undefined);
      setSelectedId("");
      setProjectEvidence([]);
      return;
    }
    props.onBusyChange(true);
    try {
      const listResponse = asRecord(await bridge.listFacts({ projectId }));
      const nextFacts = (Array.isArray(listResponse.facts) ? listResponse.facts : []).flatMap(
        (item) => {
          const row = mapFact(item);
          return row ? [row] : [];
        },
      );
      setFacts(nextFacts);
      const evidenceResponse = asRecord(await bridge.listEvidence({ projectId }));
      setProjectEvidence(
        (Array.isArray(evidenceResponse.evidence) ? evidenceResponse.evidence : []).flatMap(
          (item) => {
            const row = mapEvidence(item);
            return row ? [row] : [];
          },
        ),
      );
      // Keep the user's selection across refreshes; never auto-open the first fact.
      const current = selectedId();
      const selectedFact = nextFacts.find((fact) => fact.id === current);
      setSelectedId(selectedFact?.id ?? "");
      if (selectedFact) await loadDetail(selectedFact.id);
      else setDetail(undefined);
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load facts.", "danger");
    } finally {
      props.onBusyChange(false);
    }
  };

  const saveFact = async (draft: CanonFactDraft) => {
    const bridge = canonBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      pushToast("Canon facts are unavailable in this session.", "danger");
      return;
    }
    const envelope = await props.justifyChange({
      title: draft.id ? "Justify fact update" : "Justify new fact",
      description: "Facts become durable project truth only with summary and rationale.",
      defaultSummary: draft.statement.slice(0, 120),
    });
    if (!envelope) return;
    props.onBusyChange(true);
    try {
      await bridge.upsertFact({
        fact: {
          id: draft.id ?? "",
          projectId,
          statement: draft.statement,
          truthClass: draft.truthClass,
          entityId: draft.entityId,
          source: "",
          actor: "",
          observedAt: "",
          createdAt: "",
          updatedAt: "",
        },
        change: changePayload(envelope),
      });
      setFactDialogOpen(false);
      pushToast(draft.id ? "Fact updated." : "Fact created.", "success");
      await refresh();
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not save fact.", "danger");
      props.onBusyChange(false);
    }
  };

  const linkEvidence = async (evidenceId: string) => {
    const bridge = canonBridge();
    const projectId = props.projectId.trim();
    const factId = selectedId();
    if (!bridge || !projectId || !factId) return;
    const envelope = await props.justifyChange({
      title: "Justify evidence link",
      description: "Link existing evidence to the selected fact.",
      defaultSummary: `Link ${evidenceId} to ${factId}`,
    });
    if (!envelope) return;
    props.onBusyChange(true);
    try {
      await bridge.linkEvidenceToFact({
        projectId,
        factId,
        evidenceId,
        change: changePayload(envelope),
      });
      setLinkDialogOpen(false);
      pushToast("Evidence linked.", "success");
      await refresh();
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not link evidence.", "danger");
      props.onBusyChange(false);
    }
  };

  createEffect(() => {
    props.projectId;
    void refresh();
  });

  createEffect(
    on(
      () => props.createToken,
      () => {
        setFactDialogMode("create");
        setFactDraft({ statement: "", truthClass: "declared", entityId: "" });
        setFactDialogOpen(true);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: FACTS_SCOPE,
      status: "ready",
      targets: visibleFacts().map((fact) => ({ scopeId: FACTS_SCOPE, entityId: fact.id, entityKind: "fact" })),
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(FACTS_SCOPE));

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="min-h-0 flex-1 overflow-auto">
          <DataTable.Root rows={visibleFacts()} getRowId={(row) => row.id}>
            <DataTable.Table aria-label="Canon facts">
              <DataTable.Header>
                <DataTable.ColumnHeader id="statement" sortBy={(row) => row.statement}>
                  Statement
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="truth" sortBy={(row) => row.truthClass}>
                  Truth
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="source" sortBy={(row) => row.source}>
                  Source
                </DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body>
                {(row) => (
                  <DataTable.Row
                    row={row}
                    rowId={row.id}
                    class={
                      row.id === selectedId() ? "pw-data-table-row--active" : undefined
                    }
                    onActivate={() => {
                      setSelectedId(row.id);
                      void loadDetail(row.id);
                      openDetail({ scopeId: FACTS_SCOPE, entityId: row.id, entityKind: "fact" });
                    }}
                    aria-label={`Open fact ${row.statement || row.id}`}
                  >
                    <DataTable.Cell
                      leading={
                        <IconTile size={24} tone="knowledge" seed={row.id}>
                          <ScrollText size={14} />
                        </IconTile>
                      }
                    >
                      <div class="min-w-0">
                        <div class="font-medium">{row.statement || "—"}</div>
                        <div class="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                          {row.id}
                          {row.entityId ? ` · ${row.entityId}` : ""}
                        </div>
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <StatusChip tone={truthTone(row.truthClass)} label={row.truthClass || "—"} />
                    </DataTable.Cell>
                    <DataTable.Cell>
                      <span class="truncate text-[11px] text-[var(--color-text-muted)]">
                        {row.source || "—"}
                      </span>
                    </DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
              <DataTable.Empty>
                <Show
                  when={!props.busy}
                  fallback={
                    <div class="pw-page-skeleton__rows p-3" role="status" aria-label="Loading…">
                      <For each={[0, 1, 2, 3]}>
                        {() => (
                          <div class="pw-page-skeleton__row">
                            <Skeleton class="h-3 w-[30%]" />
                            <Skeleton class="h-3 w-[20%]" />
                            <Skeleton class="ml-auto h-3 w-[12%]" />
                          </div>
                        )}
                      </For>
                    </div>
                  }
                >
                  <PageEmpty
                    title="No facts yet"
                    description="Import project sources or create a declared fact. Agent MCP writes also appear here."
                  />
                </Show>
              </DataTable.Empty>
            </DataTable.Table>
          </DataTable.Root>
      </div>

      <Show when={detail()}>
        {(current) => (
          <DetailPanel.Content>
            <DetailPanel.Header />
            <DetailPanel.Body>
              <DetailPanel.Main>
                <DetailPanel.Title title={current().fact.statement || current().fact.id} />
                <div class="mb-3 flex min-w-0 flex-col gap-2 border-b border-[var(--color-border-subtle)] pb-3">
                  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <StatusChip tone={truthTone(current().fact.truthClass)} label={current().fact.truthClass || "—"} />
                    <StatusChip tone="muted" label={current().fact.actor || "actor"} />
                  </div>
                  <div class="pw-detail-panel__actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={props.busy}
                      onClick={() => {
                        const fact = current().fact;
                        setFactDialogMode("edit");
                        setFactDraft({
                          id: fact.id,
                          statement: fact.statement,
                          truthClass: (["declared", "observed", "inferred", "verified"].includes(fact.truthClass)
                            ? fact.truthClass
                            : "declared") as CanonFactTruthClass,
                          entityId: fact.entityId,
                        });
                        setFactDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => setLinkDialogOpen(true)}>
                      Link evidence
                    </Button>
                  </div>
                </div>
                <DetailPanel.Section title="Linked evidence" icon={<Link size={14} />}>
                  <Show
                    when={current().evidence.length > 0}
                    fallback={<p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">No evidence linked to this fact.</p>}
                  >
                    <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
                      <For each={current().evidence}>
                        {(item) => (
                          <li class="flex min-w-0 flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-2.5 first:border-t-0 first:pt-0">
                            <div class="flex min-w-0 items-center gap-1.5">
                              <StatusChip tone="muted" label={item.kind || "other"} />
                              <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-muted)]" title={item.id}>
                                {item.id}
                              </span>
                            </div>
                            <p class="m-0 text-[12.5px] leading-5 text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                              {item.summary || "—"}
                            </p>
                            <Show when={item.path}>
                              <p class="m-0 min-w-0 truncate font-mono text-[11px] leading-4 text-[var(--color-text-muted)]" title={item.path}>
                                {item.path}
                              </p>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </DetailPanel.Section>
                <DetailPanel.Section title="Provenance" icon={<History size={14} />}>
                  <DetailPanel.Properties class="!gap-1.5 [&_.pw-detail-panel__property]:!min-h-0 [&_.pw-detail-panel__property]:!grid-cols-[72px_minmax(0,1fr)] [&_.pw-detail-panel__property]:!gap-2">
                    <DetailPanel.Property label="Id" mono value={provenanceValue(current().fact.id)} />
                    <DetailPanel.Property label="Entity" mono value={provenanceValue(current().fact.entityId)} />
                    <DetailPanel.Property label="Source" mono value={provenanceValue(current().fact.source)} />
                    <DetailPanel.Property label="Updated" mono value={provenanceValue(current().fact.updatedAt)} />
                  </DetailPanel.Properties>
                </DetailPanel.Section>
              </DetailPanel.Main>
            </DetailPanel.Body>
          </DetailPanel.Content>
        )}
      </Show>

      <CanonFactFormDialog
        open={factDialogOpen()}
        mode={factDialogMode()}
        initial={factDraft()}
        onClose={() => setFactDialogOpen(false)}
        onSubmit={(draft) => void saveFact(draft)}
      />
      <CanonLinkEvidenceDialog
        open={linkDialogOpen()}
        evidence={projectEvidence()}
        linkedIds={(detail()?.evidence ?? []).map((item) => item.id)}
        busy={props.busy}
        onClose={() => setLinkDialogOpen(false)}
        onLink={(evidenceId) => void linkEvidence(evidenceId)}
      />
    </div>
  );
}
