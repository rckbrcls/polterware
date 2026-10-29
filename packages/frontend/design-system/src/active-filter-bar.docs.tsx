import { createSignal } from "solid-js";
import { ActiveFilterBar } from "./active-filter-bar";
import { Button } from "./button";
import type { FilterClause, FilterField } from "./filter-model";
import type { DocEntry } from "./docs/types";

const FIELDS: FilterField[] = [
  {
    id: "stage",
    label: "Stage",
    kind: "multi",
    options: [
      { id: "shape", label: "Shape" },
      { id: "build", label: "Build" },
      { id: "verify", label: "Verify" },
    ],
  },
];

const INITIAL: FilterClause[] = [
  { id: "stage-1", field: "stage", operator: "is", values: ["build", "verify"] },
  { id: "stage-2", field: "stage", operator: "is_not", values: ["shape"] },
];

function Pills() {
  const [clauses, setClauses] = createSignal<FilterClause[]>(INITIAL);
  return (
    // #region pills
    <div class="w-full">
      <ActiveFilterBar fields={FIELDS} clauses={clauses()} onClausesChange={setClauses} />
      <Button size="sm" variant="ghost" onClick={() => setClauses(INITIAL)}>Reset example</Button>
    </div>
    // #endregion
  );
}

export default {
  name: "ActiveFilterBar",
  group: "Data",
  summary:
    "Linear-style filter bar under PageToolbar: one segmented pill per clause ([icon Field] [operator] [value] [×]). The operator switches between is / is any of and is not, the value opens the field's checkbox list, and the last unchecked value removes the pill. A + adds filters; Clear and Save sit on the right. Hidden while nothing filters the page.",
  exports: ["ActiveFilterBar"],
  examples: [{ id: "pills", title: "Edit operators and values, remove pills", wide: true, render: () => <Pills /> }],
} satisfies DocEntry;
