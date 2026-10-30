import { createEffect, createSignal, on } from "solid-js";
import {
  Composer,
  StatusDot,
  type ComposerProperty,
  type StatusTone,
} from "@polterware/frontend-design-system";
import type { CreateProjectEnvironmentKind } from "./environment-kind-chips";

const DEFAULT_ENVS: CreateProjectEnvironmentKind[] = [
  "development",
  "staging",
  "production",
];

const ENV_OPTIONS: ReadonlyArray<{ id: CreateProjectEnvironmentKind; label: string; tone: StatusTone }> = [
  { id: "development", label: "Development", tone: "muted" },
  { id: "staging", label: "Staging", tone: "syncing" },
  { id: "production", label: "Production", tone: "warn" },
];

/**
 * Create-project dialog, in the shared Composer: the name and the initial environments. A
 * project has no folder of its own; its Structure components link repositories later.
 */
export function CreateProjectDialog(props: {
  open: boolean;
  /** When false, the composer cannot be dismissed, so an empty store cannot leave the form. */
  canCancel?: boolean;
  onClose: () => void;
  onCreate?: (input: {
    name: string;
    environments: string[];
  }) => void;
}) {
  const [envs, setEnvs] = createSignal<CreateProjectEnvironmentKind[]>([...DEFAULT_ENVS]);

  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setEnvs([...DEFAULT_ENVS]);
  }));

  const properties = (): ComposerProperty[] => [
    {
      id: "environments",
      label: "Environments",
      emptyLabel: "No environments",
      options: ENV_OPTIONS.map((option) => ({
        value: option.id,
        label: option.label,
        icon: <StatusDot tone={option.tone} showLabel={false} />,
      })),
      values: envs(),
      // A project starts with at least one environment.
      onValuesChange: (values) => {
        const next = ENV_OPTIONS.map((option) => option.id).filter((id) => values.includes(id));
        if (next.length > 0) setEnvs(next);
      },
    },
  ];

  return (
    <Composer
      open={props.open}
      onClose={props.onClose}
      dismissible={props.canCancel !== false}
      crumbs={["Projects", "New project"]}
      titlePlaceholder="Project name"
      properties={properties()}
      createMore={false}
      canSubmit={envs().length > 0}
      submitLabel="Create project"
      onSubmit={(draft) => {
        props.onCreate?.({ name: draft.title, environments: [...envs()] });
      }}
    />
  );
}
