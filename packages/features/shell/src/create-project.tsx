import { Show, createSignal } from "solid-js";
import { Button, SwitchRow, Input, Surface } from "@polterware/frontend-design-system";

/**
 * Neutral full-page create project form.
 * Persists a local project through the Desktop core.
 */
export function CreateProjectPage(props: {
  /** When false, Cancel is hidden so a store with no projects cannot leave the form. */
  canCancel?: boolean;
  onCancel?: () => void;
  onCreate?: (input: {
    name: string;
    directory: string;
    environments: string[];
  }) => void;
}) {
  const canCancel = () => props.canCancel !== false;
  const [name, setName] = createSignal("");
  const [directory, setDirectory] = createSignal("");
  const [envs, setEnvs] = createSignal({ development: true, staging: true, production: true });

  const selectedEnvironments = () => Object.entries(envs())
    .filter(([, enabled]) => enabled)
    .map(([kind]) => kind);
  const canSubmit = () =>
    name().trim().length > 0
    && directory().trim().length > 0
    && selectedEnvironments().length > 0;

  return (
    <div class="flex h-full min-h-0 items-center justify-center overflow-auto p-6">
      <Surface class="w-full max-w-lg p-0">
        <div class="border-b border-[var(--color-border-subtle)] px-6 py-5">
          <h1 class="m-0 text-[16px] font-semibold text-[var(--color-text-primary)]">
            Create a new project
          </h1>
          <p class="m-0 mt-1 text-[12.5px] text-[var(--color-text-muted)]">
            Add a local project with its own architecture, resources, and environments.
          </p>
        </div>
        <div class="space-y-5 px-6 py-5 text-[12.5px]">
          <label class="flex flex-col gap-1.5 text-[var(--color-text-secondary)]">
            Project name
            <Input
              size="md"
              placeholder="Project name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              autofocus
            />
          </label>
          <label class="flex flex-col gap-1.5 text-[var(--color-text-secondary)]">
            Directory
            <Input
              size="md"
              placeholder="~/projects/example"
              value={directory()}
              onInput={(e) => setDirectory(e.currentTarget.value)}
            />
          </label>
          <fieldset class="m-0 border-0 p-0">
            <legend class="mb-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
              Initial environments
            </legend>
            <SwitchRow
              checked={envs().development}
              label="Development"
              onCheckedChange={(checked) => setEnvs((v) => ({ ...v, development: checked }))}
            />
            <SwitchRow
              checked={envs().staging}
              label="Staging"
              onCheckedChange={(checked) => setEnvs((v) => ({ ...v, staging: checked }))}
            />
            <SwitchRow
              checked={envs().production}
              label="Production"
              onCheckedChange={(checked) => setEnvs((v) => ({ ...v, production: checked }))}
            />
          </fieldset>
        </div>
        <div
          class={`flex items-center border-t border-[var(--color-border-subtle)] px-6 py-4 ${
            canCancel() ? "justify-between" : "justify-end"
          }`}
        >
          <Show when={canCancel()}>
            <Button size="md" variant="texture" onClick={() => props.onCancel?.()}>
              Cancel
            </Button>
          </Show>
          <Button
            size="md"
            variant="brand"
            disabled={!canSubmit()}
            onClick={() => {
              if (!canSubmit()) return;
              props.onCreate?.({
                name: name().trim(),
                directory: directory().trim(),
                environments: selectedEnvironments(),
              });
            }}
          >
            Create project
          </Button>
        </div>
      </Surface>
    </div>
  );
}
