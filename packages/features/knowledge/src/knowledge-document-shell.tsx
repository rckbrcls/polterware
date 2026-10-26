import type { JSX } from "solid-js";
import { Show, createMemo } from "solid-js";
import { AuroraCover, auroraForId, Button, ChevronLeft, DetailPanel, InformationCircle, Input, MarkdownEditor, TagPicker } from "@polterware/frontend-design-system";
import { EntityDocumentCanvas, requestDetailExpanded } from "@polterware/feature-shell";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import { KnowledgeDocumentProperties } from "./knowledge-document-properties";
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
  /** Stable entity identity for the cover and title field. */
  entityId: string;
  title: string;
  /** Entity icon rendered at 32px in the cover and in the properties header. */
  icon: JSX.Element;
  bodyMarkdown: string;
  /** Omit for documents whose content is edited through another workflow. */
  onBodyChange?: (md: string) => void;
  tabs?: JSX.Element;
  /** Shared Property rows, rendered only in the global details card. */
  properties?: JSX.Element;
  links?: JSX.Element;
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
  const propertiesOpen = createDetailPanelSelector(state => state.open);
  const tagOptions = createMemo(() =>
    [...new Set([...(props.tagSuggestions ?? []), ...(props.tags ?? [])])].map(name => ({ id: name, name })),
  );
  let editor: HTMLDivElement | undefined;

  return <Show when={props.entityId} keyed>{entityId => <>
    <EntityDocumentCanvas>
      <DetailPanel.Body class="pw-detail-panel__body--fixed h-full min-h-0">
        <DetailPanel.Main class="flex min-w-0 min-h-0 flex-1 flex-col overflow-y-auto !p-3">
          <div class="relative shrink-0">
            <AuroraCover palette={auroraForId(entityId)} seed={entityId} class="!h-28 !rounded-[var(--radius-surface)]" />
            <span class="absolute bottom-3 left-4 inline-flex text-[var(--color-bg)]" aria-hidden="true">{props.icon}</span>
          </div>
          <div class="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-4 pb-4 pt-4">
            <div class="flex items-center justify-between gap-3">
              <Button variant="icon" aria-label="Back" title="Back" onClick={() => requestDetailExpanded(false)}><ChevronLeft size={14} /></Button>
              <div class="flex shrink-0 items-center gap-2">
                <Show when={props.status}><span role="status" aria-live="polite" class="text-xs text-[var(--color-text-muted)]">{props.status}</span></Show>
                <Button variant="icon" data-detail-opener aria-label={propertiesOpen() ? "Hide properties" : "Show properties"}
                  aria-expanded={propertiesOpen()} title={propertiesOpen() ? "Hide properties" : "Show properties"}
                  onClick={() => detailPanelStore.getState().toggle()}><InformationCircle size={14} /></Button>
              </div>
            </div>
            <Show when={props.tabs}>{props.tabs}</Show>
            <Show when={props.onTitleChange} fallback={<h1 class="m-0 pl-8 text-[36px] font-semibold leading-tight text-[var(--color-text-primary)]">{props.title}</h1>}>
              <Input aria-label="Title" placeholder="Untitled" class="!h-auto !border-0 !bg-transparent !bg-none !pl-8 !pr-0 !py-1 !text-[36px] !font-semibold !leading-tight !shadow-none !outline-none !ring-0 focus:!outline-none focus-visible:!outline-none focus-visible:!shadow-none focus-visible:!ring-0 focus:!border-0"
                id={`document-title-${entityId}`} value={props.title} onInput={event => props.onTitleChange?.(event.currentTarget.value)}
                onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); editor?.querySelector<HTMLElement>(".ProseMirror")?.focus(); } }} />
            </Show>
            <Show when={props.onTagsChange}>
              <div class="pl-8"><TagPicker tags={tagOptions()} selectedIds={props.tags ?? []}
                onChange={ids => props.onTagsChange?.(ids)} onCreate={async name => name.trim() || undefined} /></div>
            </Show>
            <div ref={editor} class="pw-note-editor flex min-h-0 flex-1 flex-col [&_.pw-md-editor]:min-h-0 [&_.pw-md-editor__surface]:flex [&_.pw-md-editor__surface]:flex-col [&_.ProseMirror]:flex-1 [&_.ProseMirror]:!outline-none [&_.ProseMirror]:!shadow-none [&_.ProseMirror:focus-visible]:!outline-none" classList={{ "pl-8": !props.onBodyChange }}>
              <MarkdownEditor value={props.bodyMarkdown} onChange={props.onBodyChange} editable={Boolean(props.onBodyChange)}
                placeholder="Write in Markdown…" aria-label={`${props.title} body`} />
            </div>
            {props.children}
          </div>
        </DetailPanel.Main>
      </DetailPanel.Body>
    </EntityDocumentCanvas>
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body layout="document"><DetailPanel.Main class="!px-4 !pb-4 !pt-4">
        <DetailPanel.Title title={props.title || "Untitled"} />
        <KnowledgeDocumentProperties properties={props.properties} links={props.links} metadataActions={props.metadataActions} footerActions={props.footerActions} />
      </DetailPanel.Main></DetailPanel.Body>
    </DetailPanel.Content>
  </>}</Show>;
}

export function KnowledgeDocumentNotFound(props: { kindLabel: string; title?: string }) {
  return <EntityDocumentCanvas>
    <div class="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-4">
      <Button variant="icon" class="self-start" aria-label="Back" title="Back" onClick={() => requestDetailExpanded(false)}><ChevronLeft size={14} /></Button>
      <h1 class="m-0 text-[36px] font-semibold leading-tight">{props.title ?? `${props.kindLabel} not found`}</h1>
      <p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">This {props.kindLabel.toLowerCase()} is not available in the current project knowledge set. It may have been archived or the link is stale.</p>
    </div>
  </EntityDocumentCanvas>;
}
