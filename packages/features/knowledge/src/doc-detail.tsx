import { Show, type JSX } from "solid-js";
import { Button, Select } from "@polterware/frontend-design-system";
import type { DocType, ScopeNodeItem, WorkspaceDoc } from "@polterware/feature-shell";
import { DOC_TYPES, docTypeIcon, docTypeLabel, docTypeOptions } from "./doc-type";
import { EditablePath } from "./editable-path";
import { KnowledgeDocumentProperty } from "./knowledge-document-properties";
import { ScopePicker, scopePathOf } from "./scope-picker";
import { KnowledgeDocumentNotFound, KnowledgeDocumentShell, type DocNoteProps } from "./knowledge-document-shell";

/** One page for every doc: a markdown note with its type, tags, and an optional file path. */
export function DocDetail(props: {
  doc: WorkspaceDoc | null | undefined;
  bodyMarkdown: string;
  pathValue: string;
  note?: DocNoteProps;
  onBodyChange: (markdown: string) => void;
  onPathChange?: (path: string) => void;
  onDocTypeChange?: (docType: DocType) => void;
  onArchive?: () => void;
  scopeNodes?: ScopeNodeItem[];
  /** Writes the Structure scope as a node path; empty clears it. */
  onScopeChange?: (path: string) => void;
  links?: JSX.Element;
}) {
  return (
    <Show when={props.doc} fallback={<KnowledgeDocumentNotFound kindLabel="Doc" />}>
      {(doc) => (
        <KnowledgeDocumentShell
          trail={["Truth", "Docs"]}
          entityId={doc().id}
          title={props.note?.title ?? doc().title}
          icon={docTypeIcon(doc().docType, 32)}
          bodyMarkdown={props.bodyMarkdown}
          onBodyChange={props.onBodyChange}
          onTitleChange={props.note?.onTitleChange}
          tags={props.note?.tags}
          tagSuggestions={props.note?.tagSuggestions}
          onTagsChange={props.note?.onTagsChange}
          properties={
            <>
              <KnowledgeDocumentProperty label="Type">
                <Show when={props.onDocTypeChange} fallback={docTypeLabel(doc().docType)}>
                  <Select
                    options={docTypeOptions()}
                    value={doc().docType}
                    onChange={(value) => {
                      if (DOC_TYPES.some((type) => type.id === value) && value !== doc().docType) props.onDocTypeChange?.(value as DocType);
                    }}
                    aria-label="Doc type"
                    class="w-full min-w-0 max-w-[20rem]"
                  />
                </Show>
              </KnowledgeDocumentProperty>
              <KnowledgeDocumentProperty label="Path">
                <EditablePath value={props.pathValue} onChange={props.onPathChange} />
              </KnowledgeDocumentProperty>
              <Show when={props.onScopeChange}>
                <KnowledgeDocumentProperty label="Scope">
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
          links={props.links}
        />
      )}
    </Show>
  );
}
