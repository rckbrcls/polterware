import { createEffect, createSignal } from "solid-js";
import { Composer, Layers, ShieldCheck, StatusDot } from "@polterware/frontend-design-system";
import type { EnvironmentCreateTemplate } from "./create-templates";
import { defaultProtectionForKind, environmentKindTone, protectionTone } from "./environment-status";
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

/** Add environment in the shared Composer: the name as its title, then Kind and Protection; a template creates one at once. */
export function CreateEnvironmentDialog(props: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: CreateEnvironmentDraft) => void;
  onCreateFromTemplate?: (template: EnvironmentCreateTemplate) => void;
}) {
  const [kind, setKind] = createSignal<EnvironmentKind>("development");
  const [protection, setProtection] = createSignal<ProtectionLevel>("relaxed");

  createEffect(() => {
    if (props.open) return;
    setKind("development");
    setProtection("relaxed");
  });

  return (
    <Composer
      open={props.open}
      crumbs={["Environments", "Add environment"]}
      titlePlaceholder="Environment name"
      properties={[
        {
          id: "kind",
          label: "Kind",
          get icon() { return <Layers size={14} />; },
          options: KIND_OPTIONS.map((option) => ({ ...option, get icon() { return <StatusDot tone={environmentKindTone(option.value)} showLabel={false} />; } })),
          value: kind(),
          onChange: (value) => {
            const next = value as EnvironmentKind;
            setKind(next);
            setProtection(defaultProtectionForKind(next));
          },
        },
        {
          id: "protection",
          label: "Protection",
          get icon() { return <ShieldCheck size={14} />; },
          options: PROTECTION_OPTIONS.map((option) => ({ ...option, get icon() { return <StatusDot tone={protectionTone(option.value)} showLabel={false} />; } })),
          value: protection(),
          onChange: (value) => setProtection(value as ProtectionLevel),
        },
      ]}
      body={props.onCreateFromTemplate ? (
        <EnvironmentTemplateGrid onSelect={(template) => props.onCreateFromTemplate?.(template)} />
      ) : undefined}
      createMore={false}
      submitLabel="Create environment"
      onClose={props.onClose}
      onSubmit={(draft) => props.onSubmit({ name: draft.title.trim(), kind: kind(), protection: protection() })}
    />
  );
}
