import { createEffect, createSignal } from "solid-js";
import { A11yDialog, Button, Field, Input, Select, FormStack } from "@polterware/frontend-design-system";
import type { EnvironmentCreateTemplate } from "./create-templates";
import { defaultProtectionForKind } from "./environment-status";
import { EnvironmentTemplateGrid } from "./environment-template-grid";
import type { EnvironmentKind, ProtectionLevel } from "./types";

export type CreateEnvironmentDraft = {
  name: string;
  kind: EnvironmentKind;
  protection: ProtectionLevel;
};

const KIND_OPTIONS = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
  { value: "local", label: "Local" },
] as const;

const PROTECTION_OPTIONS = [
  { value: "relaxed", label: "Relaxed" },
  { value: "standard", label: "Standard" },
  { value: "strict", label: "Strict" },
] as const;

export function CreateEnvironmentDialog(props: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: CreateEnvironmentDraft) => void;
  onCreateFromTemplate?: (template: EnvironmentCreateTemplate) => void;
}) {
  const [name, setName] = createSignal("");
  const [kind, setKind] = createSignal<EnvironmentKind>("development");
  const [protection, setProtection] = createSignal<ProtectionLevel>("relaxed");
  const canSubmit = () => name().trim().length > 0;

  createEffect(() => {
    if (props.open) return;
    setName("");
    setKind("development");
    setProtection("relaxed");
  });

  function close() {
    props.onClose();
  }

  function submit() {
    const next = name().trim();
    if (!next) return;
    props.onSubmit({
      name: next,
      kind: kind(),
      protection: protection(),
    });
  }

  return (
    <A11yDialog
      open={props.open}
      title="Add environment"
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
      <FormStack>
        <Field label="Name">
          <Input
            size="sm"
            value={name()}
            placeholder="Environment name"
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </Field>
        <Field label="Kind">
          <Select
            size="sm"
            value={kind()}
            options={[...KIND_OPTIONS]}
            onChange={(value) => {
              const next = value as EnvironmentKind;
              setKind(next);
              setProtection(defaultProtectionForKind(next));
            }}
          />
        </Field>
        <Field label="Protection">
          <Select
            size="sm"
            value={protection()}
            options={[...PROTECTION_OPTIONS]}
            onChange={(value) => setProtection(value as ProtectionLevel)}
          />
        </Field>
        {props.onCreateFromTemplate ? (
          <EnvironmentTemplateGrid
            onSelect={(template) => props.onCreateFromTemplate?.(template)}
          />
        ) : null}
      </FormStack>
    </A11yDialog>
  );
}
