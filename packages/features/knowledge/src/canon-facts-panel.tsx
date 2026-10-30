import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import {
  DataTable,
  PageEmpty,
  Skeleton,
  StatusChip,
  pushToast,
  ScrollText,
  matchClauses,
  type FilterClause,
} from "@polterware/frontend-design-system";
import { expandedDetail, openDetail, requestDetailExpanded, requestPageBack, type ScopeNodeItem, type WorkspaceCanonEntity } from "@polterware/feature-shell";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import { CanonFactFormDialog } from "./canon-fact-form-dialog";
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
  /** What the person typed as the reason; empty is allowed. */
  why?: string;
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
    scopeNodeIds: Array.isArray(raw.scopeNodeIds) ? raw.scopeNodeIds.filter((id): id is string => typeof id === "string") : [],
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

type CanonBridge = {
  listFacts: (payload: { projectId: string; entityId?: string; scopeNodes?: string[] }) => Promise<unknown>;
  getFact: (payload: { id: string }) => Promise<unknown>;
  upsertFact: (payload: Record<string, unknown>) => Promise<unknown>;
  listEvidence: (payload: { projectId: string; scopeNodes?: string[] }) => Promise<unknown>;
  upsertEvidence: (payload: Record<string, unknown>) => Promise<unknown>;
  linkEvidenceToFact: (payload: Record<string, unknown>) => Promise<unknown>;
  /** Replaces an entity's contexts (`WorkService.SetScope`). */
  setScope?: (payload: Record<string, unknown>) => Promise<unknown>;
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
        work?: { setScope?: CanonBridge["setScope"] };
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
    setScope: root.polterware?.core?.work?.setScope,
  };
}

function changePayload(change: { summary: string; rationale: string; agentRunId?: string }) {
  return {
    summary: change.summary,
    rationale: change.rationale,
    agentRunId: change.agentRunId ?? "",
  };
}

export const FACTS_SCOPE = "truth:facts";

/** True while a Fact is open in its dialog over the Facts list. */
export function factPageOpen(): boolean {
  const target = expandedDetail();
  return target?.scopeId === FACTS_SCOPE && target.entityKind === "fact";
}

/**
 * Knowledge → Rules: what people and agents declare about the project, each about one part of it.
 * Facts the scan observes in the code are not rules: they stay in the core, where drift compares them
 * with the rules and raises a Conflict. Writes carry a change envelope.
 */
export function CanonFactsPanel(props: {
  projectId: string;
  /** Expanded Structure node ids. Empty leaves the lists unscoped. */
  scopeNodes?: readonly string[];
  /** Canon entities, to name the subject of a rule with no contexts. */
  entities?: readonly WorkspaceCanonEntity[];
  /** Structure nodes, to name a Fact's scope. */
  scopeCatalogNodes?: readonly ScopeNodeItem[];
  loadFacts?: (projectId: string) => Promise<unknown>;
  query: string;
  /** Page filter clauses. */
  clauses: readonly FilterClause[];
  /** Bumped by the page toolbar's add button. */
  createToken: number;
  busy: boolean;
  justifyChange: CanonJustifyChange;
  onBusyChange: (busy: boolean) => void;
}) {
  const [facts, setFacts] = createSignal<CanonFactRow[]>([]);
  // Loading until the first list arrives, so a Fact opened from another surface is not dropped as missing.
  const [factsLoaded, setFactsLoaded] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal("");
  const [detail, setDetail] = createSignal<CanonFactDetail | undefined>();
  // The composer creates a Fact; an opened Fact edits in the same composer.
  const [factDialogOpen, setFactDialogOpen] = createSignal(false);

  const subjectOf = (fact: CanonFactRow) =>
    (props.entities ?? []).find((entity) => entity.id === fact.entityId)?.title ?? "";
  const contextNodesOf = (fact: CanonFactRow) =>
    (props.scopeCatalogNodes ?? []).filter((node) => fact.scopeNodeIds.includes(node.id));
  /** The parts of the project a rule is about: its Structure nodes, else its subject. */
  const aboutOf = (fact: CanonFactRow) =>
    contextNodesOf(fact).map((node) => node.title).join(", ") || subjectOf(fact) || "Whole project";

  const visibleFacts = createMemo(() => {
    const needle = props.query.trim().toLowerCase();
    return facts().filter(
      (fact) =>
        fact.truthClass !== "observed" &&
        matchClauses(fact, props.clauses, {}) &&
        (!needle || [fact.statement, fact.id, subjectOf(fact), aboutOf(fact), fact.source].some((value) => value.toLowerCase().includes(needle))),
    );
  });

  // A Fact opened from elsewhere (Inbox, a link) loads its page here.
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);
  createEffect(on(() => (factPageOpen() ? expandedDetail()?.entityId ?? "" : ""), (id) => {
    if (!id || id === detail()?.fact.id) return;
    setSelectedId(id);
    void loadDetail(id);
  }));

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
      pushToast(error instanceof Error ? error.message : "Could not load the rule.", "danger");
    }
  };

  let refreshTicket = 0;
  const refresh = async () => {
    const ticket = ++refreshTicket;
    const bridge = canonBridge();
    const projectId = props.projectId.trim();
    const loadFacts = props.loadFacts;
    if ((!bridge && !loadFacts) || !projectId) {
      setFacts([]);
      setFactsLoaded(true);
      setDetail(undefined);
      setSelectedId("");
      props.onBusyChange(false);
      return;
    }
    const scopeNodes = [...(props.scopeNodes ?? [])];
    const scoped = scopeNodes.length > 0 ? { scopeNodes } : {};
    props.onBusyChange(true);
    try {
      const listResponse = asRecord(
        await (loadFacts
          ? loadFacts(projectId)
          : bridge
            ? bridge.listFacts({ projectId, ...scoped })
            : { facts: [] }),
      );
      const nextFacts = (Array.isArray(listResponse.facts) ? listResponse.facts : []).flatMap(
        (item) => {
          const row = mapFact(item);
          return row ? [row] : [];
        },
      );
      setFacts(nextFacts);
      setFactsLoaded(true);
      if (ticket !== refreshTicket) return;
      // Keep the user's selection across refreshes; never auto-open the first fact.
      const current = selectedId();
      const selectedFact = nextFacts.find((fact) => fact.id === current);
      setSelectedId(selectedFact?.id ?? "");
      if (selectedFact) await loadDetail(selectedFact.id);
      else setDetail(undefined);
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load rules.", "danger");
      setFactsLoaded(true);
    } finally {
      if (ticket === refreshTicket) props.onBusyChange(false);
    }
  };

  /** Resolves false when nothing was written, so the composer keeps the draft. */
  const saveFact = async (draft: CanonFactDraft): Promise<boolean> => {
    const bridge = canonBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      pushToast("Rules are unavailable in this session.", "danger");
      return false;
    }
    const envelope = await props.justifyChange({
      title: draft.id ? "Justify rule update" : "Justify new rule",
      defaultSummary: draft.statement.slice(0, 120),
      why: draft.why,
    });
    if (!envelope) return false;
    props.onBusyChange(true);
    try {
      const saved = asRecord(asRecord(await bridge.upsertFact({
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
      })).fact);
      const id = asString(saved.id) || draft.id || "";
      const before = facts().find((fact) => fact.id === id)?.scopeNodeIds ?? [];
      const changed = before.length !== draft.scopeNodeIds.length || before.some((node) => !draft.scopeNodeIds.includes(node));
      if (id && changed && bridge.setScope) {
        await bridge.setScope({ projectId, kind: "fact", id, nodes: draft.scopeNodeIds });
      }
      pushToast(draft.id ? "Rule updated." : "Rule created.", "success");
      await refresh();
      return true;
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not save the rule.", "danger");
      props.onBusyChange(false);
      return false;
    }
  };

  createEffect(() => {
    props.projectId;
    (props.scopeNodes ?? []).join("\0");
    void refresh();
  });

  createEffect(
    on(
      () => props.createToken,
      () => {
        setFactDialogOpen(true);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: FACTS_SCOPE,
      status: factsLoaded() ? "ready" : "loading",
      targets: visibleFacts().map((fact) => ({ scopeId: FACTS_SCOPE, entityId: fact.id, entityKind: "fact" })),
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(FACTS_SCOPE));

  const openFact = (row: CanonFactRow) => {
    setSelectedId(row.id);
    void loadDetail(row.id);
    openDetail({ scopeId: FACTS_SCOPE, entityId: row.id, entityKind: "fact" });
  };

  /** The Fact on the open page, once its detail matches the page. */
  const pageFact = () => {
    const fact = detail()?.fact;
    return factPageOpen() && fact && fact.id === expandedDetail()?.entityId ? fact : undefined;
  };
  const draftOf = (fact: CanonFactRow): CanonFactDraft => ({
    id: fact.id,
    statement: fact.statement,
    truthClass: (["declared", "observed", "inferred", "verified"].includes(fact.truthClass)
      ? fact.truthClass
      : "declared") as CanonFactTruthClass,
    entityId: fact.entityId,
    scopeNodeIds: fact.scopeNodeIds,
  });
  // Opening a rule opens it for editing.
  const editing = () => Boolean(canonBridge()) && !factDialogOpen() && Boolean(pageFact());

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="min-h-0 flex-1 overflow-auto">
          <DataTable.Root
            rows={visibleFacts()}
            getRowId={(row) => row.id}
            columnWidthsKey="truth-facts"
            activeRowId={activeTarget()?.scopeId === FACTS_SCOPE ? activeTarget()?.entityId ?? null : null}
          >
            <DataTable.Table aria-label="Rules">
              <DataTable.Header>
                <DataTable.ColumnHeader<CanonFactRow> id="statement" sortBy={(row) => row.statement}>
                  Rule
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader<CanonFactRow> id="about" sortBy={(row) => aboutOf(row)}>
                  About
                </DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<CanonFactRow>>
                {(row) => (
                  <DataTable.Row
                    row={row}
                    rowId={row.id}
                    onActivate={() => openFact(row)}
                    aria-label={`Open rule ${row.statement || row.id}`}
                  >
                    <DataTable.PrimaryCell
                      icon={<ScrollText size={16} />}
                      iconTone="knowledge"
                      iconSeed={row.id}
                      title={row.statement || row.id}
                    />
                    <DataTable.Cell>
                      <span title={contextNodesOf(row).map((node) => node.path).join(", ") || undefined}>{aboutOf(row)}</span>
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
                    title="No rules yet"
                    mood="sleeping"
                  />
                </Show>
              </DataTable.Empty>
            </DataTable.Table>
          </DataTable.Root>
      </div>

      <CanonFactFormDialog
        scopeNodes={props.scopeCatalogNodes}
        open={factDialogOpen() || editing()}
        mode={editing() ? "edit" : "create"}
        initial={editing() ? draftOf(pageFact()!) : undefined}
        onClose={() => (editing() ? requestPageBack() : setFactDialogOpen(false))}
        onSubmit={saveFact}
      />
    </div>
  );
}
