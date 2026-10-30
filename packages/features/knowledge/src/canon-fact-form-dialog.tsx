import { createEffect, createSignal, on, type JSX } from "solid-js";
import { Boxes, Composer, type ComposerProperty } from "@polterware/frontend-design-system";
import type { WorkspaceCanonEntity } from "@polterware/feature-shell";
import type { CanonFactDraft, CanonFactTruthClass } from "./canon-facts-types";

/**
 * Adds or edits a rule in the shared composer: the statement first, then what it is about. A rule
 * has no kind to pick: a new one is declared, and an edit keeps how it is known.
 */
export function CanonFactFormDialog(props: {
  open: boolean;
  mode: "create" | "edit";
  initial?: CanonFactDraft;
  onClose: () => void;
  /** Resolves false when the write failed, so the composer keeps the draft. */
  onSubmit: (draft: CanonFactDraft) => Promise<boolean>;
  /** Canon entities a Fact can be about; none leaves it about the whole project. */
  entities?: readonly WorkspaceCanonEntity[];
  /** A quiet action at the start of the footer, such as Link evidence. */
  footerAction?: JSX.Element;
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
      id: "subject",
      label: "About",
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
      crumbs={["Rules", props.mode === "edit" ? "Edit rule" : "New rule"]}
      titlePlaceholder="The API returns only fields declared in the contract"
      properties={properties()}
      whyPlaceholder="Optional. Recorded in Activity"
      footerAction={props.footerAction}
      initial={{ title: props.initial?.statement ?? "" }}
      createMore={props.mode === "create"}
      submitLabel={props.mode === "edit" ? "Save rule" : "Create rule"}
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
