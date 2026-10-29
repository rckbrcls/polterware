import { Show, type JSX } from "solid-js";
import {
  Button,
  Book03Icon,
  Select,
  StatusChip,
} from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceDecision } from "@polterware/feature-shell";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { KnowledgeDocumentShell, type EvidenceNoteProps } from "./knowledge-document-shell";
import { decisionStateTone } from "./library-row";
import { ScopePicker, scopePathOf } from "./scope-picker";

const STATE_LABEL: Record<WorkspaceDecision["state"], string> = {
  proposed: "Proposed",
  active: "Active",
  challenged: "Challenged",
  superseded: "Superseded",
};

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
  /** Structure nodes offered by the scope picker. */
  scopeNodes?: ScopeNodeItem[];
  /** Writes the Structure scope as a node path; empty clears it. */
  onScopeChange?: (path: string) => void;
  links?: JSX.Element;
  /** Note-style editing: editable title and tags, like Evidence and Notes. */
  note?: EvidenceNoteProps;
}) {
  const successors = () =>
    props.allDecisions.filter((other) => other.id !== props.decision.id && other.state !== "superseded");
  const canSupersede = () =>
    Boolean(props.onAction) && (props.decision.state === "active" || props.decision.state === "challenged") && successors().length > 0;
  return (
    <KnowledgeDocumentShell
      trail={["Truth", "Decisions"]}
      entityId={props.decision.id}
      title={props.note?.title ?? props.decision.title}
      onTitleChange={props.note?.onTitleChange}
      tags={props.note?.tags}
      tagSuggestions={props.note?.tagSuggestions}
      onTagsChange={props.note?.onTagsChange}
      icon={<Book03Icon size={32} />}
      bodyMarkdown={props.bodyMarkdown}
      onBodyChange={props.onBodyChange}
      properties={
        <>
          <KnowledgeDocumentProperty label="Status">
            <StatusChip tone={decisionStateTone(props.decision.state)}>{STATE_LABEL[props.decision.state]}</StatusChip>
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
          <KnowledgeDocumentProperty label="Scope">
            {props.decision.scope === "principle" ? "Principle (whole project)" : "Decision"}
          </KnowledgeDocumentProperty>
          <Show when={props.onScopeChange}>
            <KnowledgeDocumentProperty label="Structure scope">
              <ScopePicker
                nodes={props.scopeNodes ?? []}
                value={scopePathOf(props.scopeNodes ?? [], props.decision.scopeNodeId)}
                onChange={(path) => props.onScopeChange?.(path)}
                class="w-full min-w-0 max-w-[20rem]"
              />
            </KnowledgeDocumentProperty>
          </Show>
          <KnowledgeDocumentProperty label="Governs" mono show={props.decision.governs.length > 0}>
            {props.decision.governs.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Supersedes" show={props.decision.supersedes.length > 0}>
            {props.decision.supersedes.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Superseded by" show={Boolean(props.decision.supersededBy)}>
            {props.decision.supersededBy}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Supersede with" show={canSupersede()}>
            <Select
              aria-label="Supersede with"
              size="sm"
              class="w-full min-w-0 max-w-[20rem]"
              placeholder="Choose a decision…"
              options={successors().map((other) => ({ value: other.id, label: other.title }))}
              value=""
              onChange={(next) => {
                if (next) props.onAction?.({ kind: "supersede", byId: next });
              }}
            />
          </KnowledgeDocumentProperty>
        </>
      }
      links={props.links}
    />
  );
}
