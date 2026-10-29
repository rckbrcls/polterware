import { createSignal } from "solid-js";
import { Button } from "./button";
import { Composer } from "./composer";
import { pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

function ComposerExample() {
  const [open, setOpen] = createSignal(false);
  const [stage, setStage] = createSignal("shape");
  return (
    // #region default
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        New card
      </Button>
      <Composer
        open={open()}
        onClose={() => setOpen(false)}
        crumbs={["Polterware", "New card"]}
        titlePlaceholder="Card title"
        descriptionPlaceholder="What we want and why…"
        properties={[
          {
            id: "stage",
            label: "Stage",
            options: [{ value: "shape", label: "Shape" }, { value: "plan", label: "Plan" }, { value: "build", label: "Build" }],
            value: stage(),
            onChange: setStage,
          },
        ]}
        whyPlaceholder="Optional. Recorded in Activity"
        submitLabel="Create card"
        onSubmit={(draft) => {
          pushToast(`Created “${draft.title}” in ${stage()}`, "success");
          return true;
        }}
      />
    </>
    // #endregion
  );
}

export default {
  name: "Composer",
  group: "Overlays",
  summary:
    "Linear's create dialog, used for every new record. The title comes first, then an optional description, property pills that open the shared property picker, labelled fields, and an optional Why recorded in Activity. Cmd+Enter creates; Create more keeps it open with the same properties for the next one. The host owns the write and resolves false to keep the draft.",
  exports: ["Composer"],
  examples: [{ id: "default", title: "New card", render: () => <ComposerExample /> }],
} satisfies DocEntry;
