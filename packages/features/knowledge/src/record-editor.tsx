import { Match, Switch, createEffect, createSignal, on } from "solid-js";
import { Composer, type ComposerProperty } from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceDecision, WorkspaceDoc, WorkspaceMilestone, WorkspaceWorkCard } from "@polterware/feature-shell";
import { CardComposer, contextProperty, type CardDraft } from "./composers";
import { RuleFormDialog, type RuleDraft } from "./rule-form-dialog";

export type RecordEditKind = "card" | "decision" | "rule" | "doc";
export type RecordEditTarget = { kind: RecordEditKind; id: string };
/** A Rule as the workspace lists it, by id. */
export type RecordEditRule = { id: string; slug: string; statement: string; scopeNodeIds: readonly string[] };

/** A decision's or a doc's edit: the title, the whole Markdown body, and its contexts. */
export type KnowledgeEditDraft = { title: string; body: string; scopeNodeIds: string[]; why: string };

/** Resolves false when the write failed, so the composer keeps the draft. */
type Save<T> = (draft: T) => Promise<boolean>;

const WHY = "Optional. Recorded in Activity";

/** A decision's or a doc's composer, filled from the record. */
function KnowledgeEditComposer(props: {
  crumb: string;
  label: "decision" | "doc";
  record: { title: string; bodyMarkdown: string; scopeNodeIds: readonly string[] };
  scopeNodes: readonly ScopeNodeItem[];
  onClose: () => void;
  onExpand: () => void;
  onSave: Save<KnowledgeEditDraft>;
}) {
  const [contexts, setContexts] = createSignal<string[]>([]);
  createEffect(on(() => props.record, (record) => setContexts([...record.scopeNodeIds])));
  const properties = (): ComposerProperty[] =>
    props.scopeNodes.length > 0 ? [contextProperty(props.scopeNodes, contexts, setContexts)] : [];
  return (
    <Composer
      open
      onClose={props.onClose}
      onExpand={props.onExpand}
      crumbs={[props.crumb, props.label === "decision" ? "Edit decision" : "Edit doc"]}
      titlePlaceholder={props.label === "decision" ? "Decision title" : "Doc title"}
      descriptionPlaceholder={props.label === "decision" ? "Context, decision, consequences…" : "Write in Markdown…"}
      properties={properties()}
      whyPlaceholder={WHY}
      initial={{ title: props.record.title, description: props.record.bodyMarkdown }}
      createMore={false}
      submitLabel={props.label === "decision" ? "Save decision" : "Save doc"}
      onSubmit={(draft) => props.onSave({ title: draft.title, body: draft.description, scopeNodeIds: contexts(), why: draft.why })}
    />
  );
}

/**
 * Edits a card, decision, rule, or doc where it is cited (a Structure node's sections) in the
 * same composer that creates it. Expand opens the record's page; a Rule has none, so it has no Expand.
 */
export function RecordEditor(props: {
  target: RecordEditTarget | null;
  crumb: string;
  cards: readonly WorkspaceWorkCard[];
  decisions: readonly WorkspaceDecision[];
  rules: readonly RecordEditRule[];
  docs: readonly WorkspaceDoc[];
  milestones: readonly WorkspaceMilestone[];
  components: readonly { path: string; title: string }[];
  /** Structure nodes, for the Context property. */
  nodes: readonly ScopeNodeItem[];
  onClose: () => void;
  onExpand: (target: RecordEditTarget) => void;
  onSaveCard: (slug: string, draft: CardDraft) => Promise<boolean>;
  onSaveDecision: (id: string, draft: KnowledgeEditDraft) => Promise<boolean>;
  onSaveDoc: (id: string, draft: KnowledgeEditDraft) => Promise<boolean>;
  onSaveRule: Save<RuleDraft>;
}) {
  const find = <T extends { id: string }>(kind: RecordEditKind, items: readonly T[]) =>
    props.target?.kind === kind ? items.find((item) => item.id === props.target!.id) ?? null : null;
  const card = () => (props.target?.kind === "card" ? props.cards.find((item) => item.slug === props.target!.id) ?? null : null);
  const decision = () => find("decision", props.decisions);
  const rule = () => find("rule", props.rules);
  const doc = () => find("doc", props.docs);
  const expand = () => {
    const target = props.target;
    if (target) props.onExpand(target);
  };

  return (
    <Switch>
      <Match when={card()}>
        {(item) => (
          <CardComposer
            open
            request={{ kind: "card" }}
            crumb={props.crumb}
            milestones={props.milestones}
            components={props.components}
            edit={{
              title: item().title,
              intent: item().intent,
              stage: item().stage,
              milestoneId: item().milestoneId ?? "",
              under: item().under,
              kind: item().kind,
            }}
            onClose={props.onClose}
            onExpand={expand}
            onCreate={(draft) => props.onSaveCard(item().slug, draft)}
          />
        )}
      </Match>
      <Match when={decision()}>
        {(item) => (
          <KnowledgeEditComposer
            crumb={props.crumb}
            label="decision"
            record={item()}
            scopeNodes={props.nodes}
            onClose={props.onClose}
            onExpand={expand}
            onSave={(draft) => props.onSaveDecision(item().id, draft)}
          />
        )}
      </Match>
      <Match when={doc()}>
        {(item) => (
          <KnowledgeEditComposer
            crumb={props.crumb}
            label="doc"
            record={item()}
            scopeNodes={props.nodes}
            onClose={props.onClose}
            onExpand={expand}
            onSave={(draft) => props.onSaveDoc(item().id, draft)}
          />
        )}
      </Match>
      <Match when={rule()}>
        {(item) => (
          <RuleFormDialog
            open
            mode="edit"
            scopeNodes={props.nodes}
            initial={{ ref: item().slug || item().id, statement: item().statement, scopeNodeIds: [...item().scopeNodeIds] }}
            onClose={props.onClose}
            onSubmit={props.onSaveRule}
          />
        )}
      </Match>
    </Switch>
  );
}
