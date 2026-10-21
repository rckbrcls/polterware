import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import {
  A11yDialog,
  Button,
  Input,
  Plus,
  Select,
  Textarea,
  pushToast,
  SettingsDialog,
} from "@polterware/frontend-design-system";
import { CreateEnvironmentDialog, type CreateEnvironmentDraft } from "./create-environment-dialog";
import { EnvironmentsEmpty } from "./environments-empty";
import { EnvironmentRows } from "./environment-rows";
import { archiveProjectToast, saveGeneralSettingsToast } from "./environment-status";
import type { ProjectEnvironment, ProjectGeneralSettings, ProjectRepository } from "./types";
import {
  environmentSelectOptions,
  normalizeSettingsTab,
  SETTINGS_TABS,
} from "./settings-helpers";
import { SettingsRow, SettingsSection } from "./settings-section";
import { ShortcutsPage } from "./shortcuts-page";
import { AppearanceCard } from "./appearance-card";
import { AgentsSettingsPanel, type AgentsSettingsTab } from "./agents-settings-panel";
import { CoreCard } from "./core-card";
import { PrivacyCard } from "./privacy-card";
import { dynamicSettingsEntries, SETTINGS_SEARCH_ENTRIES } from "./settings-search";

export type { EnvironmentKind, ProjectEnvironment, ProjectGeneralSettings, ProjectRepository, ProtectionLevel, SettingsTabId } from "./types";
export type { CreateEnvironmentDraft } from "./create-environment-dialog";
export { SETTINGS_ENVIRONMENT_MOCKS, PROJECT_GENERAL_SETTINGS_MOCK } from "./fixtures";
export {
  environmentKindLabel,
  environmentKindTone,
  protectionLabel,
  protectionTone,
} from "./environment-status";
export { normalizeSettingsTab, SETTINGS_TABS } from "./settings-helpers";
export { EnvironmentRows } from "./environment-rows";
export { SettingsRow, SettingsSection } from "./settings-section";
export { CreateEnvironmentDialog } from "./create-environment-dialog";
export { ShortcutsPage } from "./shortcuts-page";
export { AgentsSettingsPanel, type AgentsSettingsTab } from "./agents-settings-panel";
export { TruthFactsPage } from "./truth-facts-page";
export { ActivityPage } from "./activity-page";
export { hydrateShortcutPreferences, persistShortcutOverrides } from "./shortcut-persist";
export { hydrateAppearancePreferences, persistReduceTransparency } from "./appearance-persist";
export { AppearanceCard } from "./appearance-card";
export { PrivacyCard } from "./privacy-card";

/** Project-scoped settings persisted in the local store. */
export function SettingsView(props: {
  open: boolean;
  onClose: () => void;
  tab?: string;
  projectId?: string;
  general?: ProjectGeneralSettings;
  environments?: ProjectEnvironment[];
  repositories?: ProjectRepository[];
  loading?: boolean;
  onTabChange?: (t: string) => void;
  /** Integrations tab body; the host supplies it so this package stays independent of the Integrations feature. */
  renderIntegrations?: (tab: "connected" | "catalog", setTab: (tab: "connected" | "catalog") => void) => JSX.Element;
  onSaveGeneral?: (settings: ProjectGeneralSettings) => void;
  onAddRepository?: (draft: { name: string; path: string }) => Promise<void> | void;
  onRemoveRepository?: (name: string) => Promise<void> | void;
  onBrowseRepository?: () => Promise<string | null | undefined>;
  onCreateEnvironment?: (draft: CreateEnvironmentDraft) => void;
  onSetDefaultEnvironment?: (environmentId: string) => void;
  onDeleteEnvironment?: (environmentId: string) => void;
  onArchiveProject?: () => void;
  onResetLocalStore?: () => void;
}) {
  const tab = () => normalizeSettingsTab(props.tab);
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
  const [resetOpen, setResetOpen] = createSignal(false);
  const [createOpen, setCreateOpen] = createSignal(false);

  createEffect(() => {
    const next = general();
    if (!next) return;
    setName(next.name);
    setDescription(next.description);
    setDefaultEnvironmentId(next.defaultEnvironmentId);
    setRepository(next.repository);
  });

  async function handleAddRepository() {
    const name = repoName().trim();
    const path = repoPath().trim();
    if (!name || !path || !props.onAddRepository) return;
    setRepoBusy(true);
    try {
      await props.onAddRepository({ name, path });
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

  async function handleRemoveRepository(name: string) {
    if (!props.onRemoveRepository) return;
    setRepoBusy(true);
    try {
      await props.onRemoveRepository(name);
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

  const activeTab = () => SETTINGS_TABS.find((item) => item.id === tab());
  const headingFor = (item?: (typeof SETTINGS_TABS)[number]) =>
    item && (item.group === "Agents" || item.group === "Integrations") ? `${item.group} · ${item.label}` : item?.label;

  const searchEntries = createMemo(() =>
    [...SETTINGS_SEARCH_ENTRIES, ...dynamicSettingsEntries(environments())].map((entry) => ({ ...entry, item: entry.tab })),
  );

  return (
    <>
      <SettingsDialog
        open={props.open}
        title="Project settings"
        items={SETTINGS_TABS.map((item) => ({ id: item.id, label: item.label, group: item.group, icon: item.tooltip?.icon }))}
        active={tab()}
        onSelect={(id) => props.onTabChange?.(id)}
        searchEntries={searchEntries()}
        heading={headingFor(activeTab())}
        actions={
          <Show when={tab() === "environments"}>
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} aria-hidden /> Add environment
            </Button>
          </Show>
        }
        loading={props.loading}
        onClose={props.onClose}
      >
        <Show when={tab() === "general"}>
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
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Description" for="settings-project-description">
              <Textarea
                id="settings-project-description"
                class="w-72"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Primary repository" for="settings-project-repo">
              <Input
                id="settings-project-repo"
                size="md"
                class="w-72"
                placeholder="org/repo"
                value={repository()}
                onInput={(e) => setRepository(e.currentTarget.value)}
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
                variant="ghost"
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
                onInput={(e) => setRepoName(e.currentTarget.value)}
              />
            </SettingsRow>
            <SettingsRow label="Path" for="settings-repo-path">
              <Input
                id="settings-repo-path"
                size="md"
                class="w-72"
                placeholder="/path/to/checkout"
                value={repoPath()}
                onInput={(e) => setRepoPath(e.currentTarget.value)}
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

          <PrivacyCard />
        </Show>

        <Show when={tab() === "environments"}>
          <SettingsSection title="Environments">
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
        </Show>

        <Show when={tab().startsWith("agents-")}>
          <AgentsSettingsPanel
            projectId={props.projectId ?? ""}
            tab={tab().slice("agents-".length) as AgentsSettingsTab}
          />
        </Show>

        <Show when={tab().startsWith("integrations-")}>
          {props.renderIntegrations?.(
            tab() === "integrations-catalog" ? "catalog" : "connected",
            (next) => props.onTabChange?.(`integrations-${next}`),
          )}
        </Show>

        <Show when={tab() === "shortcuts"}>
          <ShortcutsPage />
        </Show>

        <Show when={tab() === "advanced"}>
          <AppearanceCard />
          <CoreCard />
          <SettingsSection
            title="Danger zone"
            description="Reset recreates the demonstration project in the local store. Architecture, resources, and knowledge are replaced."
          >
            <SettingsRow label="Archive project" description="Hide this project from the switcher.">
              <Button size="sm" variant="danger" onClick={() => setArchiveOpen(true)}>
                Archive project
              </Button>
            </SettingsRow>
            <SettingsRow label="Reset local store" description="Delete local data and reseed the demonstration project.">
              <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
                Reset local store
              </Button>
            </SettingsRow>
          </SettingsSection>
        </Show>
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
            <Button size="sm" variant="ghost" onClick={() => setArchiveOpen(false)}>
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
      <A11yDialog
        open={resetOpen()}
        title="Reset local store?"
        size="sm"
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setResetOpen(false);
                props.onResetLocalStore?.();
              }}
            >
              Reset store
            </Button>
          </>
        }
      >
        <p class="m-0 text-[12.5px] text-[var(--color-text-secondary)]">
          This deletes local project data and reseeds the demonstration project.
        </p>
      </A11yDialog>
    </>
  );
}
