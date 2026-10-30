import { Show, type JSX } from "solid-js";
import { Button } from "@polterware/frontend-design-system";
import type { ScopeNodeItem, WorkspaceDoc } from "@polterware/feature-shell";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { ScopePicker, scopePathOf } from "./scope-picker";
import { KnowledgeDocumentNotFound, KnowledgeDocumentShell, type DocNoteProps } from "./knowledge-document-shell";

/** One page for every doc: a markdown note with its scope and tags. */
export function DocDetail(props: {
  doc: WorkspaceDoc | null | undefined;
  bodyMarkdown: string;
  note?: DocNoteProps;
  onBodyChange: (markdown: string) => void;
  onArchive?: () => void;
  scopeNodes?: ScopeNodeItem[];
  /** Writes the Structure scope as a node path; empty clears it. */
  onScopeChange?: (path: string) => void;
}) {
  return (
    <Show when={props.doc} fallback={<KnowledgeDocumentNotFound kindLabel="Doc" />}>
      {(doc) => (
        <KnowledgeDocumentShell
          entityId={doc().id}
          title={props.note?.title ?? doc().title}
          bodyMarkdown={props.bodyMarkdown}
          onBodyChange={props.onBodyChange}
          onTitleChange={props.note?.onTitleChange}
          tags={props.note?.tags}
          tagSuggestions={props.note?.tagSuggestions}
          onTagsChange={props.note?.onTagsChange}
          properties={
            <>
              <Show when={props.onScopeChange}>
                <KnowledgeDocumentProperty label="About">
                  <ScopePicker
                    nodes={props.scopeNodes ?? []}
                    value={scopePathOf(props.scopeNodes ?? [], doc().scopeNodeId)}
                    onChange={(path) => props.onScopeChange?.(path)}
                    class="w-full min-w-0 max-w-[20rem]"
                  />
                </KnowledgeDocumentProperty>
              </Show>
            </>
          }
          footerActions={
            <Show when={props.onArchive}>
              <Button variant="texture" size="sm" onClick={() => props.onArchive?.()}>Archive</Button>
            </Show>
          }
        />
      )}
    </Show>
  );
}
