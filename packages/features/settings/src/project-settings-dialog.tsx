import { createEffect, createSignal, For, Show } from "solid-js";
import {
  A11yDialog,
  Button,
  Input,
  Plus,
  Select,
  SettingsDialog,
  Textarea,
  pushToast,
  type SettingsNavItem,
  type SettingsSearchEntry,
} from "@polterware/frontend-design-system";
import { CreateEnvironmentDialog, type CreateEnvironmentDraft } from "./create-environment-dialog";
import { EnvironmentsEmpty } from "./environments-empty";
import { EnvironmentRows } from "./environment-rows";
import { archiveProjectToast, saveGeneralSettingsToast } from "./environment-status";
import type { ProjectEnvironment, ProjectGeneralSettings, ProjectRepository } from "./types";
import { environmentSelectOptions } from "./settings-helpers";
import { SettingsRow, SettingsSection } from "./settings-section";

const PROJECT_SETTINGS_ITEMS: readonly SettingsNavItem[] = [
  { id: "general", label: "General" },
];

const PROJECT_SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  {
    item: "general",
    section: "Project",
    label: "Project",
    description: "Local project details. Changes persist in the local SQLite store.",
    keywords: "name description primary repository default environment project id",
  },
  {
    item: "general",
    section: "Local repositories",
    label: "Local repositories",
    description: "Extra Git checkouts. The project directory stays the checkpoint used by status. Each path here is read on scan.",
    keywords: "git checkout path browse add repository",
  },
  {
    item: "general",
    section: "Environments",
    label: "Environments",
    keywords: "add environment default delete",
  },
  {
    item: "general",
    section: "Danger zone",
    label: "Danger zone",
    description: "Hide this project from the switcher. Local data stays in SQLite until you reset the store.",
    keywords: "archive project",
  },
];

/** Name, repositories, environments, and archive for the current project. */
export function ProjectSettingsDialog(props: {
  open: boolean;
  onClose: () => void;
  general?: ProjectGeneralSettings;
  environments?: ProjectEnvironment[];
  repositories?: ProjectRepository[];
  onSaveGeneral?: (settings: ProjectGeneralSettings) => void;
  onAddRepository?: (draft: { name: string; path: string }) => Promise<void> | void;
  onRemoveRepository?: (name: string) => Promise<void> | void;
  onBrowseRepository?: () => Promise<string | null | undefined>;
  onCreateEnvironment?: (draft: CreateEnvironmentDraft) => void;
  onSetDefaultEnvironment?: (environmentId: string) => void;
  onDeleteEnvironment?: (environmentId: string) => void;
  onArchiveProject?: () => void;
}) {
  const general = () => props.general;
  const environments = () => props.environments ?? [];

  const [name, setName] = createSignal(general()?.name ?? "");
  const [description, setDescription] = createSignal(general()?.description ?? "");
  const [defaultEnvironmentId, setDefaultEnvironmentId] = createSignal(general()?.defaultEnvironmentId ?? "");
  const [repository, setRepository] = createSignal(general()?.repository ?? "");
  const [repoName, setRepoName] = createSignal("");
  const [repoPath, setRepoPath] = createSignal("");
  const [repoBusy, setRepoBusy] = createSignal(false);
  const [archiveOpen, setArchiveOpen] = createSignal(false);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [activeSection, setActiveSection] = createSignal("general");

  createEffect(() => {
    const next = general();
    if (!next) return;
    setName(next.name);
    setDescription(next.description);
    setDefaultEnvironmentId(next.defaultEnvironmentId);
    setRepository(next.repository);
  });

  async function handleAddRepository() {
    const nextName = repoName().trim();
    const path = repoPath().trim();
    if (!nextName || !path || !props.onAddRepository) return;
    setRepoBusy(true);
    try {
      await props.onAddRepository({ name: nextName, path });
      setRepoName("");
      setRepoPath("");
    } catch {
      // The caller reports the error.
    } finally {
      setRepoBusy(false);
    }
  }

  async function handleBrowseRepository() {
    const picked = await props.onBrowseRepository?.();
    if (picked) setRepoPath(picked);
  }

  async function handleRemoveRepository(repoNameToRemove: string) {
    if (!props.onRemoveRepository) return;
    setRepoBusy(true);
    try {
      await props.onRemoveRepository(repoNameToRemove);
    } catch {
      // The caller reports the error.
    } finally {
      setRepoBusy(false);
    }
  }

  function handleSaveGeneral() {
    const current = general();
    props.onSaveGeneral?.({
      name: name(),
      description: description(),
      defaultEnvironmentId: defaultEnvironmentId(),
      projectId: current?.projectId ?? "",
      repository: repository(),
      dataSource: current?.dataSource ?? "empty",
    });
    if (!props.onSaveGeneral) {
      pushToast(saveGeneralSettingsToast(), "success");
    }
  }

  function handleArchiveConfirm() {
    setArchiveOpen(false);
    if (!props.onArchiveProject) {
      pushToast(archiveProjectToast(general()?.name), "success");
      return;
    }
    props.onArchiveProject();
  }

  async function handleCopyProjectId() {
    const id = general()?.projectId ?? "";
    try {
      if ("navigator" in globalThis && globalThis.navigator.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(id);
      }
    } catch {
      // Clipboard may be unavailable in some runtimes — toast still honest.
    }
    pushToast("Project ID copied.", "success");
  }

  return (
    <>
      <SettingsDialog
        open={props.open}
        title="Project settings"
        items={PROJECT_SETTINGS_ITEMS}
        active={activeSection()}
        onSelect={setActiveSection}
        searchEntries={PROJECT_SETTINGS_SEARCH_ENTRIES}
        onClose={() => props.onClose()}
      >
        <div class="flex flex-col gap-6">
          <SettingsSection
            title="Project"
            description="Local project details. Changes persist in the local SQLite store."
          >
            <SettingsRow label="Name" for="settings-project-name">
              <Input
                id="settings-project-name"
                size="md"
                class="w-72"
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Description" for="settings-project-description">
              <Textarea
                id="settings-project-description"
                class="w-72"
                value={description()}
                onInput={(event) => setDescription(event.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Primary repository" for="settings-project-repo">
              <Input
                id="settings-project-repo"
                size="md"
                class="w-72"
                placeholder="org/repo"
                value={repository()}
                onInput={(event) => setRepository(event.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Default environment" for="settings-default-env">
              <Select
                id="settings-default-env"
                size="md"
                value={defaultEnvironmentId()}
                options={environmentSelectOptions(environments())}
                onChange={(value) => setDefaultEnvironmentId(value)}
              />
            </SettingsRow>
            <SettingsRow label="Project ID">
              <span class="pw-selectable font-mono text-[12px] text-[var(--color-text-primary)]">
                {general()?.projectId ?? "—"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void handleCopyProjectId()}>
                Copy
              </Button>
            </SettingsRow>
            <div class="flex justify-end gap-2">
              <Button
                size="sm"
                variant="texture"
                onClick={() => {
                  setName(general()?.name ?? "");
                  setDescription(general()?.description ?? "");
                  setDefaultEnvironmentId(general()?.defaultEnvironmentId ?? "");
                  setRepository(general()?.repository ?? "");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" variant="secondary" onClick={handleSaveGeneral}>
                Save changes
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Local repositories"
            description="Extra Git checkouts. The project directory stays the checkpoint used by status. Each path here is read on scan."
          >
            <For each={props.repositories ?? []}>
              {(repo) => (
                <SettingsRow
                  label={<span class="font-mono text-[12px]">{repo.name}</span>}
                  description={<span class="font-mono" title={repo.path}>{repo.path}</span>}
                >
                  <Button size="sm" variant="ghost" disabled={repoBusy()} onClick={() => void handleRemoveRepository(repo.name)}>
                    Remove
                  </Button>
                </SettingsRow>
              )}
            </For>
            <SettingsRow label="Name" for="settings-repo-name">
              <Input
                id="settings-repo-name"
                size="md"
                class="w-72"
                placeholder="api"
                value={repoName()}
                onInput={(event) => setRepoName(event.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Path" for="settings-repo-path">
              <Input
                id="settings-repo-path"
                size="md"
                class="w-72"
                placeholder="/path/to/checkout"
                value={repoPath()}
                onInput={(event) => setRepoPath(event.currentTarget.value)}
              />
            </SettingsRow>
            <div class="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={repoBusy()} onClick={() => void handleBrowseRepository()}>
                Browse
              </Button>
              <Button size="sm" variant="secondary" disabled={repoBusy() || !repoName().trim() || !repoPath().trim()} onClick={() => void handleAddRepository()}>
                Add repository
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection title="Environments">
            <div class="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} aria-hidden /> Add environment
              </Button>
            </div>
            <Show
              when={environments().length > 0}
              fallback={
                <EnvironmentsEmpty
                  onCreate={() => setCreateOpen(true)}
                  onCreateFromTemplate={
                    props.onCreateEnvironment
                      ? (template) => props.onCreateEnvironment?.(template.draft)
                      : undefined
                  }
                />
              }
            >
              <EnvironmentRows
                environments={environments()}
                canDelete={environments().length > 1}
                onSetDefault={props.onSetDefaultEnvironment}
                onDelete={props.onDeleteEnvironment}
              />
            </Show>
          </SettingsSection>

          <SettingsSection
            title="Danger zone"
            description="Hide this project from the switcher. Local data stays in SQLite until you reset the store."
          >
            <SettingsRow label="Archive project" description="Hide this project from the switcher.">
              <Button size="sm" variant="danger" onClick={() => setArchiveOpen(true)}>
                Archive project
              </Button>
            </SettingsRow>
          </SettingsSection>
        </div>
      </SettingsDialog>

      <CreateEnvironmentDialog
        open={createOpen()}
        onClose={() => setCreateOpen(false)}
        onCreateFromTemplate={(template) => {
          setCreateOpen(false);
          props.onCreateEnvironment?.(template.draft);
        }}
        onSubmit={(draft) => {
          setCreateOpen(false);
          props.onCreateEnvironment?.(draft);
        }}
      />

      <A11yDialog
        open={archiveOpen()}
        title="Archive project?"
        size="sm"
        onClose={() => setArchiveOpen(false)}
        footer={
          <>
            <Button size="sm" variant="texture" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={handleArchiveConfirm}>
              Archive
            </Button>
          </>
        }
      >
        <p class="m-0 text-[12.5px] text-[var(--color-text-secondary)]">
          The project will be hidden from the switcher. Local data stays in SQLite until you reset the store.
        </p>
      </A11yDialog>
    </>
  );
}
