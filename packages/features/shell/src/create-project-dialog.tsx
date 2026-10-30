import { createEffect, createSignal, on } from "solid-js";
import {
  Composer,
  StatusDot,
  type ComposerProperty,
  type StatusTone,
} from "@polterware/frontend-design-system";
import type { CreateProjectEnvironmentKind } from "./environment-kind-chips";
import { projectNameFromDirectory } from "./project-name-from-directory";
import { RepositoryPicker } from "./repository-picker";

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
 * Create-project dialog, in the shared Composer: the name first, the initial environments
 * as a property, and the repository folder picked under the title (its name proposes the
 * project's). Persists a local project through the Desktop core.
 */
export function CreateProjectDialog(props: {
  open: boolean;
  /** When false, the composer cannot be dismissed, so an empty store cannot leave the form. */
  canCancel?: boolean;
  onClose: () => void;
  onPickDirectory: () => Promise<string | null | undefined>;
  onCreate?: (input: {
    name: string;
    directory: string;
    environments: string[];
  }) => void;
}) {
  const [directory, setDirectory] = createSignal("");
  const [envs, setEnvs] = createSignal<CreateProjectEnvironmentKind[]>([...DEFAULT_ENVS]);

  createEffect(on(() => props.open, (open) => {
    if (!open) return;
    setDirectory("");
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
      suggestedTitle={projectNameFromDirectory(directory())}
      canSubmit={directory().trim().length > 0 && envs().length > 0}
      body={
        <RepositoryPicker
          appearance="dashed"
          value={directory()}
          onPick={props.onPickDirectory}
          onChange={setDirectory}
        />
      }
      submitLabel="Create project"
      onSubmit={(draft) => {
        if (!directory().trim()) return false;
        props.onCreate?.({ name: draft.title, directory: directory().trim(), environments: [...envs()] });
      }}
    />
  );
}
