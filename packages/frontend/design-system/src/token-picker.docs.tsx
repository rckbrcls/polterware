import { createSignal } from "solid-js";
import { Box, Boxes, Layers } from "./hugeicons";
import { TokenPicker } from "./token-picker";
import type { DocEntry } from "./docs/types";

export default {
  name: "TokenPicker",
  group: "Menus",
  summary: "Edits a list of values as tokens, the way the filter menu adds them: each picked value is a pill with its icon and a remove button, and the add button opens the shared PropertyPicker with what is not picked yet. emptyLabel says what an empty list means and shows only while nothing is picked. The Composer renders a property with values as a TokenPicker.",
  exports: ["TokenPicker"],
  examples: [
    {
      id: "contexts",
      title: "Contexts",
      render: () => {
        // #region contexts
        const [values, setValues] = createSignal<string[]>(["core/api"]);
        return (
          <TokenPicker
            label="Context"
            icon={<Layers size={14} />}
            emptyLabel="Whole project"
            options={[
              { value: "core", label: "Core", icon: <Boxes size={14} /> },
              { value: "core/store", label: "Store", icon: <Layers size={14} /> },
              { value: "core/api", label: "API", icon: <Box size={14} /> },
            ]}
            values={values()}
            onChange={setValues}
          />
        );
        // #endregion
      },
    },
  ],
} satisfies DocEntry;
