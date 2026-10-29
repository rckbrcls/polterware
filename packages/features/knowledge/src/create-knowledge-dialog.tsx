import { Show, createEffect, createSignal } from "solid-js";
import { A11yDialog, Button, Field, Input, Select } from "@polterware/frontend-design-system";
import type { DecisionLevel, ScopeNodeItem } from "@polterware/feature-shell";
import { ScopePicker } from "./scope-picker";

export type CreateKnowledgeKind = "card" | "decision";

export function CreateKnowledgeDialog(props: {
  open: boolean;
  kind: CreateKnowledgeKind;
  onClose: () => void;
  onSubmit: (title: string, kind: CreateKnowledgeKind, level?: DecisionLevel, scopePath?: string) => void;
  scopeNodes?: ScopeNodeItem[];
  /** Structure node path preselected for a new Decision; empty is the whole project. */
  defaultScopePath?: string;
}) {
  const [title, setTitle] = createSignal("");
  const [level, setLevel] = createSignal<DecisionLevel>("decision");
  const [scopePath, setScopePath] = createSignal("");

  createEffect(() => {
    if (!props.open) return;
    setLevel("decision");
    setScopePath(props.defaultScopePath ?? "");
  });

  const activeKind = (): CreateKnowledgeKind => props.kind;

  const copy = () =>
    activeKind() === "card"
      ? { title: "New card", placeholder: "Card title" }
      : { title: "New Decision", placeholder: "Decision title" };
  const canSubmit = () => title().trim().length > 0;

  function close() {
    setTitle("");
    props.onClose();
  }

  function submit() {
    const next = title().trim();
    if (!next) return;
    props.onSubmit(next, activeKind(), activeKind() === "decision" ? level() : undefined, activeKind() === "decision" && level() === "decision" && scopePath() ? scopePath() : undefined);
    setTitle("");
  }

  return (
    <A11yDialog
      open={props.open}
      title={copy().title}
      size="lg"
      onClose={close}
      footer={
        <>
          <Button size="sm" variant="texture" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={!canSubmit()} onClick={submit}>
            Create
          </Button>
        </>
      }
    >
      <div class="grid gap-4">
        <Show when={activeKind() === "decision"}>
          <Field label="Level">
            <Select
              size="sm"
              value={level()}
              options={[
                { value: "decision", label: "Decision" },
                { value: "principle", label: "Principle (whole project)" },
              ]}
              onChange={(value) => {
                if (value === "decision" || value === "principle") setLevel(value);
              }}
            />
          </Field>
          <Show when={level() === "decision" && (props.scopeNodes?.length ?? 0) > 0}>
            <Field label="Scope" hint="Optional. Leave on Whole project to show it under every filter">
              <ScopePicker nodes={props.scopeNodes ?? []} value={scopePath()} onChange={setScopePath} class="w-full" />
            </Field>
          </Show>
        </Show>
        <Field label="Title">
          <Input
            size="sm"
            value={title()}
            placeholder={copy().placeholder}
            onInput={(event) => setTitle(event.currentTarget.value)}
          />
        </Field>
      </div>
    </A11yDialog>
  );
}
