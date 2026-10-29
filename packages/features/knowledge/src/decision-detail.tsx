import { Show, type JSX } from "solid-js";
import {
  Button,
  Book03Icon,
  Select,
  StatusChip,
} from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceVerdict } from "@polterware/feature-shell";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { KnowledgeDocumentShell, type EvidenceNoteProps } from "./knowledge-document-shell";
import { decisionStateTone } from "./library-row";
import { ScopePicker, scopePathOf } from "./scope-picker";

const STATE_LABEL: Record<WorkspaceVerdict["state"], string> = {
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
  verdict: WorkspaceVerdict;
  /** Every Verdict in the project; superseding picks among the ones still in force. */
  allVerdicts: WorkspaceVerdict[];
  bodyMarkdown: string;
  onBodyChange: (md: string) => void;
  onAction?: (action: DecisionAction) => void;
  /** Atlas nodes offered by the scope picker. */
  scopeNodes?: ScopeNodeItem[];
  /** Writes the Atlas scope as a node path; empty clears it. */
  onScopeChange?: (path: string) => void;
  links?: JSX.Element;
  /** Note-style editing: editable title and tags, like Evidence and Notes. */
  note?: EvidenceNoteProps;
}) {
  const successors = () =>
    props.allVerdicts.filter((other) => other.id !== props.verdict.id && other.state !== "superseded");
  const canSupersede = () =>
    Boolean(props.onAction) && (props.verdict.state === "active" || props.verdict.state === "challenged") && successors().length > 0;
  return (
    <KnowledgeDocumentShell
      trail={["Truth", "Decisions"]}
      entityId={props.verdict.id}
      title={props.note?.title ?? props.verdict.title}
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
            <StatusChip tone={decisionStateTone(props.verdict.state)}>{STATE_LABEL[props.verdict.state]}</StatusChip>
            <Show when={props.onAction}>
              <Show when={props.verdict.state === "proposed"}>
                <Button variant="secondary" size="sm" onClick={() => props.onAction?.({ kind: "activate" })}>Activate</Button>
              </Show>
              <Show when={props.verdict.state === "active"}>
                <Button variant="ghost" size="sm" onClick={() => props.onAction?.({ kind: "challenge" })}>Open review</Button>
              </Show>
              <Show when={props.verdict.state === "challenged"}>
                <Button variant="ghost" size="sm" onClick={() => props.onAction?.({ kind: "reactivate" })}>Keep active</Button>
              </Show>
            </Show>
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Reason" show={Boolean(props.verdict.statusReason)}>
            {props.verdict.statusReason}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Review when" show={Boolean(props.verdict.reviewTrigger)}>
            {props.verdict.reviewTrigger}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Scope">
            {props.verdict.scope === "principle" ? "Principle (whole project)" : "Decision"}
          </KnowledgeDocumentProperty>
          <Show when={props.onScopeChange}>
            <KnowledgeDocumentProperty label="Atlas scope">
              <ScopePicker
                nodes={props.scopeNodes ?? []}
                value={scopePathOf(props.scopeNodes ?? [], props.verdict.scopeNodeId)}
                onChange={(path) => props.onScopeChange?.(path)}
                class="w-full min-w-0 max-w-[20rem]"
              />
            </KnowledgeDocumentProperty>
          </Show>
          <KnowledgeDocumentProperty label="Governs" mono show={props.verdict.governs.length > 0}>
            {props.verdict.governs.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Supersedes" show={props.verdict.supersedes.length > 0}>
            {props.verdict.supersedes.join(", ")}
          </KnowledgeDocumentProperty>
          <KnowledgeDocumentProperty label="Superseded by" show={Boolean(props.verdict.supersededBy)}>
            {props.verdict.supersededBy}
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
