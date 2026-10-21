import { createSignal } from "solid-js";
import { MarkdownEditor } from "./markdown-editor";
import type { DocEntry } from "./docs/types";

const initialMarkdown = "## Source import\n\nKeep **project evidence** close to the work.\n\n- [x] Register sources\n- [ ] Review inferred facts";

function Controlled() {
  const [value, setValue] = createSignal(initialMarkdown);
  return (
    // #region controlled
    <MarkdownEditor value={value()} onChange={setValue} aria-label="Work description" />
    // #endregion
  );
}

function Placeholder() {
  const [value, setValue] = createSignal("");
  return (
    // #region placeholder
    <MarkdownEditor value={value()} onChange={setValue} placeholder="Describe the evidence…" aria-label="New document" />
    // #endregion
  );
}

function WithoutToolbar() {
  const [value, setValue] = createSignal("A quiet writing canvas without selection formatting controls.");
  return (
    // #region without-toolbar
    <MarkdownEditor value={value()} onChange={setValue} showToolbar={false} aria-label="Plain writing canvas" />
    // #endregion
  );
}

export default {
  name: "MarkdownEditor",
  group: "Data",
  summary:
    "Markdown-backed rich text editor for knowledge documents, built on TipTap. Markdown remains the stored value while block insertion and selection formatting share the same commands.",
  exports: ["MarkdownEditor"],
  examples: [
    { id: "controlled", title: "Controlled document", wide: true, render: () => <Controlled /> },
    { id: "placeholder", title: "Empty document with placeholder", wide: true, render: () => <Placeholder /> },
    {
      id: "read-only",
      title: "Read-only document",
      wide: true,
      render: () => (
        // #region read-only
        <MarkdownEditor value={initialMarkdown} editable={false} aria-label="Published document" />
        // #endregion
      ),
    },
    { id: "without-toolbar", title: "Formatting toolbar hidden", wide: true, render: () => <WithoutToolbar /> },
  ],
} satisfies DocEntry;
