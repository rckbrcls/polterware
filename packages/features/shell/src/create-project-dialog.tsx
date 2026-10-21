import { Show, createEffect, createSignal } from "solid-js";
import {
  A11yDialog,
  Button,
  Field,
  Input, FormStack } from "@polterware/frontend-design-system";
import {
  EnvironmentKindChips,
  type CreateProjectEnvironmentKind,
} from "./environment-kind-chips";
import {
  projectNameFromDirectory,
  shouldApplyAutoProjectName,
} from "./project-name-from-directory";
import { RepositoryPicker } from "./repository-picker";

const DEFAULT_ENVS: CreateProjectEnvironmentKind[] = [
  "development",
  "staging",
  "production",
];

/**
 * Create-project dialog. Persists a local project through the Desktop core.
 */
export function CreateProjectDialog(props: {
  open: boolean;
  /** When false, Cancel and dismiss controls are hidden so an empty store cannot leave the form. */
  canCancel?: boolean;
  onClose: () => void;
  onPickDirectory: () => Promise<string | null | undefined>;
  onCreate?: (input: {
    name: string;
    directory: string;
    environments: string[];
  }) => void;
}) {
  const canCancel = () => props.canCancel !== false;
  const [name, setName] = createSignal("");
  const [directory, setDirectory] = createSignal("");
  const [lastAutoName, setLastAutoName] = createSignal("");
  const [envs, setEnvs] = createSignal<CreateProjectEnvironmentKind[]>([...DEFAULT_ENVS]);

  const canSubmit = () =>
    name().trim().length > 0
    && directory().trim().length > 0
    && envs().length > 0;

  createEffect(() => {
    if (props.open) return;
    setName("");
    setDirectory("");
    setLastAutoName("");
    setEnvs([...DEFAULT_ENVS]);
  });

  function applyDirectory(path: string) {
    setDirectory(path);
    const suggested = projectNameFromDirectory(path);
    if (!suggested) return;
    if (shouldApplyAutoProjectName(name(), lastAutoName())) {
      setName(suggested);
    }
    setLastAutoName(suggested);
  }

  function close() {
    if (!canCancel()) return;
    props.onClose();
  }

  function submit() {
    if (!canSubmit()) return;
    props.onCreate?.({
      name: name().trim(),
      directory: directory().trim(),
      environments: [...envs()],
    });
  }

  return (
    <A11yDialog
      open={props.open}
      size="sm"
      title="Create project"
      dismissible={canCancel()}
      onClose={close}
      footer={
        <>
          <Show when={canCancel()}>
            <Button size="sm" variant="texture" onClick={close}>
              Cancel
            </Button>
          </Show>
          <Button size="sm" variant="brand" disabled={!canSubmit()} onClick={submit}>
            Create project
          </Button>
        </>
      }
    >
      <FormStack>
        <Field label="Project name">
          <Input
            size="md"
            placeholder="Project name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            autofocus
          />
        </Field>
        <Field label="Repository">
          <RepositoryPicker
            value={directory()}
            onPick={props.onPickDirectory}
            onChange={applyDirectory}
          />
        </Field>
        <fieldset class="m-0 border-0 p-0">
          <legend class="mb-3 text-[11px] font-medium tracking-wide text-[var(--color-text-muted)]">
            Initial environments
          </legend>
          <EnvironmentKindChips value={envs()} onChange={setEnvs} />
        </fieldset>
      </FormStack>
    </A11yDialog>
  );
}
