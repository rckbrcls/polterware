import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import {
  Button,
  DataTable,
  PageEmpty,
  Skeleton,
  pushToast,
  ShieldCheck,
  matchClauses,
  type FilterClause,
} from "@polterware/frontend-design-system";
import { expandedDetail, openDetail, requestPageBack, type ScopeNodeItem } from "@polterware/feature-shell";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import { uniqueCardSlug } from "./card-slug";
import { ContextChips } from "./context-chips";
import { RuleFormDialog, type RuleDraft } from "./rule-form-dialog";

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

/** A Rule as `WorkService.ListRules` returns it. */
export type RuleRow = {
  id: string;
  slug: string;
  statement: string;
  /** Structure nodes the Rule holds for; none is the whole project. */
  scopeNodeIds: string[];
  scopePaths: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapRule(value: unknown): RuleRow | undefined {
  const raw = asRecord(value);
  const id = asString(raw.id);
  if (!id) return undefined;
  return {
    id,
    slug: asString(raw.slug),
    statement: asString(raw.statement),
    scopeNodeIds: asStrings(raw.scopeNodeIds),
    scopePaths: asStrings(raw.scopePaths),
  };
}

type RulesBridge = {
  listRules: (payload: { projectId: string; scopeNodes?: string[] }) => Promise<unknown>;
  apply: (payload: Record<string, unknown>) => Promise<unknown>;
};

function rulesBridge(): RulesBridge | undefined {
  const root = globalThis as {
    polterware?: { core?: { work?: { listRules?: RulesBridge["listRules"]; apply?: RulesBridge["apply"] } } };
  };
  const work = root.polterware?.core?.work;
  if (!work?.listRules || !work.apply) return undefined;
  return { listRules: work.listRules, apply: work.apply };
}

/** One line, as a Polter heading or metadata value needs it. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The handle a Polter block names a Rule by: its slug, else its id. */
export const ruleHandle = (rule: Pick<RuleRow, "id" | "slug">) => rule.slug || rule.id;

/**
 * The Polter text for one Rule: `#### rule <handle>: Statement`, then `scope:` with the node paths
 * when they change (empty clears them) and `status: removed` to retire it.
 */
export function ruleText(input: { handle: string; statement?: string; scopePaths?: readonly string[]; remove?: boolean }): string {
  const statement = input.statement ? `: ${oneLine(input.statement)}` : "";
  let text = `---\npolter: 1\n---\n\n#### rule ${input.handle}${statement}\n`;
  if (input.scopePaths) text += `scope:${input.scopePaths.length ? ` ${input.scopePaths.join(", ")}` : ""}\n`;
  if (input.remove) text += "status: removed\n";
  return text;
}

export const RULES_SCOPE = "truth:facts";

/** True while a Rule is open in its composer over the Rules list. */
export function rulePageOpen(): boolean {
  const target = expandedDetail();
  return target?.scopeId === RULES_SCOPE && target.entityKind === "rule";
}

/**
 * Knowledge → Rules: the constraints agents must follow, each holding for the whole project or for
 * the Structure nodes it names (and everything under them). `polterware brief` opens with them.
 * Writes are Polter rule blocks with a change envelope.
 */
export function RulesPanel(props: {
  projectId: string;
  /** Expanded Structure node ids. Empty leaves the list unscoped. */
  scopeNodes?: readonly string[];
  /** Structure nodes, to name a Rule's contexts. */
  scopeCatalogNodes?: readonly ScopeNodeItem[];
  loadRules?: (projectId: string) => Promise<unknown>;
  query: string;
  /** Page filter clauses. */
  clauses: readonly FilterClause[];
  /** Bumped by the page toolbar's add button. */
  createToken: number;
  busy: boolean;
  justifyChange: CanonJustifyChange;
  onBusyChange: (busy: boolean) => void;
}) {
  const [rules, setRules] = createSignal<RuleRow[]>([]);
  // Loading until the first list arrives, so a Rule opened from another surface is not dropped as missing.
  const [rulesLoaded, setRulesLoaded] = createSignal(false);
  const [composerOpen, setComposerOpen] = createSignal(false);

  const contextNodesOf = (rule: RuleRow) =>
    (props.scopeCatalogNodes ?? []).filter((node) => rule.scopeNodeIds.includes(node.id));
  /** The parts of the project a Rule holds for: its Structure nodes, else the whole project. */
  const aboutOf = (rule: RuleRow) =>
    contextNodesOf(rule).map((node) => node.title).join(", ") || "Whole project";
  const pathsOf = (ids: readonly string[]) =>
    (props.scopeCatalogNodes ?? []).filter((node) => ids.includes(node.id)).map((node) => node.path).sort();

  const visibleRules = createMemo(() => {
    const needle = props.query.trim().toLowerCase();
    return rules().filter(
      (rule) =>
        matchClauses(rule, props.clauses, {}) &&
        (!needle || [rule.statement, rule.slug, aboutOf(rule)].some((value) => value.toLowerCase().includes(needle))),
    );
  });

  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  let refreshTicket = 0;
  const refresh = async () => {
    const ticket = ++refreshTicket;
    const bridge = rulesBridge();
    const projectId = props.projectId.trim();
    const loadRules = props.loadRules;
    if ((!bridge && !loadRules) || !projectId) {
      setRules([]);
      setRulesLoaded(true);
      props.onBusyChange(false);
      return;
    }
    const scopeNodes = [...(props.scopeNodes ?? [])];
    props.onBusyChange(true);
    try {
      const response = asRecord(
        await (loadRules
          ? loadRules(projectId)
          : bridge!.listRules({ projectId, ...(scopeNodes.length > 0 ? { scopeNodes } : {}) })),
      );
      if (ticket !== refreshTicket) return;
      setRules((Array.isArray(response.rules) ? response.rules : []).flatMap((item) => {
        const row = mapRule(item);
        return row ? [row] : [];
      }));
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load rules.", "danger");
    } finally {
      setRulesLoaded(true);
      if (ticket === refreshTicket) props.onBusyChange(false);
    }
  };

  const write = async (text: string, envelope: CanonChangeEnvelope, done: string): Promise<boolean> => {
    const bridge = rulesBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      pushToast("Rules are unavailable in this session.", "danger");
      return false;
    }
    props.onBusyChange(true);
    try {
      await bridge.apply({
        projectId,
        text,
        change: { summary: envelope.summary, rationale: envelope.rationale, agentRunId: envelope.agentRunId ?? "" },
      });
      pushToast(done, "success");
      await refresh();
      return true;
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not save the rule.", "danger");
      props.onBusyChange(false);
      return false;
    }
  };

  /** Resolves false when nothing was written, so the composer keeps the draft. */
  const saveRule = async (draft: RuleDraft): Promise<boolean> => {
    const current = draft.ref ? rules().find((rule) => ruleHandle(rule) === draft.ref) : undefined;
    const paths = pathsOf(draft.scopeNodeIds);
    const scopeChanged = !current || current.scopePaths.slice().sort().join("\0") !== paths.join("\0");
    const handle = current ? ruleHandle(current) : uniqueCardSlug(rules().map((rule) => rule.slug), draft.statement);
    const envelope = await props.justifyChange({
      title: current ? "Justify rule update" : "Justify new rule",
      defaultSummary: draft.statement.slice(0, 120),
      why: draft.why,
    });
    if (!envelope) return false;
    const text = ruleText({
      handle,
      statement: draft.statement,
      scopePaths: scopeChanged && (current || paths.length > 0) ? paths : undefined,
    });
    return write(text, envelope, current ? "Rule updated." : "Rule created.");
  };

  const removeRule = async (rule: RuleRow) => {
    const envelope = await props.justifyChange({
      title: "Remove rule",
      description: "Agents stop reading it in their brief.",
      defaultSummary: `Remove rule: ${rule.statement}`.slice(0, 120),
    });
    if (!envelope) return;
    if (await write(ruleText({ handle: ruleHandle(rule), remove: true }), envelope, "Rule removed.")) requestPageBack();
  };

  createEffect(() => {
    props.projectId;
    (props.scopeNodes ?? []).join("\0");
    void refresh();
  });

  createEffect(on(() => props.createToken, () => setComposerOpen(true), { defer: true }));

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: RULES_SCOPE,
      status: rulesLoaded() ? "ready" : "loading",
      targets: visibleRules().map((rule) => ({ scopeId: RULES_SCOPE, entityId: rule.id, entityKind: "rule" })),
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(RULES_SCOPE));

  const openRule = (row: RuleRow) => openDetail({ scopeId: RULES_SCOPE, entityId: row.id, entityKind: "rule" });

  /** The Rule on the open page. */
  const pageRule = () => (rulePageOpen() ? rules().find((rule) => rule.id === expandedDetail()?.entityId) : undefined);
  // Opening a Rule opens it for editing.
  const editing = () => Boolean(rulesBridge()) && !composerOpen() && Boolean(pageRule());

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="min-h-0 flex-1 overflow-auto">
        <DataTable.Root
          rows={visibleRules()}
          getRowId={(row) => row.id}
          columnWidthsKey="truth-facts"
          activeRowId={activeTarget()?.scopeId === RULES_SCOPE ? activeTarget()?.entityId ?? null : null}
        >
          <DataTable.Table aria-label="Rules">
            <DataTable.Header>
              <DataTable.ColumnHeader<RuleRow> id="statement" sortBy={(row) => row.statement}>
                Rule
              </DataTable.ColumnHeader>
              <DataTable.ColumnHeader<RuleRow> id="context" sortBy={(row) => aboutOf(row)}>
                Context
              </DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body<RuleRow>>
              {(row) => (
                <DataTable.Row
                  row={row}
                  rowId={row.id}
                  onActivate={() => openRule(row)}
                  aria-label={`Open rule ${row.statement || row.id}`}
                >
                  <DataTable.PrimaryCell
                    icon={<ShieldCheck size={16} />}
                    iconTone="knowledge"
                    iconSeed={row.id}
                    title={row.statement || row.id}
                  />
                  <DataTable.Cell>
                    <ContextChips ids={row.scopeNodeIds} nodes={props.scopeCatalogNodes ?? []} />
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
                <PageEmpty title="No rules yet" mood="sleeping">
                  <p class="text-[13px] text-[var(--color-text-muted)]">Agents read every Rule that holds for their work in the brief.</p>
                </PageEmpty>
              </Show>
            </DataTable.Empty>
          </DataTable.Table>
        </DataTable.Root>
      </div>

      <RuleFormDialog
        scopeNodes={props.scopeCatalogNodes}
        open={composerOpen() || editing()}
        mode={editing() ? "edit" : "create"}
        initial={editing() ? { ref: ruleHandle(pageRule()!), statement: pageRule()!.statement, scopeNodeIds: pageRule()!.scopeNodeIds } : undefined}
        onClose={() => (editing() ? requestPageBack() : setComposerOpen(false))}
        onSubmit={saveRule}
        footerAction={editing() ? (
          <Button variant="ghost" size="sm" disabled={props.busy} onClick={() => void removeRule(pageRule()!)}>
            Remove rule
          </Button>
        ) : undefined}
      />
    </div>
  );
}
