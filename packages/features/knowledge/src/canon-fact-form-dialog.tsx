import { createEffect, createSignal, on } from "solid-js";
import { Boxes, Composer, StatusDot, type ComposerProperty } from "@polterware/frontend-design-system";
import type { WorkspaceCanonEntity } from "@polterware/feature-shell";
import {
  CANON_TRUTH_CLASS_OPTIONS,
  type CanonFactDraft,
  type CanonFactTruthClass,
} from "./canon-facts-types";
import { factKindTone } from "./fact-kind";

/** Adds or edits a Fact in the shared composer: the statement first, then its kind and subject. */
export function CanonFactFormDialog(props: {
  open: boolean;
  mode: "create" | "edit";
  initial?: CanonFactDraft;
  onClose: () => void;
  /** Resolves false when the write failed, so the composer keeps the draft. */
  onSubmit: (draft: CanonFactDraft) => Promise<boolean>;
  /** Canon entities a Fact can be about; none leaves it about the whole project. */
  entities?: readonly WorkspaceCanonEntity[];
}) {
  const [truthClass, setTruthClass] = createSignal<CanonFactTruthClass>("declared");
  const [entityId, setEntityId] = createSignal("");

  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setTruthClass(props.initial?.truthClass ?? "declared");
    setEntityId(props.initial?.entityId ?? "");
  }));

  const properties = (): ComposerProperty[] => [
    {
      id: "kind",
      label: "Kind",
      options: CANON_TRUTH_CLASS_OPTIONS.map((option) => ({
        ...option,
        icon: <StatusDot tone={factKindTone(option.value)} showLabel={false} />,
      })),
      value: truthClass(),
      onChange: (value) => setTruthClass(value as CanonFactTruthClass),
    },
    {
      id: "subject",
      label: "Subject",
      icon: <Boxes size={14} />,
      options: [
        { value: "", label: "Whole project" },
        ...(props.entities ?? []).map((entity) => ({ value: entity.id, label: entity.title })),
        // A subject outside the list (an older id) stays selectable.
        ...(entityId() && !(props.entities ?? []).some((entity) => entity.id === entityId())
          ? [{ value: entityId(), label: entityId() }]
          : []),
      ],
      value: entityId(),
      onChange: setEntityId,
    },
  ];

  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      crumbs={["Facts", props.mode === "edit" ? "Edit fact" : "New fact"]}
      titlePlaceholder="The API depends on PostgreSQL"
      properties={properties()}
      whyPlaceholder="Optional. Recorded in Activity"
      initial={{ title: props.initial?.statement ?? "" }}
      createMore={props.mode === "create"}
      submitLabel={props.mode === "edit" ? "Save fact" : "Create fact"}
      onSubmit={(draft) =>
        props.onSubmit({
          id: props.initial?.id,
          statement: draft.title,
          truthClass: truthClass(),
          entityId: entityId().trim(),
          why: draft.why,
        })}
    />
  );
}
