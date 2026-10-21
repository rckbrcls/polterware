import type { JSX } from "solid-js";
import { Show, createMemo } from "solid-js";
import { DetailPanel, Input, MarkdownEditor, TagPicker } from "@polterware/frontend-design-system";
import { createDetailPanelSelector } from "@polterware/frontend-state";
import "./knowledge-document.css";

/** Note-style editing for an Evidence item: editable title and tags. */
export type EvidenceNoteProps = {
  title?: string;
  onTitleChange?: (title: string) => void;
  tags?: readonly string[];
  tagSuggestions?: readonly string[];
  onTagsChange?: (tags: string[]) => void;
};

export function KnowledgeDocumentShell(props: {
  title: string;
  icon?: JSX.Element;
  bodyMarkdown: string;
  onBodyChange: (md: string) => void;
  /** Artifact switcher rendered above the title (Spec features). */
  tabs?: JSX.Element;
  /** Inline `DetailPanel.Properties` rendered under the title. */
  properties?: JSX.Element;
  /** `DetailPanel.LinkedEntities` rendered under the properties. */
  links?: JSX.Element;
  /** Commands associated with document metadata. */
  metadataActions?: JSX.Element;
  /** Destructive or document-wide commands after the editor. */
  footerActions?: JSX.Element;
  /** When set, the title is an editable note-style field instead of a heading. */
  onTitleChange?: (title: string) => void;
  /** Tags shown as removable badges when `onTagsChange` is set. */
  tags?: readonly string[];
  /** Tags already used by other items, offered when adding a tag. */
  tagSuggestions?: readonly string[];
  onTagsChange?: (tags: string[]) => void;
}) {
  // Format dock only when the detail sidebar is expanded (full writing surface).
  const expanded = createDetailPanelSelector((state) => state.expanded);
  const showFormatToolbar = () => expanded();
  // Tags are plain strings, so a tag's name doubles as its id in the picker.
  const tagOptions = createMemo(() =>
    [...new Set([...(props.tagSuggestions ?? []), ...(props.tags ?? [])])].map((name) => ({ id: name, name })),
  );

  return (
    <DetailPanel.Body layout="document">
      <div class="pw-knowledge-doc">
        <div class="pw-knowledge-doc__body">
          <div class="pw-knowledge-doc__column">
            <Show when={props.tabs}>
              <div class="pw-knowledge-doc__tabs">{props.tabs}</div>
            </Show>
            <header class="pw-knowledge-doc__header">
              <DetailPanel.Title icon={props.icon} title={
                <Show when={props.onTitleChange} fallback={props.title}>
                  <Input
                    aria-label="Title"
                    placeholder="Untitled"
                    class="pw-knowledge-doc__title-input"
                    value={props.title}
                    onInput={(event) => props.onTitleChange?.(event.currentTarget.value)}
                  />
                </Show>
              } />
              <Show when={props.onTagsChange}>
                <TagPicker
                  tags={tagOptions()}
                  selectedIds={props.tags ?? []}
                  onChange={(ids) => props.onTagsChange?.(ids)}
                  onCreate={async (name) => name.trim() || undefined}
                />
              </Show>
              <Show when={props.properties || props.links}>
                <div class="pw-knowledge-doc__meta">
                  {props.properties}
                  {props.links}
                </div>
              </Show>
              <Show when={props.metadataActions}>
                <div class="pw-detail-panel__actions">{props.metadataActions}</div>
              </Show>
            </header>
            <MarkdownEditor
              value={props.bodyMarkdown}
              onChange={props.onBodyChange}
              showToolbar={showFormatToolbar()}
              placeholder="Write in Markdown…"
              aria-label={`${props.title} body`}
            />
            <Show when={props.footerActions}>
              <div class="pw-detail-panel__actions mt-4">{props.footerActions}</div>
            </Show>
          </div>
        </div>
      </div>
    </DetailPanel.Body>
  );
}

export function KnowledgeDocumentNotFound(props: {
  kindLabel: string;
  title?: string;
}) {
  const title = () => props.title ?? `${props.kindLabel} not found`;
  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body layout="document">
        <div class="pw-knowledge-doc">
          <div class="pw-knowledge-doc__body">
            <div class="pw-knowledge-doc__column">
              <DetailPanel.Title title={title()} />
              <p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">
                This {props.kindLabel.toLowerCase()} is not available in the current project knowledge
                set. It may have been archived or the link is stale.
              </p>
            </div>
          </div>
        </div>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}
