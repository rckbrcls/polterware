import { Show, createEffect, createSignal } from "solid-js";
import { A11yDialog, Button, Field, Input, Select } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";
import { ScopePicker } from "./scope-picker";

export type CreateKnowledgeKind = "card" | "verdict";

export function CreateKnowledgeDialog(props: {
  open: boolean;
  kind: CreateKnowledgeKind;
  onClose: () => void;
  onSubmit: (title: string, kind: CreateKnowledgeKind, scope?: "principle" | "decision", scopePath?: string) => void;
  scopeNodes?: ScopeNodeItem[];
  /** Structure node path preselected for a new Verdict; empty is the whole project. */
  defaultScopePath?: string;
}) {
  const [title, setTitle] = createSignal("");
  const [scope, setScope] = createSignal<"principle" | "decision">("decision");
  const [scopePath, setScopePath] = createSignal("");

  createEffect(() => {
    if (!props.open) return;
    setScope("decision");
    setScopePath(props.defaultScopePath ?? "");
  });

  const activeKind = (): CreateKnowledgeKind => props.kind;

  const copy = () =>
    activeKind() === "card"
      ? { title: "New card", placeholder: "Card title" }
      : { title: "New Verdict", placeholder: "Verdict title" };
  const canSubmit = () => title().trim().length > 0;

  function close() {
    setTitle("");
    props.onClose();
  }

  function submit() {
    const next = title().trim();
    if (!next) return;
    props.onSubmit(next, activeKind(), activeKind() === "verdict" ? scope() : undefined, activeKind() === "verdict" && scope() === "decision" && scopePath() ? scopePath() : undefined);
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
        <Show when={activeKind() === "verdict"}>
          <Field label="Scope">
            <Select
              size="sm"
              value={scope()}
              options={[
                { value: "decision", label: "Decision (linked to components)" },
                { value: "principle", label: "Principle (whole project)" },
              ]}
              onChange={(value) => {
                if (value === "decision" || value === "principle") setScope(value);
              }}
            />
          </Field>
          <Show when={scope() === "decision" && (props.scopeNodes?.length ?? 0) > 0}>
            <Field label="Structure scope" hint="Optional. Leave on Whole project to show it under every filter">
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
