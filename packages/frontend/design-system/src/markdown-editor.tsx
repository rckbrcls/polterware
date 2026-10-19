import {
  For,
  Show,
  createEffect,
  createUniqueId,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { Portal, render } from "solid-js/web";
import { Popover as ArkPopover } from "@ark-ui/solid/popover";
import { MenuItem, MenuList, MenuPanel } from "./menu";
import { createPopupMotion } from "./popup-motion";
import { createPanelPortalOwnership } from "./panel-interaction";
import "./popover.css";
import { Editor, Node as TiptapNode } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { marked } from "marked";
import TurndownService from "turndown";
import {
  Heading02Icon,
  FileText,
  FileUp,
  PlusIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  ListChecks,
  MinusSignIcon,
  QuoteDownIcon,
  SourceCodeIcon,
  TextBoldIcon,
  TextItalicIcon,
} from "./hugeicons";
import "./markdown-editor.css";

export type MarkdownEditorProps = {
  value: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Show selection formatting controls when editable. Defaults to true. */
  showToolbar?: boolean;
  class?: string;
  "aria-label"?: string;
  /** Renders the card of an embedded attachment block. Enables the block in the editor. */
  renderAttachment?: (id: string, block: { remove: () => void }) => JSX.Element;
  /** Opens a file picker and resolves the new attachment ids, which are inserted as blocks. */
  onPickAttachments?: () => Promise<string[]>;
  /** Handles files dropped or pasted into the text and resolves the new attachment ids. */
  onAttachFiles?: (files: File[]) => Promise<string[]>;
  /** More slash-menu entries that produce attachments (e.g. record audio, add link). */
  attachmentActions?: { id: string; label: string; icon?: (props: { size?: number }) => JSX.Element; run: () => Promise<string[]> }[];
};

const ATTACHMENT_SCHEME = "notes-attachment:";

/** Block ids embedded as `![attachment](notes-attachment:ID)`; marked wraps them in a paragraph. */
function adoptAttachments(html: string): string {
  if (!html.includes(ATTACHMENT_SCHEME)) return html;
  return html.replace(
    /<p>\s*<img src="notes-attachment:([^"]+)"[^>]*>\s*<\/p>/g,
    (_match, id: string) => `<div data-attachment-id="${id}"></div>`,
  );
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

marked.setOptions({ gfm: true, breaks: false });

turndown.addRule("attachmentBlock", {
  filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-attachment-id"),
  replacement: (_content, node) =>
    `\n\n![attachment](${ATTACHMENT_SCHEME}${(node as HTMLElement).getAttribute("data-attachment-id")})\n\n`,
});


// GFM task lists: `- [ ] item` <-> TipTap taskList/taskItem.
turndown.addRule("taskItem", {
  // Current TipTap marks task items with data-checked only; the taskList parent carries the type.
  filter: (node) => node.nodeName === "LI" && (node.getAttribute("data-type") === "taskItem" || node.hasAttribute("data-checked") ||
    node.parentElement?.getAttribute("data-type") === "taskList"),
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    return `- [${checked ? "x" : " "}] ${content.trim().replace(/\n+/g, " ")}\n`;
  },
});

/** marked renders task lines as `<li><input type=checkbox>`; TipTap expects data-type attributes. */
function adoptTaskLists(html: string): string {
  if (!html.includes('type="checkbox"')) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll('li > input[type="checkbox"], li > p:first-child > input[type="checkbox"]').forEach((input) => {
    const item = input.closest("li");
    if (!item) return;
    item.setAttribute("data-type", "taskItem");
    item.setAttribute("data-checked", (input as HTMLInputElement).checked || input.hasAttribute("checked") ? "true" : "false");
    item.parentElement?.setAttribute("data-type", "taskList");
    input.remove();
  });
  return template.innerHTML;
}

/** Atom block holding one attachment id; the host renders the card, Markdown keeps the reference. */
function attachmentBlock(renderCard: (id: string, block: { remove: () => void }) => JSX.Element) {
  return TiptapNode.create({
    name: "attachmentBlock",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes: () => ({ id: { default: "" } }),
    parseHTML: () => [{
      tag: "div[data-attachment-id]",
      getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-attachment-id") ?? "" }),
    }],
    renderHTML: ({ node }) => ["div", { "data-attachment-id": node.attrs.id }],
    addNodeView: () => ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.className = "pw-md-editor__attachment";
      dom.contentEditable = "false";
      dom.setAttribute("data-attachment-id", node.attrs.id);
      const remove = () => {
        const pos = getPos();
        if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      };
      const dispose = render(() => renderCard(node.attrs.id, { remove }), dom);
      return { dom, destroy: dispose };
    },
  });
}

function isStringValue(value: string | Promise<string>): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function markdownToHtml(markdown: string): string {
  const raw = markdown?.trim() ? markdown : "";
  const html = marked.parse(raw, { async: false });
  return isStringValue(html) && html.length > 0 ? adoptAttachments(adoptTaskLists(html)) : "<p></p>";
}

function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";
  return turndown.turndown(html).trim();
}

type ToolbarAction = {
  id: string;
  label: string;
  group: "format" | "structure" | "insert";
  /** Hugeicon renderer, or omit when using `text`. */
  icon?: (props: { size?: number }) => JSX.Element;
  /** Compact text label (e.g. H1 / H2 / H3). */
  text?: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
};

/**
 * List wrapping fails when the current block cannot nest in a list item
 * (heading, code block, etc.). Normalize to a paragraph first, then toggle.
 */
function toggleList(
  editor: Editor,
  kind: "bulletList" | "orderedList",
): void {
  const chain = editor.chain().focus();
  if (
    editor.isActive("heading") ||
    editor.isActive("codeBlock") ||
    editor.isActive("blockquote")
  ) {
    chain.clearNodes();
  }
  if (kind === "bulletList") {
    chain.toggleBulletList().run();
  } else {
    chain.toggleOrderedList().run();
  }
}

function headingAction(level: 1 | 2 | 3): ToolbarAction {
  return {
    id: `h${level}`,
    label: `Heading ${level}`,
    group: "structure",
    text: `H${level}`,
    icon: (p) => <Heading02Icon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().toggleHeading({ level }).run(),
    active: (e) => e.isActive("heading", { level }),
  };
}

const TOOLBAR: ToolbarAction[] = [
  {
    id: "bold",
    label: "Bold",
    group: "format",
    icon: (p) => <TextBoldIcon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    id: "italic",
    label: "Italic",
    group: "format",
    icon: (p) => <TextItalicIcon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  headingAction(1),
  headingAction(2),
  headingAction(3),
  {
    id: "bullet",
    label: "Bullet list",
    group: "structure",
    icon: (p) => <LeftToRightListBulletIcon size={p.size ?? 14} />,
    run: (e) => toggleList(e, "bulletList"),
    active: (e) => e.isActive("bulletList"),
  },
  {
    id: "ordered",
    label: "Numbered list",
    group: "structure",
    icon: (p) => <LeftToRightListNumberIcon size={p.size ?? 14} />,
    run: (e) => toggleList(e, "orderedList"),
    active: (e) => e.isActive("orderedList"),
  },
  {
    id: "task",
    label: "Checklist",
    group: "structure",
    icon: (p) => <ListChecks size={p.size ?? 14} />,
    run: (e) => {
      const chain = e.chain().focus();
      if (e.isActive("heading") || e.isActive("codeBlock") || e.isActive("blockquote")) chain.clearNodes();
      chain.toggleTaskList().run();
    },
    active: (e) => e.isActive("taskList"),
  },
  {
    id: "code",
    label: "Code block",
    group: "insert",
    icon: (p) => <SourceCodeIcon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive("codeBlock"),
  },
  {
    id: "quote",
    label: "Quote",
    group: "insert",
    icon: (p) => <QuoteDownIcon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
  {
    id: "hr",
    label: "Divider",
    group: "insert",
    icon: (p) => <MinusSignIcon size={p.size ?? 14} />,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

const PARAGRAPH: ToolbarAction = {
  id: "paragraph",
  label: "Paragraph",
  group: "structure",
  icon: (p) => <FileText size={p.size ?? 14} />,
  run: (e) => e.chain().focus().clearNodes().setParagraph().run(),
};
const BLOCK_ACTIONS = [PARAGRAPH, ...TOOLBAR.filter((action) => action.group !== "format")];
const SELECTION_ACTIONS = TOOLBAR.filter((action) => !["ordered", "hr"].includes(action.id));
type AnchorRect = { x: number; y: number; width: number; height: number };

/** Ark owns placement, outside dismissal and presence; editor keeps typing focus. */
function EditorPopup(props: {
  rect: AnchorRect;
  host: HTMLElement | undefined;
  placement: "top" | "bottom-start";
  onClose: () => void;
  children: JSX.Element;
}) {
  const motion = createPopupMotion();
  const ownPortal = createPanelPortalOwnership(() => true);
  return (
    <ArkPopover.Root open autoFocus={false} modal={false} portalled
      onOpenChange={(details) => { if (!details.open) props.onClose(); }}
      persistentElements={[() => props.host ?? null]}
      positioning={{ placement: props.placement, gutter: 8, flip: true,
        getAnchorRect: () => props.rect }}>
      <Portal>
        <ArkPopover.Positioner class="pw-popover-positioner">
          <ArkPopover.Content ref={ownPortal} class="pw-popover-presence outline-none">
            <div ref={motion.ref}>{props.children}</div>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </Portal>
    </ArkPopover.Root>
  );
}

const GROUPS: Array<ToolbarAction["group"]> = ["format", "structure", "insert"];

/**
 * Markdown-backed rich text editor for Knowledge documents.
 * TipTap core (no React). Storage SSOT is Markdown; HTML is the live view.
 * Block insertion and selection formatting share the same commands.
 */
export function MarkdownEditor(props: MarkdownEditorProps): JSX.Element {
  let host: HTMLDivElement | undefined;
  let root: HTMLDivElement | undefined;
  const menuId = createUniqueId();
  const [slash, setSlash] = createSignal<{ from: number; to: number; query: string; rect: AnchorRect; inserted?: boolean }>();
  const [selectionRect, setSelectionRect] = createSignal<AnchorRect>();
  const [hover, setHover] = createSignal<{ pos: number; top: number }>();
  const [activeRow, setActiveRow] = createSignal(0);
  let dismissedSlash: number | undefined;
  let selectionDismissed = false;
  const attachmentAction = (): ToolbarAction[] => props.onPickAttachments && props.renderAttachment ? [{
    id: "attachment",
    label: "Attachment",
    group: "insert",
    icon: (p) => <FileUp size={p.size ?? 14} />,
    run: (e) => { void props.onPickAttachments!().then((ids) => insertAttachments(e, ids)); },
  }, ...(props.attachmentActions ?? []).map((action): ToolbarAction => ({
    id: action.id,
    label: action.label,
    group: "insert",
    icon: action.icon ?? ((p) => <FileUp size={p.size ?? 14} />),
    run: (e) => { void action.run().then((ids) => insertAttachments(e, ids)); },
  }))] : [];
  const filteredActions = () => [...BLOCK_ACTIONS, ...attachmentAction()].filter((action) =>
    `${action.label} ${action.id}`.toLowerCase().includes(slash()?.query.toLowerCase() ?? ""));
  let lastEmitted = props.value ?? "";
  const [editor, setEditor] = createSignal<Editor | undefined>();
  /** Bumps so toolbar active states recompute after transactions. */
  const [tick, setTick] = createSignal(0);

  const isEditable = () => props.editable !== false;
  const showToolbar = () => isEditable() && props.showToolbar !== false;

  onMount(() => {
    if (!host) return;
    const instance = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            HTMLAttributes: { class: "pw-md-editor__link" },
          },
          listKeymap: false,
          trailingNode: false,
          underline: false,
        }),
        TaskList,
        TaskItem.configure({ nested: false }),
        ...(props.renderAttachment ? [attachmentBlock((id, block) => props.renderAttachment!(id, block))] : []),
        Placeholder.configure({
          placeholder: props.placeholder ?? "Start writing…",
        }),
      ],
      content: markdownToHtml(props.value ?? ""),
      editable: isEditable(),
      onUpdate: ({ editor: ed }) => {
        const md = htmlToMarkdown(ed.getHTML());
        setTick((n) => n + 1);
        // Ignore no-op updates (e.g. setEditable emitting update, or identical round-trips).
        if (md === lastEmitted) return;
        lastEmitted = md;
        props.onChange?.(md);
      },
      onSelectionUpdate: () => setTick((n) => n + 1),
      editorProps: {
        handleDrop: (_view, event) => attachFiles(event.dataTransfer?.files, event),
        handlePaste: (_view, event) => attachFiles(event.clipboardData?.files, event),
        handleKeyDown: (_view, event) => {
          if (!slash() || event.isComposing) return false;
          if (event.key === "Escape") {
            closeSlash();
            return true;
          }
          const actions = filteredActions();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (actions.length) setActiveRow((row) => (row + (event.key === "ArrowDown" ? 1 : -1) + actions.length) % actions.length);
            return true;
          }
          const action = actions[activeRow()];
          if (event.key === "Enter" && action) {
            chooseBlock(action);
            return true;
          }
          return false;
        },
        attributes: {
          class: "pw-md-editor__prose",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": props["aria-label"] ?? "Document body",
        },
      },
    });
    // TipTap HTML round-trip may differ from the Markdown prop; adopt that baseline
    // without notifying the parent (avoids autosave / change-envelope on open).
    lastEmitted = htmlToMarkdown(instance.getHTML());
    setEditor(instance);
    instance.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) setHover(undefined);
      selectionDismissed = false;
      syncOverlays();
    });
    const syncSelection = () => { selectionDismissed = false; syncOverlays(); };
    const reposition = () => { setHover(undefined); syncOverlays(); };
    document.addEventListener("selectionchange", syncSelection);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    onCleanup(() => {
      document.removeEventListener("selectionchange", syncSelection);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    });
    setTick(1);
  });

  createEffect(() => {
    const next = props.value ?? "";
    const ed = editor();
    if (!ed) return;
    if (next === lastEmitted) return;
    const current = htmlToMarkdown(ed.getHTML());
    if (current === next) {
      lastEmitted = next;
      return;
    }
    ed.commands.setContent(markdownToHtml(next), { emitUpdate: false });
    lastEmitted = htmlToMarkdown(ed.getHTML());
  });

  createEffect(() => {
    // TipTap setEditable defaults to emitUpdate: true, which would fire onChange on mount.
    editor()?.setEditable(isEditable(), false);
    if (!isEditable()) { setSlash(undefined); setSelectionRect(undefined); setHover(undefined); }
  });

  createEffect(() => {
    const dom = editor()?.view.dom;
    const session = slash();
    const action = filteredActions()[activeRow()];
    if (!dom) return;
    if (session) {
      dom.setAttribute("aria-controls", menuId);
      dom.setAttribute("aria-expanded", "true");
      dom.setAttribute("aria-haspopup", "listbox");
      if (action) dom.setAttribute("aria-activedescendant", `${menuId}-${action.id}`);
      else dom.removeAttribute("aria-activedescendant");
    } else {
      for (const attribute of ["aria-controls", "aria-expanded", "aria-haspopup", "aria-activedescendant"]) dom.removeAttribute(attribute);
    }
    document.getElementById(`${menuId}-${action?.id}`)?.scrollIntoView({ block: "nearest" });
  });

  onCleanup(() => {
    const ed = editor();
    ed?.destroy();
    setEditor(undefined);
  });

  function runAction(action: ToolbarAction) {
    const ed = editor();
    if (!ed || !isEditable()) return;
    action.run(ed);
    setTick((n) => n + 1);
  }

  function isActive(action: ToolbarAction): boolean {
    void tick();
    const ed = editor();
    if (!ed || !action.active) return false;
    return action.active(ed);
  }

  function closeSlash() {
    dismissedSlash = slash()?.from;
    setSlash(undefined);
  }

  function syncOverlays() {
    const ed = editor();
    if (!ed || !isEditable()) return;
    const { from, to, empty, $from } = ed.state.selection;
    const domSelection = window.getSelection();
    const ownsSelection = !!domSelection?.anchorNode && ed.view.dom.contains(domSelection.anchorNode)
      && !!domSelection.focusNode && ed.view.dom.contains(domSelection.focusNode);
    if (!ownsSelection) { setSelectionRect(undefined); closeSlash(); return; }
    const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
    const match = empty && !ed.isActive("codeBlock") ? /(?:^|\n)\/([^\s/]*)$/.exec(text) : null;
    const session = slash();
    if (empty && session?.inserted && $from.start() === session.from && /^[^\s/]*$/.test(text)) {
      const rect = ed.view.coordsAtPos(from);
      if (session.query !== text) setActiveRow(0);
      setSlash({ ...session, to: from, query: text, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
    } else if (match) {
      const query = match[1] ?? "";
      const start = from - query.length - 1;
      if (dismissedSlash !== start) {
        const rect = ed.view.coordsAtPos(from);
        if (slash()?.query !== query) setActiveRow(0);
        setSlash({ from: start, to: from, query, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
      }
    } else {
      dismissedSlash = undefined;
      setSlash(undefined);
    }
    if (empty || slash() || selectionDismissed || !ed.state.doc.textBetween(from, to).trim()) {
      setSelectionRect(undefined);
    } else {
      if (!domSelection?.rangeCount) return;
      const rect = domSelection.getRangeAt(0).getBoundingClientRect();
      setSelectionRect({ x: rect.left, y: rect.top, width: rect.width, height: 0 });
    }
  }

  function insertAttachments(ed: Editor, ids: string[]) {
    if (!ids.length || !isEditable()) return;
    ed.chain().focus().insertContent(ids.map((id) => ({ type: "attachmentBlock", attrs: { id } }))).run();
  }

  function attachFiles(list: FileList | null | undefined, event: Event): boolean {
    const files = list ? [...list] : [];
    if (!files.length || !props.onAttachFiles || !props.renderAttachment) return false;
    event.preventDefault();
    void props.onAttachFiles(files).then((ids) => { const ed = editor(); if (ed) insertAttachments(ed, ids); });
    return true;
  }

  function chooseBlock(action: ToolbarAction) {
    const ed = editor();
    const session = slash();
    if (!ed || !session || !isEditable()) return;
    closeSlash();
    ed.chain().focus().deleteRange({ from: session.from, to: session.to }).run();
    action.run(ed);
  }

  function insertBlock() {
    const ed = editor();
    const block = hover();
    if (!ed || !block || !isEditable()) return;
    const node = ed.state.doc.nodeAt(block.pos);
    if (!node) return;
    const pos = block.pos + node.nodeSize;
    dismissedSlash = undefined;
    ed.chain().focus().insertContentAt(pos, { type: "paragraph" }).setTextSelection(pos + 1).run();
    const rect = ed.view.coordsAtPos(pos + 1);
    setActiveRow(0);
    setSelectionRect(undefined);
    setSlash({ from: pos + 1, to: pos + 1, query: "", inserted: true, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
    setHover(undefined);
  }

  function trackBlock(event: PointerEvent) {
    const ed = editor();
    if (!ed || !root || !host || !isEditable() || slash()) return;
    if (event.target instanceof Element && event.target.closest(".pw-md-editor__add")) return;
    const bounds = root.getBoundingClientRect();
    const prose = ed.view.dom;
    let pos = 0;
    for (const child of Array.from(prose.children)) {
      const node = ed.state.doc.nodeAt(pos);
      if (!node) break;
      const rect = child.getBoundingClientRect();
      const next = child.nextElementSibling?.getBoundingClientRect();
      const bottom = next ? (rect.bottom + next.top) / 2 : rect.bottom + 16;
      if (event.clientY >= rect.top - 12 && event.clientY <= bottom) {
        // Center the 28px handle on the block's first line, not on the block's top edge.
        const style = getComputedStyle(child);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.65 || 23;
        setHover({ pos, top: rect.top - bounds.top + (line - 28) / 2 });
        return;
      }
      pos += node.nodeSize;
    }
    setHover(undefined);
  }

  return (
    <div ref={root}
      class={`pw-md-editor ${props.class ?? ""}`}
      data-editable={isEditable() ? "true" : "false"}
      onPointerMove={trackBlock}
      onPointerLeave={() => setHover(undefined)}
    >
      <div ref={(el) => { host = el; }} class="pw-md-editor__surface" />
      <Show when={isEditable() && hover()}>{(block) => <>
        <button type="button" class="pw-md-editor__tool pw-md-editor__add"
          style={{ top: `${block().top}px` }} aria-label="Insert block below"
          onMouseDown={(event) => event.preventDefault()} onClick={insertBlock}><PlusIcon size={14} /></button>
      </>}</Show>
      <Show when={isEditable() && slash()}>{(session) =>
        <EditorPopup rect={session().rect} host={host} placement="bottom-start" onClose={closeSlash}>
          <MenuPanel class="pw-md-editor__slash">
            <MenuList>
              <div id={menuId} role="listbox" aria-label="Block type">
                <For each={filteredActions()}>{(action, index) => {
                  const Icon = action.icon!;
                  return <MenuItem tabIndex={-1} role="option" id={`${menuId}-${action.id}`}
                    selected={activeRow() === index()} aria-selected={activeRow() === index()}
                    onPointerMove={() => setActiveRow(index())}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseBlock(action)}>
                    <Icon size={14} /><span>{action.label}</span>
                  </MenuItem>;
                }}</For>
                <Show when={!filteredActions().length}><div class="pw-md-editor__no-results">No matching blocks</div></Show>
              </div>
            </MenuList>
          </MenuPanel>
        </EditorPopup>
      }</Show>
      <Show when={showToolbar() && selectionRect()}>{(rect) =>
        <EditorPopup rect={rect()} host={host} placement="top"
          onClose={() => { selectionDismissed = true; setSelectionRect(undefined); }}>
          <div class="pw-md-editor__toolbar menu-panel" role="toolbar" aria-label="Formatting">
            <For each={GROUPS}>{(group) =>
              <div class="pw-md-editor__group" data-group={group}>
                <For each={SELECTION_ACTIONS.filter((action) => action.group === group)}>{(action) => {
                  const Icon = action.icon;
                  return <button type="button" class="pw-md-editor__tool"
                    data-kind={action.text ? "text" : "icon"}
                    data-active={isActive(action) ? "true" : "false"}
                    aria-label={action.label} aria-pressed={isActive(action)} title={action.label}
                    onMouseDown={(event) => event.preventDefault()} onClick={() => runAction(action)}>
                    <Show when={action.text} fallback={Icon ? <Icon size={14} /> : null}>
                      <span class="pw-md-editor__tool-text">{action.text}</span>
                    </Show>
                  </button>;
                }}</For>
              </div>
            }</For>
          </div>
        </EditorPopup>
      }</Show>
    </div>
  );
}
