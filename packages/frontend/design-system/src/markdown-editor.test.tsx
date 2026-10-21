// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from "vitest";
import type { Editor } from "@tiptap/core";
import { MarkdownEditor, htmlToMarkdown, markdownToHtml, type MarkdownEditorProps } from "./markdown-editor";
import { repoPath } from "../test/repo-path";

// jsdom has no layout: ProseMirror measures carets through Range rects, and nothing scrolls
// into view. The stubs return empty boxes; tests that need geometry stub it per element.
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= emptyRect;
Range.prototype.getClientRects ??= emptyRects;

type HighlightGlobals = { CSS?: { highlights?: unknown }; Highlight?: unknown };

const cleanups: Array<() => void> = [];
let scrollIntoView: Mock;
let scrollTo: MockInstance<typeof window.scrollTo>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  scrollTo.mockRestore();
  delete (globalThis as HighlightGlobals).CSS?.highlights;
  delete (globalThis as HighlightGlobals).Highlight;
});

function mount(view: () => JSX.Element, container: HTMLElement = document.body) {
  const host = document.createElement("div");
  container.append(host);
  const dispose = render(view, host);
  cleanups.push(dispose);
  return { host, dispose };
}

function mountEditor(props: Partial<MarkdownEditorProps> = {}, container?: HTMLElement) {
  const mounted = mount(() => <MarkdownEditor value="" aria-label="Body" {...props} />, container);
  const prose = mounted.host.querySelector<HTMLElement>(".ProseMirror")!;
  // TipTap keeps its instance on the view's DOM node.
  const editor = (prose as HTMLElement & { editor: Editor }).editor;
  return { ...mounted, prose, editor };
}

/** Types `text` at the caret and puts the DOM selection there, as a real caret would be. */
function typeAtCaret(editor: Editor, text: string) {
  editor.commands.insertContent(text);
  const { node, offset } = editor.view.domAtPos(editor.state.selection.from);
  window.getSelection()!.collapse(node, offset);
  document.dispatchEvent(new Event("selectionchange"));
}

async function openSlash(editor: Editor, prose: HTMLElement, text = "/") {
  typeAtCaret(editor, text);
  await vi.waitFor(() => expect(prose.getAttribute("aria-expanded")).toBe("true"));
  const listbox = document.getElementById(prose.getAttribute("aria-controls")!)!;
  await vi.waitFor(() => expect(listbox).not.toBeNull());
  return listbox;
}

function press(prose: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  prose.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
}

const activeLabel = (prose: HTMLElement) =>
  document.getElementById(prose.getAttribute("aria-activedescendant") ?? "")?.textContent ?? "";

/** A scroll offset jsdom keeps (it does not store `scrollTop` on its own). */
function stubScroll(element: HTMLElement, box: { scrollTop?: number; scrollHeight: number; clientHeight: number }) {
  let top = box.scrollTop ?? 0;
  Object.defineProperty(element, "scrollTop", { configurable: true, get: () => top, set: (value: number) => { top = value; } });
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => box.clientHeight });
}

/** Lays rows out 32px apart inside the list, with a 20px heading above each section. */
function stubRowLayout(list: HTMLElement) {
  let y = 0;
  for (const section of list.querySelectorAll<HTMLElement>('[role="group"]')) {
    const sectionTop = y;
    Object.defineProperty(section, "offsetParent", { configurable: true, get: () => list });
    Object.defineProperty(section, "offsetTop", { configurable: true, get: () => sectionTop });
    y += 20;
    for (const row of section.querySelectorAll<HTMLElement>('[role="option"]')) {
      const rowTop = y;
      Object.defineProperty(row, "offsetParent", { configurable: true, get: () => list });
      Object.defineProperty(row, "offsetTop", { configurable: true, get: () => rowTop });
      Object.defineProperty(row, "offsetHeight", { configurable: true, get: () => 32 });
      y += 32;
    }
  }
  stubScroll(list, { scrollHeight: y, clientHeight: 96 });
}

/** A scrolling ancestor with a classic, measurable overflow. */
function scrollingPage(scrollTop: number) {
  const page = document.createElement("div");
  page.style.overflowY = "auto";
  document.body.append(page);
  stubScroll(page, { scrollTop, scrollHeight: 2000, clientHeight: 600 });
  return page;
}

describe("MarkdownEditor slash menu scrolling", () => {
  it("opens without scrolling the page or calling scrollIntoView", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it("keeps the keyboard row visible by moving only the list's scrollTop", async () => {
    const { editor, prose } = mountEditor();
    const listbox = await openSlash(editor, prose);
    const list = listbox.closest<HTMLElement>(".pw-md-editor__slash-list")!;
    stubRowLayout(list);
    for (let i = 0; i < 5; i++) press(prose, "ArrowDown");
    expect(activeLabel(prose)).toContain("Numbered list");
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    // Wrapping back to the first row returns the list to its top.
    for (let i = 0; i < 5; i++) press(prose, "ArrowUp");
    expect(activeLabel(prose)).toContain("Paragraph");
    expect(list.scrollTop).toBe(0);
  });

  it("wraps ArrowUp from the first row to the last", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose);
    press(prose, "ArrowUp");
    expect(activeLabel(prose)).toContain("Divider");
  });

  it("ignores a pointermove that did not move (rows sliding under a still pointer)", async () => {
    const { editor, prose } = mountEditor();
    const listbox = await openSlash(editor, prose);
    const rows = listbox.querySelectorAll<HTMLElement>('[role="option"]');
    const point = { clientX: 10, clientY: 10, bubbles: true, pointerType: "mouse" };
    rows[2]!.dispatchEvent(new PointerEvent("pointermove", point));
    expect(activeLabel(prose)).toContain("Heading 2");
    press(prose, "ArrowDown");
    expect(activeLabel(prose)).toContain("Heading 3");
    // The synthetic move a scroll dispatches carries the same coordinates.
    rows[2]!.dispatchEvent(new PointerEvent("pointermove", point));
    expect(activeLabel(prose)).toContain("Heading 3");
    rows[1]!.dispatchEvent(new PointerEvent("pointermove", { ...point, clientY: 40 }));
    expect(activeLabel(prose)).toContain("Heading 1");
  });

  it("freezes the scrolling ancestor while open and restores its style and offset on close", async () => {
    const page = scrollingPage(120);
    const { editor, prose } = mountEditor({}, page);
    await openSlash(editor, prose);
    expect(page.style.overflowY).toBe("hidden");
    page.scrollTop = 0;
    press(prose, "Escape");
    await vi.waitFor(() => expect(prose.hasAttribute("aria-expanded")).toBe(false));
    expect(page.style.overflowY).toBe("auto");
    expect(page.scrollTop).toBe(120);
  });

  it("leaves a style another lock took over while the menu was open", async () => {
    const page = scrollingPage(0);
    const { editor, prose } = mountEditor({}, page);
    await openSlash(editor, prose);
    page.style.overflowY = "clip";
    press(prose, "Escape");
    await vi.waitFor(() => expect(prose.hasAttribute("aria-expanded")).toBe(false));
    expect(page.style.overflowY).toBe("clip");
  });
});

describe("MarkdownEditor lifecycle", () => {
  function stubHighlights() {
    const registry = new Map<string, unknown>();
    const globals = globalThis as HighlightGlobals;
    globals.CSS ??= {};
    globals.CSS.highlights = registry;
    globals.Highlight = class { constructor(readonly range: Range) {} };
    return registry;
  }

  it("marks the slash query and removes the mark, the freeze and the aria state when destroyed open", async () => {
    const registry = stubHighlights();
    const page = scrollingPage(40);
    const { editor, prose, dispose } = mountEditor({}, page);
    await openSlash(editor, prose, "/hea");
    expect(registry.get("pw-md-slash")).toBeDefined();
    dispose();
    expect(registry.has("pw-md-slash")).toBe(false);
    expect(page.style.overflowY).toBe("auto");
    expect(page.scrollTop).toBe(40);
  });

  it("works without the CSS Custom Highlight API", async () => {
    const { editor, prose } = mountEditor();
    const listbox = await openSlash(editor, prose, "/hea");
    expect(listbox.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
  });

  it("gives each instance its own menu ids and never clears another instance's mark", async () => {
    const registry = stubHighlights();
    const first = mountEditor();
    await openSlash(first.editor, first.prose, "/co");
    const mark = registry.get("pw-md-slash");
    const firstMenu = first.prose.getAttribute("aria-controls");
    // Mounting another editor must leave this one's mark alone.
    const second = mountEditor();
    expect(registry.get("pw-md-slash")).toBe(mark);
    // Moving the caret into the second editor closes the first menu and removes only its mark.
    await openSlash(second.editor, second.prose);
    expect(second.prose.getAttribute("aria-controls")).not.toBe(firstMenu);
    expect(first.prose.hasAttribute("aria-expanded")).toBe(false);
    const ids = [...document.querySelectorAll('[role="option"]')].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts each menu session at the first row", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose);
    press(prose, "ArrowDown");
    press(prose, "ArrowDown");
    press(prose, "Escape");
    await vi.waitFor(() => expect(prose.hasAttribute("aria-expanded")).toBe(false));
    // A slash only opens the menu at the start of a line: start over on an empty line.
    editor.commands.clearContent();
    await openSlash(editor, prose);
    expect(activeLabel(prose)).toContain("Paragraph");
  });

  it("closes the menu when the editor turns read-only", async () => {
    const [editable, setEditable] = createSignal(true);
    const mounted = mount(() => <MarkdownEditor value="" editable={editable()} />);
    const prose = mounted.host.querySelector<HTMLElement>(".ProseMirror")!;
    const editor = (prose as HTMLElement & { editor: Editor }).editor;
    await openSlash(editor, prose);
    setEditable(false);
    await vi.waitFor(() => expect(prose.hasAttribute("aria-expanded")).toBe(false));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("MarkdownEditor slash menu keyboard and semantics", () => {
  it("links the textbox to a listbox of grouped options", async () => {
    const { editor, prose } = mountEditor();
    const listbox = await openSlash(editor, prose);
    expect(listbox.getAttribute("role")).toBe("listbox");
    expect(prose.getAttribute("aria-haspopup")).toBe("listbox");
    for (const group of listbox.querySelectorAll('[role="group"]')) {
      const label = document.getElementById(group.getAttribute("aria-labelledby")!);
      expect(label?.textContent).toBeTruthy();
    }
    expect(document.getElementById(prose.getAttribute("aria-activedescendant")!)?.getAttribute("role")).toBe("option");
  });

  it("does not move the row while an IME composition owns the keys", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose);
    press(prose, "ArrowDown", { isComposing: true });
    expect(activeLabel(prose)).toContain("Paragraph");
  });

  it("picks the active row with Tab and removes the slash text", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose);
    press(prose, "ArrowDown");
    press(prose, "Tab");
    await vi.waitFor(() => expect(prose.hasAttribute("aria-expanded")).toBe(false));
    expect(editor.isActive("heading", { level: 1 })).toBe(true);
    expect(editor.getText()).toBe("");
  });

  it("picks the active row with Enter", async () => {
    const { editor, prose } = mountEditor();
    await openSlash(editor, prose, "/quo");
    press(prose, "Enter");
    await vi.waitFor(() => expect(editor.isActive("blockquote")).toBe(true));
  });

  it("shows a status outside the listbox when the query matches nothing", async () => {
    const { editor, prose } = mountEditor();
    const listbox = await openSlash(editor, prose, "/zzz");
    expect(listbox.querySelectorAll('[role="option"]').length).toBe(0);
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toContain("No matching blocks");
    expect(listbox.contains(status)).toBe(false);
    expect(prose.hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("MarkdownEditor history", () => {
  it("does not let undo bring back a document replaced from outside", async () => {
    const [value, setValue] = createSignal("First document");
    const mounted = mount(() => <MarkdownEditor value={value()} onChange={setValue} />);
    const editor = (mounted.host.querySelector(".ProseMirror") as HTMLElement & { editor: Editor }).editor;
    setValue("Second document");
    await vi.waitFor(() => expect(editor.getText()).toContain("Second document"));
    editor.commands.undo();
    expect(editor.getText()).toContain("Second document");
    expect(editor.getText()).not.toContain("First document");
  });
});

describe("MarkdownEditor Markdown round-trip", () => {
  /** Loads Markdown into a live editor and reads back what it would store. */
  function roundTrip(markdown: string, props: Partial<MarkdownEditorProps> = {}) {
    const { editor, dispose } = mountEditor({ value: markdown, ...props });
    const stored = htmlToMarkdown(editor.getHTML());
    dispose();
    return stored;
  }

  /** The stored form is a fixed point: loading it again stores the same text. */
  function expectStable(markdown: string, props: Partial<MarkdownEditorProps> = {}) {
    const once = roundTrip(markdown, props);
    expect(roundTrip(once, props)).toBe(once);
    return once;
  }

  it("treats empty content as an empty paragraph and back", () => {
    expect(markdownToHtml("")).toBe("<p></p>");
    expect(markdownToHtml("   \n")).toBe("<p></p>");
    expect(htmlToMarkdown("<p></p>")).toBe("");
  });

  it("keeps task lists with their checked state", () => {
    const stored = expectStable("- [x] Register sources\n- [ ] Review inferred facts");
    expect(stored).toContain("- [x] Register sources");
    expect(stored).toContain("- [ ] Review inferred facts");
  });

  it("keeps nested lists nested", () => {
    const stored = expectStable("- Parent\n  - Child\n- Sibling");
    const lines = stored.split("\n").filter(Boolean);
    expect(lines.find((line) => line.includes("Child"))).toMatch(/^\s+-\s+Child/);
    expect(lines.find((line) => line.includes("Sibling"))).toMatch(/^-\s+Sibling/);
  });

  it("keeps fenced code with its language", () => {
    const stored = expectStable("```ts\nconst answer = 42;\n```");
    expect(stored).toContain("```ts");
    expect(stored).toContain("const answer = 42;");
  });

  it("keeps blockquotes, dividers and links", () => {
    const stored = expectStable("> Quoted\n\nAbove\n\n---\n\nSee [Docs](https://example.com/docs).");
    expect(stored).toContain("> Quoted");
    expect(stored).toContain("---");
    expect(stored).toContain("[Docs](https://example.com/docs)");
  });

  it("keeps attachment references as blocks", () => {
    const props = { renderAttachment: (id: string) => <span>{id}</span> };
    const stored = expectStable("Intro\n\n![attachment](notes-attachment:abc123)\n\nOutro", props);
    expect(stored).toContain("![attachment](notes-attachment:abc123)");
    expect(stored.indexOf("Intro")).toBeLessThan(stored.indexOf("notes-attachment"));
  });

  it("does not report a change for the round-trip on open", () => {
    const onChange = vi.fn();
    mountEditor({ value: "- [ ] Item\n\n* * *\n\n*em*", onChange });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("MarkdownEditor source contract", () => {
  const source = readFileSync(repoPath("packages/frontend/design-system/src/markdown-editor.tsx"), "utf8");
  const css = readFileSync(repoPath("packages/frontend/design-system/src/markdown-editor.css"), "utf8");

  it("never scrolls through scrollIntoView", () => {
    expect(source).not.toMatch(/\.scrollIntoView\(/);
  });

  it("compares overlay signals by value", () => {
    expect(source).toContain("{ equals: sameSlash }");
    expect(source).toContain("{ equals: sameAnchor }");
    expect(source).toContain("{ equals: sameHover }");
  });

  it("caps the menu to the room the positioner reports", () => {
    expect(css).toContain("var(--available-height");
    expect(css).toMatch(/\.pw-md-editor__slash-list {[\s\S]*overscroll-behavior: contain;/);
  });
});
