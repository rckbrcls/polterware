import {
  For,
  Show,
  createEffect,
  createMemo,
  createUniqueId,
  createSignal,
  on,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { Portal, render } from "solid-js/web";
import { Popover as ArkPopover } from "@ark-ui/solid/popover";
import { MenuItem, MenuList, MenuPanel } from "./menu";
import { createPopupMotion } from "./popup-motion";
import { createPanelPortalOwnership } from "./panel-interaction";
import { FluidHoverHighlight, type ItemRect } from "./fluid-hover";
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

const isAttachmentBlock = (node: Node) => node.nodeName === "DIV" && (node as HTMLElement).hasAttribute("data-attachment-id");
const attachmentMarkdown = (node: Node) =>
  `\n\n![attachment](${ATTACHMENT_SCHEME}${(node as HTMLElement).getAttribute("data-attachment-id")})\n\n`;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  hr: "---",
  // Turndown sends empty elements to this replacement before any rule runs, and an
  // attachment block is always empty: without this every save dropped its reference.
  blankReplacement: (_content, node) =>
    isAttachmentBlock(node) ? attachmentMarkdown(node) : (node as { isBlock?: boolean }).isBlock ? "\n\n" : "",
});

marked.setOptions({ gfm: true, breaks: false });

turndown.addRule("attachmentBlock", {
  filter: (node) => isAttachmentBlock(node),
  replacement: (_content, node) => attachmentMarkdown(node),
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

/** Markdown to the HTML the editor loads. Exported for tests; not part of the package index. */
export function markdownToHtml(markdown: string): string {
  const raw = markdown?.trim() ? markdown : "";
  const html = marked.parse(raw, { async: false });
  return isStringValue(html) && html.length > 0 ? adoptAttachments(adoptTaskLists(html)) : "<p></p>";
}

/** Editor HTML back to stored Markdown. Exported for tests; not part of the package index. */
export function htmlToMarkdown(html: string): string {
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
type SlashSession = { from: number; to: number; query: string; rect: AnchorRect; inserted?: boolean };
type BlockHover = { pos: number; top: number; item: boolean; rect: ItemRect };

// Overlay signals compare by value: every selectionchange, transaction, scroll and resize
// re-derives them, and an equal value must not re-run the effects and rows that read them.
const sameAnchor = (a: AnchorRect | undefined, b: AnchorRect | undefined) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
const sameSlash = (a: SlashSession | undefined, b: SlashSession | undefined) =>
  a === b || (!!a && !!b && a.from === b.from && a.to === b.to && a.query === b.query
    && !!a.inserted === !!b.inserted && sameAnchor(a.rect, b.rect));
const sameHover = (a: BlockHover | undefined, b: BlockHover | undefined) =>
  a === b || (!!a && !!b && a.pos === b.pos && a.top === b.top && a.item === b.item
    && a.rect.top === b.rect.top && a.rect.left === b.rect.left && a.rect.width === b.rect.width && a.rect.height === b.rect.height);

const SLASH_HIGHLIGHT = "pw-md-slash";
type HighlightRegistry = { get: (name: string) => unknown; set: (name: string, value: unknown) => void; delete: (name: string) => boolean };
/** CSS Custom Highlight API, when the engine has it; the slash mark is skipped otherwise. */
function highlightApi(): { registry: HighlightRegistry; Highlight: new (range: Range) => unknown } | undefined {
  const registry = (globalThis.CSS as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const Highlight = (globalThis as { Highlight?: new (range: Range) => unknown }).Highlight;
  return registry && Highlight ? { registry, Highlight } : undefined;
}

/** A row's top and bottom in its scroll container's content space (transform-immune offsets). */
function offsetWithin(element: HTMLElement, container: HTMLElement): { top: number; bottom: number } | undefined {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== container) {
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== container) top += parent.clientTop;
    node = parent;
  }
  return node === container ? { top, bottom: top + element.offsetHeight } : undefined;
}

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
  // A press in the popup's padding or headings keeps the caret (and the keyboard) in the
  // editor. A press on a scrollbar is left alone, so dragging it still scrolls the list.
  const keepEditorFocus = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.clientWidth > 0 && event.offsetX >= target.clientWidth) return;
    event.preventDefault();
  };
  return (
    <ArkPopover.Root open autoFocus={false} modal={false} portalled
      onOpenChange={(details) => { if (!details.open) props.onClose(); }}
      persistentElements={[() => props.host ?? null]}
      positioning={{ placement: props.placement, gutter: 8, flip: true,
        getAnchorRect: () => props.rect }}>
      <Portal>
        <ArkPopover.Positioner class="pw-popover-positioner">
          <ArkPopover.Content ref={ownPortal} class="pw-popover-presence outline-none">
            <div ref={motion.ref} onMouseDown={keepEditorFocus}>{props.children}</div>
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
  const [slash, setSlash] = createSignal<SlashSession | undefined>(undefined, { equals: sameSlash });
  const [selectionRect, setSelectionRect] = createSignal<AnchorRect | undefined>(undefined, { equals: sameAnchor });
  /** The block (or list item) under the pointer: its position, handle offset and box in the editor. */
  const [hover, setHover] = createSignal<BlockHover | undefined>(undefined, { equals: sameHover });
  const [activeRow, setActiveRow] = createSignal(0);
  /** The slash listbox; its `MenuList` ancestor is the only element the menu ever scrolls. */
  let listbox: HTMLDivElement | undefined;
  const slashScroller = () => listbox?.closest<HTMLElement>(".pw-md-editor__slash-list") ?? undefined;
  /** Last pointer position over a row: rows sliding under a still pointer (a scroll) must not steal the keyboard row. */
  let rowPointer = "";
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
  // A string memo: re-anchoring the menu (new `slash()` objects) must not rebuild its rows.
  const slashQuery = createMemo(() => slash()?.query.toLowerCase() ?? "");
  const filteredActions = createMemo(() => [...BLOCK_ACTIONS, ...attachmentAction()].filter((action) =>
    `${action.label} ${action.id}`.toLowerCase().includes(slashQuery())));
  /** Slash entries grouped under muted headings; `index` is the position in the flat keyboard order. */
  const slashSections = createMemo(() => {
    const sections = [{ label: "Text", items: [] as { action: ToolbarAction; index: number }[] }, { label: "Lists", items: [] }, { label: "Insert", items: [] }];
    filteredActions().forEach((action, index) => {
      const section = ["bullet", "ordered", "task"].includes(action.id) ? 1
        : ["code", "quote", "hr"].includes(action.id) || action.id.startsWith("attachment") || action.group === "insert" ? 2 : 0;
      sections[section]!.items.push({ action, index });
    });
    return sections.filter((section) => section.items.length);
  });
  const slashOpen = createMemo(() => !!slash());
  const activeAction = createMemo(() => filteredActions()[activeRow()]);
  const optionId = (index: number) => `${menuId}-option-${index}`;
  let lastEmitted = props.value ?? "";
  const [editor, setEditor] = createSignal<Editor | undefined>();
  /** Bumps so toolbar active states recompute after transactions. */
  const [tick, setTick] = createSignal(0);

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copiedTimer));

  /** Code blocks draw a "Copy" label in CSS (`pre::after`); a click in that corner copies the block. */
  function copyCodeBlock(event: MouseEvent) {
    if (!(event.target instanceof Element) || !host) return;
    const pre = event.target.closest("pre");
    if (!pre || !host.contains(pre)) return;
    const rect = pre.getBoundingClientRect();
    if (event.clientX < rect.right - 64 || event.clientY > rect.top + 32) return;
    void navigator.clipboard?.writeText(pre.textContent ?? "").then(() => {
      host?.setAttribute("data-code-copied", "true");
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => host?.removeAttribute("data-code-copied"), 1500);
    }).catch(() => {});
  }

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
          // An IME composition owns its keys (Enter commits the candidate, arrows pick one).
          if (!slash() || event.isComposing || event.keyCode === 229) return false;
          if (event.key === "Escape") {
            closeSlash();
            return true;
          }
          if (event.altKey || event.ctrlKey || event.metaKey) return false;
          const actions = filteredActions();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (actions.length) {
              const row = (Math.min(activeRow(), actions.length - 1) + (event.key === "ArrowDown" ? 1 : -1) + actions.length) % actions.length;
              setActiveRow(row);
              revealRow(row);
            }
            return true;
          }
          const action = activeAction();
          // Enter and Tab pick the active row; with no match Enter types a new line as usual.
          if ((event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) && action) {
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
    const reposition = (event: Event) => {
      // Only a scroller that carries the editor moves its anchors; the slash list or any
      // unrelated list scrolling (they are not ancestors of the editor) is ignored.
      const target = event.target;
      if (event.type === "scroll" && target !== document && !(target instanceof Node && root && target.contains(root))) return;
      setHover(undefined);
      syncOverlays();
    };
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

  // The text being filtered is marked like the slash-menu reference: a highlight over "/query",
  // or a "Type to filter..." pill where an inserted empty block will receive the new content.
  // Keyed on the span only, so caret moves and re-anchoring do not rebuild the range.
  const slashSpan = createMemo(() => {
    const session = slash();
    return session && session.to > session.from ? `${session.from}:${session.to}` : "";
  });
  createEffect(() => {
    const span = slashSpan();
    const ed = editor();
    const api = highlightApi();
    if (!span || !ed || !api) return;
    const session = slash()!;
    let mark: unknown;
    try {
      const start = ed.view.domAtPos(session.from);
      const end = ed.view.domAtPos(session.to);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      mark = new api.Highlight(range);
      api.registry.set(SLASH_HIGHLIGHT, mark);
    } catch {
      return;
    }
    // The registry is global: only remove the mark this editor set, never another instance's.
    onCleanup(() => { if (api.registry.get(SLASH_HIGHLIGHT) === mark) api.registry.delete(SLASH_HIGHLIGHT); });
  });
  const ghost = createMemo((previous: { left: number; top: number; height: number } | undefined) => {
    const session = slash();
    const ed = editor();
    if (!session?.inserted || session.to > session.from || !ed) return undefined;
    try {
      const coords = ed.view.coordsAtPos(session.from);
      const next = { left: coords.left, top: coords.top, height: coords.bottom - coords.top };
      return previous && previous.left === next.left && previous.top === next.top && previous.height === next.height ? previous : next;
    } catch {
      return undefined;
    }
  });

  // While the slash menu is open the page behind it stays put. Each scroller that carries
  // the editor is frozen with `overflow: hidden` (wheel listeners would make the menu's own
  // scrolling janky); `scrollbar-gutter: stable` keeps a classic scrollbar's width so the
  // page does not reflow under the anchor. Closing restores each style and scroll offset.
  createEffect(() => {
    if (!slashOpen() || !host) return;
    const frozen: { node: HTMLElement; overflow: string; gutter: string; top: number }[] = [];
    const freeze = (node: HTMLElement) => {
      frozen.push({ node, overflow: node.style.overflowY, gutter: node.style.scrollbarGutter, top: node.scrollTop });
      node.style.scrollbarGutter = "stable";
      node.style.overflowY = "hidden";
    };
    const page = (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
    for (let node: HTMLElement | null = host; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && node.scrollHeight > node.clientHeight) freeze(node);
    }
    if (page.scrollHeight > page.clientHeight) freeze(page);
    onCleanup(() => {
      for (const { node, overflow, gutter, top } of frozen) {
        // Another lock (a Dialog closing meanwhile) may own the style now; leave it be.
        if (node.style.overflowY !== "hidden") continue;
        node.style.overflowY = overflow;
        node.style.scrollbarGutter = gutter;
        if (node.scrollTop !== top) node.scrollTop = top;
      }
    });
  });

  // A new menu session or query starts at the first row, scrolled to the top.
  createEffect(on([slashOpen, slashQuery], () => {
    setActiveRow(0);
    rowPointer = "";
    const list = slashScroller();
    if (list) list.scrollTop = 0;
  }));

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
    // An outside value (another document loaded into this editor) is not an edit: undo must
    // never bring the previous document back into this one.
    ed.chain().setMeta("addToHistory", false).setContent(markdownToHtml(next), { emitUpdate: false }).run();
    lastEmitted = htmlToMarkdown(ed.getHTML());
  });

  createEffect(() => {
    // TipTap setEditable defaults to emitUpdate: true, which would fire onChange on mount.
    editor()?.setEditable(isEditable(), false);
    if (!isEditable()) {
      dismissedSlash = undefined;
      setSlash(undefined);
      setSelectionRect(undefined);
      setHover(undefined);
    }
  });

  // The textbox announces the menu it controls. No scrolling here: an effect also runs on
  // open, while Ark still parks the popup above the viewport, and `scrollIntoView` there
  // scrolled the page to it. Keyboard moves reveal their row in `revealRow`.
  const activeOptionId = createMemo(() => (slashOpen() && activeAction() ? optionId(activeRow()) : ""));
  createEffect(() => {
    const dom = editor()?.view.dom;
    const open = slashOpen();
    const active = activeOptionId();
    if (!dom) return;
    if (open) {
      dom.setAttribute("aria-controls", menuId);
      dom.setAttribute("aria-expanded", "true");
      dom.setAttribute("aria-haspopup", "listbox");
      if (active) dom.setAttribute("aria-activedescendant", active);
      else dom.removeAttribute("aria-activedescendant");
    }
    onCleanup(() => {
      for (const attribute of ["aria-controls", "aria-expanded", "aria-haspopup", "aria-activedescendant"]) dom.removeAttribute(attribute);
    });
  });

  /** Keeps the keyboard row visible by moving the list's own `scrollTop`, never an ancestor's. */
  function revealRow(index: number) {
    const list = slashScroller();
    const row = document.getElementById(optionId(index));
    if (!list || !row) return;
    if (index === 0) { list.scrollTop = 0; return; }
    // The first row of a section brings its heading along.
    const section = row.closest<HTMLElement>(".pw-md-editor__slash-section");
    const first = section?.querySelector('[role="option"]') === row;
    const box = offsetWithin(row, list);
    const head = first && section ? offsetWithin(section, list) : undefined;
    if (!box) return;
    const top = head?.top ?? box.top;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (box.bottom > list.scrollTop + list.clientHeight) list.scrollTop = box.bottom - list.clientHeight;
  }

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
      setSlash({ ...session, to: from, query: text, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
    } else if (match) {
      const query = match[1] ?? "";
      const start = from - query.length - 1;
      if (dismissedSlash !== start) {
        const rect = ed.view.coordsAtPos(from);
        setSlash({ from: start, to: from, query, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
      } else {
        setSlash(undefined);
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
    if (block.item) {
      // A list item gets an empty sibling right below it; typing continues the list.
      const attrs = node.type.name === "taskItem" ? { checked: false } : undefined;
      ed.chain().focus().insertContentAt(pos, { type: node.type.name, attrs, content: [{ type: "paragraph" }] }).setTextSelection(pos + 2).run();
      setHover(undefined);
      return;
    }
    ed.chain().focus().insertContentAt(pos, { type: "paragraph" }).setTextSelection(pos + 1).run();
    const rect = ed.view.coordsAtPos(pos + 1);
    setSelectionRect(undefined);
    setSlash({ from: pos + 1, to: pos + 1, query: "", inserted: true, rect: { x: rect.left, y: rect.bottom, width: 0, height: 0 } });
    setHover(undefined);
  }

  /** Top-level blocks in order, with list items standing in for their list. */
  function blockTargets(ed: Editor) {
    const targets: { element: Element; pos: number; item: boolean }[] = [];
    let pos = 0;
    for (const child of Array.from(ed.view.dom.children)) {
      const node = ed.state.doc.nodeAt(pos);
      if (!node) break;
      if (["bulletList", "orderedList", "taskList"].includes(node.type.name)) {
        let itemPos = pos + 1;
        const items = Array.from(child.children).filter((element) => element.nodeName === "LI");
        node.forEach((item, _offset, index) => {
          const element = items[index];
          if (element) targets.push({ element, pos: itemPos, item: true });
          itemPos += item.nodeSize;
        });
      } else {
        targets.push({ element: child, pos, item: false });
      }
      pos += node.nodeSize;
    }
    return targets;
  }

  function trackBlock(event: PointerEvent) {
    const ed = editor();
    if (!ed || !root || !host || !isEditable() || slash()) return;
    // Portalled popups bubble here through Solid's delegation; a pointer over them is not over a block.
    if (!(event.target instanceof Node) || !root.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".pw-md-editor__add")) return;
    const bounds = root.getBoundingClientRect();
    const targets = blockTargets(ed);
    for (const [index, target] of targets.entries()) {
      const rect = target.element.getBoundingClientRect();
      const next = targets[index + 1]?.element.getBoundingClientRect();
      const bottom = next ? (rect.bottom + next.top) / 2 : rect.bottom + 16;
      if (event.clientY >= rect.top - 12 && event.clientY <= bottom) {
        if (hover()?.pos === target.pos) return;
        // Center the 28px handle on the block's first line, not on the block's top edge.
        const style = getComputedStyle(target.element);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.65 || 23;
        const top = rect.top - bounds.top;
        const left = rect.left - bounds.left - 6;
        setHover({ pos: target.pos, top: top + (line - 28) / 2, item: target.item,
          rect: { top: top - 2, left, width: Math.min(rect.width + 12, bounds.width - left), height: rect.height + 4 } });
        return;
      }
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
      <Show when={isEditable()}>
        <FluidHoverHighlight rect={hover()?.rect ?? null} targetKey={hover()?.pos ?? null} class="pw-md-editor__block-hover" />
      </Show>
      <div ref={(el) => { host = el; }} class="pw-md-editor__surface" onClick={copyCodeBlock} />
      <Show when={isEditable() && hover()}>{(block) => <>
        <button type="button" class="pw-md-editor__tool pw-md-editor__add"
          style={{ top: `${block().top}px` }} aria-label={block().item ? "Insert item below" : "Insert block below"}
          onMouseDown={(event) => event.preventDefault()} onClick={insertBlock}><PlusIcon size={14} /></button>
      </>}</Show>
      <Show when={ghost()}>{(box) =>
        <Portal><div class="pw-md-editor__slash-ghost" aria-hidden="true"
          style={{ left: `${box().left - 4}px`, top: `${box().top - 2}px`, height: `${box().height + 4}px` }}>Type to filter…</div></Portal>
      }</Show>
      <Show when={isEditable() && slash()}>{(session) =>
        <EditorPopup rect={session().rect} host={host} placement="bottom-start" onClose={closeSlash}>
          <MenuPanel class="pw-md-editor__slash">
            <MenuList class="pw-md-editor__slash-list">
              <div ref={listbox} id={menuId} role="listbox" aria-label="Block type">
                <For each={slashSections()}>{(section) => {
                  const labelId = `${menuId}-${section.label.toLowerCase()}`;
                  return <div role="group" aria-labelledby={labelId} class="pw-md-editor__slash-section">
                    <div id={labelId} role="presentation" class="pw-md-editor__slash-label">{section.label}</div>
                    <For each={section.items}>{(entry) => {
                      const Icon = entry.action.icon ?? ((p: { size?: number }) => <FileText size={p.size ?? 14} />);
                      return <MenuItem tabIndex={-1} role="option" id={optionId(entry.index)}
                        selected={activeRow() === entry.index} aria-selected={activeRow() === entry.index}
                        onPointerMove={(event) => {
                          const at = `${event.clientX},${event.clientY}`;
                          if (at === rowPointer) return;
                          rowPointer = at;
                          setActiveRow(entry.index);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseBlock(entry.action)}>
                        <Icon size={14} /><span>{entry.action.label}</span>
                      </MenuItem>;
                    }}</For>
                  </div>;
                }}</For>
              </div>
              <Show when={!filteredActions().length}>
                <div class="pw-md-editor__no-results" role="status">No matching blocks</div>
              </Show>
            </MenuList>
            <button type="button" class="pw-md-editor__slash-close" onMouseDown={(event) => event.preventDefault()} onClick={closeSlash}>
              <span>Close menu</span><span class="pw-md-editor__slash-key">esc</span>
            </button>
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
