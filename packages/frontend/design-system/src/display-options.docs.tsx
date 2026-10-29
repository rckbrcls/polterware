import { createSignal } from "solid-js";
import { DisplayOptions } from "./display-options";
import type { DocEntry } from "./docs/types";

function DisplayOptionsExample() {
  const [grouping, setGrouping] = createSignal("stage");
  const [ordering, setOrdering] = createSignal("updated");
  const [direction, setDirection] = createSignal<"ascending" | "descending">("descending");
  const [visible, setVisible] = createSignal<string[]>(["stage", "updated"]);
  return (
    // #region default
    <div class="flex items-center gap-3">
      <DisplayOptions
        grouping={{ options: [{ value: "none", label: "No grouping" }, { value: "stage", label: "Stage" }], value: grouping(), onChange: setGrouping }}
        ordering={{ options: [{ value: "updated", label: "Updated" }, { value: "title", label: "Title" }], value: ordering(), onChange: setOrdering, direction: direction(), onDirectionChange: setDirection }}
        properties={{ options: [{ value: "slug", label: "Slug" }, { value: "stage", label: "Stage" }, { value: "updated", label: "Updated" }], visible: visible(), onChange: setVisible }}
      />
      <span class="text-[12px] text-[var(--color-text-muted)]">
        {grouping()} · {ordering()} {direction()} · {visible().join(", ")}
      </span>
    </div>
    // #endregion
  );
}

export default {
  name: "DisplayOptions",
  group: "Data",
  summary:
    "Linear's Display menu for a list: grouping, ordering with direction, and the properties it shows. The surface owns the values and remembers them per surface.",
  exports: ["DisplayOptions"],
  examples: [{ id: "default", title: "Grouping, ordering, properties", render: () => <DisplayOptionsExample /> }],
} satisfies DocEntry;
