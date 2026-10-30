import { For, Match, Show, Switch, type JSX } from "solid-js";
import {
  FileText,
  IconTile,
  Layers,
  MarkdownEditor,
  Peek,
  PeekChip,
  Scale,
  ShieldCheck,
  StatusChip,
  Tag,
} from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceDecision, WorkspaceDoc, WorkspaceWorkCard } from "@polterware/feature-shell";
import { CardPeek } from "./card-peek";
import { DECISION_STATE_LABEL, decisionStateTone } from "./library-row";

export type RecordPeekKind = "card" | "decision" | "fact" | "doc";
export type RecordPeekTarget = { kind: RecordPeekKind; id: string };
/** A rule as the workspace lists it. */
export type RecordPeekFact = { id: string; statement: string; truthClass: string; scopeNodeIds: readonly string[] };

const TRUTH_LABEL: Record<string, string> = { declared: "Declared", observed: "Observed", inferred: "Inferred", verified: "Verified" };

/**
 * A quick look at a card, decision, rule, or doc from where it is cited (a Structure node's
 * sections), without leaving the page. Expand opens the record's page.
 */
export function RecordPeek(props: {
  target: RecordPeekTarget | null;
  cards: readonly WorkspaceWorkCard[];
  decisions: readonly WorkspaceDecision[];
  facts: readonly RecordPeekFact[];
  docs: readonly WorkspaceDoc[];
  /** Structure nodes, to name a record's contexts. */
  nodes: readonly ScopeNodeItem[];
  onClose: () => void;
  onExpand: (target: RecordPeekTarget) => void;
}) {
  const find = <T extends { id: string }>(kind: RecordPeekKind, items: readonly T[]) =>
    props.target?.kind === kind ? items.find((item) => item.id === props.target!.id) ?? null : null;
  const card = () => (props.target?.kind === "card" ? props.cards.find((item) => item.slug === props.target!.id) ?? null : null);
  const decision = () => find("decision", props.decisions);
  const fact = () => find("fact", props.facts);
  const doc = () => find("doc", props.docs);
  const expand = () => {
    const target = props.target;
    if (target) props.onExpand(target);
  };

  /** One chip per context, or Whole project when there is none. */
  const contexts = (ids: readonly string[]): JSX.Element => {
    const nodes = props.nodes.filter((node) => ids.includes(node.id));
    return (
      <Show when={nodes.length > 0} fallback={<PeekChip icon={<Layers />}>Whole project</PeekChip>}>
        <For each={nodes}>{(node) => <PeekChip icon={<Layers />} title={node.path}>{node.title}</PeekChip>}</For>
      </Show>
    );
  };
  const tile = (icon: JSX.Element, id: string) => <IconTile size={24} tone="neutral" seed={`peek-${id}`}>{icon}</IconTile>;
  const body = (markdown: string, label: string) => (
    <Show when={markdown.trim()}>
      <MarkdownEditor class="pw-md-editor--transcript" value={markdown} editable={false} aria-label={label} />
    </Show>
  );

  return (
    <Switch>
      <Match when={props.target?.kind === "card"}>
        <CardPeek card={card()} onClose={props.onClose} onOpen={expand} />
      </Match>
      <Match when={decision()}>
        {(item) => (
          <Peek
            open
            title={item().title}
            icon={tile(<Scale size={14} />, item().id)}
            kind={item().scopeNodeIds.length === 0 ? "Principle" : "Decision"}
            onClose={props.onClose}
            onOpen={expand}
            properties={<>
              <StatusChip tone={decisionStateTone(item().state)} label={DECISION_STATE_LABEL[item().state]} />
              {contexts(item().scopeNodeIds)}
            </>}
          >
            <Show when={item().summary.trim()}><p class="m-0">{item().summary}</p></Show>
            <Show when={item().state === "challenged" && item().statusReason}>
              {(reason) => <p class="m-0 text-[var(--color-text-muted)]">Under review: {reason()}</p>}
            </Show>
            {body(item().bodyMarkdown, "Decision")}
          </Peek>
        )}
      </Match>
      <Match when={fact()}>
        {(item) => (
          <Peek
            open
            title={item().statement || item().id}
            icon={tile(<ShieldCheck size={14} />, item().id)}
            kind="Rule"
            onClose={props.onClose}
            onOpen={expand}
            properties={<>
              <Show when={TRUTH_LABEL[item().truthClass]}>{(label) => <StatusChip tone="muted" label={label()} />}</Show>
              {contexts(item().scopeNodeIds)}
            </>}
          />
        )}
      </Match>
      <Match when={doc()}>
        {(item) => (
          <Peek
            open
            title={item().title}
            icon={tile(<FileText size={14} />, item().id)}
            kind="Doc"
            onClose={props.onClose}
            onOpen={expand}
            properties={<>
              {contexts(item().scopeNodeIds)}
              <For each={item().tags}>{(tag) => <PeekChip icon={<Tag />}>{tag}</PeekChip>}</For>
            </>}
          >
            <Show when={item().summary.trim()}><p class="m-0">{item().summary}</p></Show>
            {body(item().bodyMarkdown, "Doc")}
          </Peek>
        )}
      </Match>
    </Switch>
  );
}
