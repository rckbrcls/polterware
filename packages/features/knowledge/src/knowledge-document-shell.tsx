import type { JSX } from "solid-js";
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Breadcrumb, Button, ChevronLeft, Input, MarkdownEditor, SidebarRightIcon, TagPicker, useDesignSystem } from "@polterware/frontend-design-system";
import { EntityDocumentCanvas, requestDetailExpanded, requestSectionNavigate } from "@polterware/feature-shell";
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

/** A step of the header trail: a link to the section (and tab) the document sits in. */
export type DocumentCrumb = { label: string; section: string; tab?: string };

/** Below this page width the properties rail leaves the row and opens as a drawer. */
const NARROW_WIDTH = 900;

function readRailPreference(key: string | undefined): boolean {
  if (!key) return true;
  try {
    return localStorage.getItem(key) !== "hidden";
  } catch {
    return true;
  }
}

function writeRailPreference(key: string | undefined, open: boolean) {
  if (!key) return;
  try {
    localStorage.setItem(key, open ? "open" : "hidden");
  } catch {
    // Storage may be unavailable; the rail still toggles for this page.
  }
}

/**
 * Full-page Markdown document, organized like a Linear issue: a 44px header with the trail,
 * a 654px text column (24px title, 15/24 prose) and a 376px properties rail on the right.
 */
export function KnowledgeDocumentShell(props: {
  /** Stable entity identity for the title field. */
  entityId: string;
  title: string;
  /** Entity icon, shown at 16px before the title in the header trail. */
  icon: JSX.Element;
  /** Surface path before the title in the header, e.g. Truth › Docs; each step is a link. */
  trail?: readonly DocumentCrumb[];
  /** Omit for documents without a body, such as a Fact. */
  bodyMarkdown?: string;
  /** Omit for documents whose content is edited through another workflow. */
  onBodyChange?: (md: string) => void;
  tabs?: JSX.Element;
  /** Shared Property rows, rendered in the properties rail. */
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
  const railKey = useDesignSystem().storageKey("document.rail");
  const [railOpen, setRailOpen] = createSignal(readRailPreference(railKey));
  const [narrow, setNarrow] = createSignal(false);
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const railVisible = () => narrow() ? drawerOpen() : railOpen();
  const tagOptions = createMemo(() =>
    [...new Set([...(props.tagSuggestions ?? []), ...(props.tags ?? [])])].map(name => ({ id: name, name })),
  );
  let root: HTMLDivElement | undefined;
  let editor: HTMLDivElement | undefined;

  onMount(() => {
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setNarrow(entry.contentRect.width < NARROW_WIDTH); });
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });

  function toggleRail() {
    if (narrow()) {
      setDrawerOpen(open => !open);
      return;
    }
    const next = !railOpen();
    setRailOpen(next);
    writeRailPreference(railKey, next);
  }

  return <Show when={props.entityId} keyed>{entityId => <EntityDocumentCanvas>
    <div ref={root} class="pw-document" data-narrow={narrow() ? "true" : undefined}>
      <header class="pw-document__header">
        <div class="pw-document__trail">
          <Button size="icon" variant="texture" aria-label="Back" onClick={() => requestDetailExpanded(false)}><ChevronLeft size={14} /></Button>
        </div>
        <Breadcrumb
          class="pw-document__crumbs"
          items={(props.trail ?? []).map(crumb => ({ label: crumb.label, onSelect: () => requestSectionNavigate(crumb.section, crumb.tab) }))}
          icon={props.icon}
          current={props.title || "Untitled"}
        />
        <div class="pw-document__actions">
          <Show when={props.status}><span role="status" aria-live="polite" class="pw-document__status">{props.status}</span></Show>
          <Button size="icon" variant="icon" aria-label={railVisible() ? "Hide properties" : "Show properties"}
            aria-expanded={railVisible()} selected={railVisible()} onClick={toggleRail}><SidebarRightIcon size={14} /></Button>
        </div>
      </header>
      <div class="pw-document__scroll">
        <div class="pw-document__column">
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
        </div>
        <Show when={railVisible()}>
          <aside class="pw-document__rail" aria-label="Properties">
            <KnowledgeDocumentProperties properties={props.properties} links={props.links} metadataActions={props.metadataActions} footerActions={props.footerActions}
              labels={props.onTagsChange ? <TagPicker tags={tagOptions()} selectedIds={props.tags ?? []}
                onChange={ids => props.onTagsChange?.(ids)} onCreate={async name => name.trim() || undefined} /> : undefined} />
          </aside>
        </Show>
      </div>
    </div>
  </EntityDocumentCanvas>}</Show>;
}

export function KnowledgeDocumentNotFound(props: { kindLabel: string; title?: string }) {
  return <EntityDocumentCanvas>
    <div class="pw-document">
      <header class="pw-document__header">
        <div class="pw-document__trail">
          <Button size="icon" variant="texture" aria-label="Back" onClick={() => requestDetailExpanded(false)}><ChevronLeft size={14} /></Button>
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
