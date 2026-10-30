import { createEffect, createSignal, on, type JSX } from "solid-js";
import { Composer, type ComposerProperty } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";
import { contextProperty } from "./composers";

/** A Rule as the composer edits it: the statement and the Structure nodes it holds for. */
export type RuleDraft = {
  /** The Rule's handle (slug, or id when it has none); empty creates a Rule. */
  ref?: string;
  statement: string;
  /** Structure nodes the Rule holds for; none is the whole project. */
  scopeNodeIds: string[];
  /** Optional reason, recorded as the change rationale. */
  why?: string;
};

/**
 * Adds or edits a Rule in the shared composer: the statement first, then the parts of the project it
 * holds for (its contexts). Agents read every Rule that holds for their target in the brief.
 */
export function RuleFormDialog(props: {
  open: boolean;
  mode: "create" | "edit";
  initial?: RuleDraft;
  onClose: () => void;
  /** Resolves false when the write failed, so the composer keeps the draft. */
  onSubmit: (draft: RuleDraft) => Promise<boolean>;
  /** Structure nodes a Rule can hold for; none leaves the Context property out. */
  scopeNodes?: readonly ScopeNodeItem[];
  /** A quiet action at the start of the footer, such as Remove rule. */
  footerAction?: JSX.Element;
}) {
  const [contexts, setContexts] = createSignal<string[]>([]);

  createEffect(on(() => props.open, (open) => {
    if (!open) return;
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
          ref: props.initial?.ref,
          statement: draft.title,
          scopeNodeIds: contexts(),
          why: draft.why,
        })}
    />
  );
}
