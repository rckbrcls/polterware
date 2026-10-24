import { Show, type JSX } from "solid-js";
import { Button, FileText } from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceEvidence } from "@polterware/feature-shell";
import { EditablePath } from "./editable-path";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { ScopePicker, scopePathOf } from "./scope-picker";
import { KnowledgeDocumentNotFound, KnowledgeDocumentShell, type EvidenceNoteProps } from "./knowledge-document-shell";

/** One page for every Evidence item: a markdown note with tags and an optional file path. */
export function EvidenceDetail(props: {
  evidence: WorkspaceEvidence | null | undefined;
  bodyMarkdown: string;
  pathValue: string;
  note?: EvidenceNoteProps;
  onBodyChange: (markdown: string) => void;
  onPathChange?: (path: string) => void;
  onArchive?: () => void;
  scopeNodes?: ScopeNodeItem[];
  /** Writes the Atlas scope as a node path; empty clears it. */
  onScopeChange?: (path: string) => void;
  links?: JSX.Element;
}) {
  return (
    <Show when={props.evidence} fallback={<KnowledgeDocumentNotFound kindLabel="Evidence" />}>
      {(evidence) => (
        <KnowledgeDocumentShell
          entityId={evidence().id}
          title={props.note?.title ?? evidence().title}
          icon={<FileText size={32} />}
          bodyMarkdown={props.bodyMarkdown}
          onBodyChange={props.onBodyChange}
          onTitleChange={props.note?.onTitleChange}
          tags={props.note?.tags}
          tagSuggestions={props.note?.tagSuggestions}
          onTagsChange={props.note?.onTagsChange}
          properties={
            <>
              <KnowledgeDocumentProperty label="Path">
                <EditablePath value={props.pathValue} onChange={props.onPathChange} />
              </KnowledgeDocumentProperty>
              <Show when={props.onScopeChange}>
                <KnowledgeDocumentProperty label="Atlas scope">
                  <ScopePicker
                    nodes={props.scopeNodes ?? []}
                    value={scopePathOf(props.scopeNodes ?? [], evidence().scopeNodeId)}
                    onChange={(path) => props.onScopeChange?.(path)}
                    class="w-full min-w-0 max-w-[20rem]"
                  />
                </KnowledgeDocumentProperty>
              </Show>
            </>
          }
          footerActions={
            <Show when={props.onArchive}>
              <Button variant="danger" size="sm" onClick={() => props.onArchive?.()}>Archive</Button>
            </Show>
          }
          links={props.links}
        />
      )}
    </Show>
  );
}
