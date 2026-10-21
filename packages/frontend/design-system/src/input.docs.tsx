import { Field } from "./field";
import { Input, Textarea } from "./input";
import type { DocEntry } from "./docs/types";

export default {
  name: "Input",
  group: "Inputs",
  summary:
    "Text input and textarea on the shared control-field chrome. Wrap in Field for a label, hint, and error message.",
  exports: ["Input", "Textarea", "Field"],
  examples: [
    {
      id: "default",
      title: "Default",
      render: () => (
        // #region default
        <Input placeholder="Note title" aria-label="Note title" />
        // #endregion
      ),
    },
    {
      id: "sizes",
      title: "Sizes",
      render: () => (
        // #region sizes
        <>
          <Input size="sm" placeholder="Small" aria-label="Small input" />
          <Input size="md" placeholder="Medium" aria-label="Medium input" />
        </>
        // #endregion
      ),
    },
    {
      id: "disabled",
      title: "Disabled",
      render: () => (
        // #region disabled
        <Input disabled value="Read only value" aria-label="Disabled input" />
        // #endregion
      ),
    },
    {
      id: "field",
      title: "With Field",
      description: "Field adds the label and shows either the error or the hint.",
      render: () => (
        // #region field
        <>
          <Field label="Name" hint="Shown in the sidebar.">
            <Input placeholder="Project name" />
          </Field>
          <Field label="Slug" error="Slug is already taken.">
            <Input value="polterware" aria-invalid="true" />
          </Field>
        </>
        // #endregion
      ),
    },
    {
      id: "textarea",
      title: "Textarea",
      render: () => (
        // #region textarea
        <Textarea aria-label="Description" placeholder="Describe the change" rows={3} />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
