import { Show, type JSX } from "solid-js";
import { Scale,
  Button,
  Select,
  StatusChip,
} from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceDecision } from "@polterware/feature-shell";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { KnowledgeDocumentShell, type DocNoteProps } from "./knowledge-document-shell";
import { DECISION_STATE_LABEL, decisionStateTone } from "./library-row";
import { ContextPicker } from "./scope-picker";

/** A lifecycle move the detail panel asks the host to write. */
export type DecisionAction =
  | { kind: "activate" }
  | { kind: "challenge" }
  | { kind: "reactivate" }
  | { kind: "supersede"; byId: string };

export function DecisionDetail(props: {
  decision: WorkspaceDecision;
  /** Every Decision in the project; superseding picks among the ones still in force. */
  allDecisions: WorkspaceDecision[];
  bodyMarkdown: string;
  onBodyChange: (md: string) => void;
  onAction?: (action: DecisionAction) => void;
  /** Structure nodes offered as contexts. */
  scopeNodes?: ScopeNodeItem[];
  /** Writes the contexts as node ids; none makes the decision a principle. */
  onScopeChange?: (ids: string[]) => void;
  /** Note-style editing: editable title and tags, like docs and Notes. */
  note?: DocNoteProps;
}) {
  const successors = () =>
    props.allDecisions.filter((other) => other.id !== props.decision.id && other.state !== "superseded");
  const canSupersede = () =>
    Boolean(props.onAction) && (props.decision.state === "active" || props.decision.state === "challenged") && successors().length > 0;
  return (
    <KnowledgeDocumentShell
      entityId={props.decision.id}
      title={props.note?.title ?? props.decision.title}
      onTitleChange={props.note?.onTitleChange}
      tags={props.note?.tags}
      tagSuggestions={props.note?.tagSuggestions}
      onTagsChange={props.note?.onTagsChange}
      bodyMarkdown={props.bodyMarkdown}
      onBodyChange={props.onBodyChange}
      properties={
        <>
          <KnowledgeDocumentProperty label="Status">
            <StatusChip tone={decisionStateTone(props.decision.state)}>{DECISION_STATE_LABEL[props.decision.state]}</StatusChip>
            <Show when={props.onAction}>
              <Show when={props.decision.state === "proposed"}>
                <Button variant="secondary" size="sm" onClick={() => props.onAction?.({ kind: "activate" })}>Activate</Button>
              </Show>
              <Show when={props.decision.state === "active"}>
                <Button variant="ghost" size="sm" onClick={() => props.onAction?.({ kind: "challenge" })}>Open review</Button>
              </Show>
              <Show when={props.decision.state === "challenged"}>
                <Button variant="ghost" size="sm" onClick={() => props.onAction?.({ kind: "reactivate" })}>Keep active</Button>
              </Show>
            </Show>
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Reason" show={Boolean(props.decision.statusReason)}>
            {props.decision.statusReason}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Review when" show={Boolean(props.decision.reviewTrigger)}>
            {props.decision.reviewTrigger}
          </KnowledgeDocumentProperty>
          <Show when={props.onScopeChange}>
            <KnowledgeDocumentProperty label="About">
              <ContextPicker
                nodes={props.scopeNodes ?? []}
                values={props.decision.scopeNodeIds}
                onChange={(ids) => props.onScopeChange?.(ids)}
              />
            </KnowledgeDocumentProperty>
          </Show>
          <KnowledgeDocumentProperty label="Governs" mono show={props.decision.governs.length > 0}>
            {props.decision.governs.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Replaces" show={props.decision.supersedes.length > 0}>
            {props.decision.supersedes.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Replaced by" show={Boolean(props.decision.supersededBy)}>
            {props.decision.supersededBy}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Replace with" show={canSupersede()}>
            <Select
              aria-label="Replace with"
              size="sm"
              class="w-full min-w-0 max-w-[20rem]"
              placeholder="Choose a decision…"
              options={successors().map((other) => ({ value: other.id, label: other.title, icon: <Scale size={12} /> }))}
              value=""
              onChange={(next) => {
                if (next) props.onAction?.({ kind: "supersede", byId: next });
              }}
            />
          </KnowledgeDocumentProperty>
        </>
      }
    />
  );
}
