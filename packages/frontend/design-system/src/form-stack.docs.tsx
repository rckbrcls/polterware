import { Field } from "./field";
import { FormStack } from "./form-stack";
import { Input } from "./input";
import type { DocEntry } from "./docs/types";

export default {
  name: "Form stack",
  group: "Inputs",
  summary: "FormStack supplies the standard vertical rhythm for a column of fields. Use it instead of local spacing overrides between form controls.",
  exports: ["FormStack"],
  examples: [
    { id: "fields", title: "Fields", render: () => (
      // #region fields
      <FormStack><Field label="Name"><Input placeholder="Project name" /></Field><Field label="Description" hint="A short summary."><Input placeholder="Describe the project" /></Field></FormStack>
      // #endregion
    ) },
  ],
} satisfies DocEntry;
