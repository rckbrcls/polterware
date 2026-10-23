import { Show, type JSX } from "solid-js";
import { DetailPanel, Button, FileText } from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceEvidence } from "@polterware/feature-shell";
import { EditablePath } from "./editable-path";
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
        <DetailPanel.Content>
          <DetailPanel.Header />
          <KnowledgeDocumentShell
            title={props.note?.title ?? evidence().title}
            icon={<FileText size={16} />}
            bodyMarkdown={props.bodyMarkdown}
            onBodyChange={props.onBodyChange}
            onTitleChange={props.note?.onTitleChange}
            tags={props.note?.tags}
            tagSuggestions={props.note?.tagSuggestions}
            onTagsChange={props.note?.onTagsChange}
            properties={
              <DetailPanel.Properties variant="inline">
                <DetailPanel.Property
                  label="Path"
                  value={<EditablePath value={props.pathValue} onChange={props.onPathChange} />}
                />
                <Show when={props.onScopeChange}>
                  <DetailPanel.Property
                    label="Atlas scope"
                    value={
                      <ScopePicker
                        nodes={props.scopeNodes ?? []}
                        value={scopePathOf(props.scopeNodes ?? [], evidence().scopeNodeId)}
                        onChange={(path) => props.onScopeChange?.(path)}
                      />
                    }
                  />
                </Show>
              </DetailPanel.Properties>
            }
            footerActions={
              <Show when={props.onArchive}>
                <Button variant="danger" size="sm" onClick={() => props.onArchive?.()}>Archive</Button>
              </Show>
            }
            links={props.links}
          />
        </DetailPanel.Content>
      )}
    </Show>
  );
}
