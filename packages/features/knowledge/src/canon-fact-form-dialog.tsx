import { createEffect, createSignal, on, type JSX } from "solid-js";
import { Composer, type ComposerProperty } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";
import type { CanonFactDraft, CanonFactTruthClass } from "./canon-facts-types";
import { contextProperty } from "./composers";

/**
 * Adds or edits a rule in the shared composer: the statement first, then the parts of the project it
 * is about (its contexts). A rule has no kind to pick: a new one is declared, and an edit keeps how
 * it is known and the canon subject it already had (the CLI and MCP still set it).
 */
export function CanonFactFormDialog(props: {
  open: boolean;
  mode: "create" | "edit";
  initial?: CanonFactDraft;
  onClose: () => void;
  /** Resolves false when the write failed, so the composer keeps the draft. */
  onSubmit: (draft: CanonFactDraft) => Promise<boolean>;
  /** Structure nodes a rule can be about; none leaves the Context property out. */
  scopeNodes?: readonly ScopeNodeItem[];
  /** A quiet action at the start of the footer, such as Link evidence. */
  footerAction?: JSX.Element;
}) {
  const [truthClass, setTruthClass] = createSignal<CanonFactTruthClass>("declared");
  const [contexts, setContexts] = createSignal<string[]>([]);

  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setTruthClass(props.initial?.truthClass ?? "declared");
    setContexts([...(props.initial?.scopeNodeIds ?? [])]);
  }));

  const properties = (): ComposerProperty[] => [
    ...(props.scopeNodes?.length ? [contextProperty(props.scopeNodes, contexts, setContexts)] : []),
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
          entityId: props.initial?.entityId ?? "",
          scopeNodeIds: contexts(),
          why: draft.why,
        })}
    />
  );
}
