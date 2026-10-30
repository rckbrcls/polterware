import type { JSX } from "solid-js";
import { Show, createMemo } from "solid-js";
import { Button, ChevronLeft, RailPage, Input, MarkdownEditor, TagPicker } from "@polterware/frontend-design-system";
import { EntityDocumentCanvas, requestPageBack } from "@polterware/feature-shell";
import { DocumentActivity } from "./document-activity";
import { KnowledgeDocumentProperties } from "./knowledge-document-properties";
import "./knowledge-document.css";

/** Note-style editing for a doc: editable title and tags. */
export type DocNoteProps = {
  title?: string;
  onTitleChange?: (title: string) => void;
  tags?: readonly string[];
  tagSuggestions?: readonly string[];
  onTagsChange?: (tags: string[]) => void;
};

/**
 * Full-page Markdown document, organized like a Linear issue: a 44px header with Back,
 * a 654px text column (24px title, 15/24 prose) and a 376px properties rail on the right.
 */
export function KnowledgeDocumentShell(props: {
  /** Stable entity identity for the title field. */
  entityId: string;
  /** The id changes record for this entity, when it differs from `entityId` (a card's id, not its slug). */
  activitySubjectId?: string;
  title: string;
  /** Omit for documents without a body, such as a Fact. */
  bodyMarkdown?: string;
  /** Omit for documents whose content is edited through another workflow. */
  onBodyChange?: (md: string) => void;
  tabs?: JSX.Element;
  /** Shared Property rows, rendered in the properties rail. */
  properties?: JSX.Element;
  /** More rail groups after Links (`RailGroup`), such as a card's tasks and invariants. */
  railGroups?: JSX.Element;
  metadataActions?: JSX.Element;
  footerActions?: JSX.Element;
  /** Additional document content, such as structured Work tasks. */
  children?: JSX.Element;
  status?: JSX.Element;
  onTitleChange?: (title: string) => void;
  tags?: readonly string[];
  tagSuggestions?: readonly string[];
  onTagsChange?: (tags: string[]) => void;
}) {
  const tagOptions = createMemo(() =>
    [...new Set([...(props.tagSuggestions ?? []), ...(props.tags ?? [])])].map(name => ({ id: name, name })),
  );
  let editor: HTMLDivElement | undefined;

  return <Show when={props.entityId} keyed>{entityId => <EntityDocumentCanvas>
    <RailPage
      onBack={requestPageBack}
      status={props.status}
      rail={<KnowledgeDocumentProperties properties={props.properties} groups={props.railGroups} metadataActions={props.metadataActions} footerActions={props.footerActions}
        labels={props.onTagsChange ? <TagPicker tags={tagOptions()} selectedIds={props.tags ?? []}
          onChange={ids => props.onTagsChange?.(ids)} onCreate={async name => name.trim() || undefined} /> : undefined} />}
    >
      <Show when={props.tabs}>{props.tabs}</Show>
      <Show when={props.onTitleChange} fallback={<h1 class="pw-document__title">{props.title}</h1>}>
        <Input aria-label="Title" placeholder="Untitled" class="pw-document__title"
          id={`document-title-${entityId}`} value={props.title} onInput={event => props.onTitleChange?.(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); editor?.querySelector<HTMLElement>(".ProseMirror")?.focus(); } }} />
      </Show>
      <Show when={props.bodyMarkdown !== undefined}>
        <div ref={editor} class="pw-document__body">
          <MarkdownEditor class="pw-md-editor--document" value={props.bodyMarkdown ?? ""} onChange={props.onBodyChange} editable={Boolean(props.onBodyChange)}
            placeholder="Add a description…" aria-label={`${props.title} body`} />
        </div>
      </Show>
      {props.children}
      <DocumentActivity subjectId={props.activitySubjectId || entityId} />
    </RailPage>
  </EntityDocumentCanvas>}</Show>;
}

export function KnowledgeDocumentNotFound(props: { kindLabel: string; title?: string }) {
  return <EntityDocumentCanvas>
    <div class="pw-document">
      <header class="pw-document__header">
        <div class="pw-document__trail">
          <Button size="icon" variant="texture" aria-label="Back" onClick={requestPageBack}><ChevronLeft size={14} /></Button>
        </div>
      </header>
      <div class="pw-document__scroll">
        <div class="pw-document__column">
          <h1 class="pw-document__title">{props.title ?? `${props.kindLabel} not found`}</h1>
          <p class="m-0 text-[13px] text-[var(--color-text-muted)]">This {props.kindLabel.toLowerCase()} is not available in the current project knowledge set. It may have been archived or the link is stale.</p>
        </div>
      </div>
    </div>
  </EntityDocumentCanvas>;
}
