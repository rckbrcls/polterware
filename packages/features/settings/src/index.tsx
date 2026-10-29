import { createMemo, createSignal, Show, type JSX } from "solid-js";
import {
  A11yDialog,
  Button,
  SettingsDialog,
} from "@polterware/frontend-design-system";
import { CliReferenceSettings } from "@polterware/feature-shell";
import { normalizeSettingsTab, settingsTabScope, settingsTabsFor, SETTINGS_TABS } from "./settings-helpers";
import { SettingsRow, SettingsSection } from "./settings-section";
import { ShortcutsPage } from "./shortcuts-page";
import { AppearanceCard } from "./appearance-card";
import { AgentsSettingsPanel, type AgentsSettingsTab } from "./agents-settings-panel";
import { CoreCard } from "./core-card";
import { PrivacyCard } from "./privacy-card";
import { dynamicSettingsEntries, SETTINGS_SEARCH_ENTRIES } from "./settings-search";
import type { ProjectSettingsPageId } from "./types";

export type { EnvironmentKind, ProjectEnvironment, ProjectGeneralSettings, ProjectRepository, ProjectSettingsPageId, ProtectionLevel, SettingsTabId } from "./types";
export type { CreateEnvironmentDraft } from "./create-environment-dialog";
export { SETTINGS_ENVIRONMENT_MOCKS, PROJECT_GENERAL_SETTINGS_MOCK } from "./fixtures";
export {
  environmentKindLabel,
  environmentKindTone,
  protectionLabel,
  protectionTone,
} from "./environment-status";
export { normalizeSettingsTab, settingsTabScope, settingsTabsFor, SETTINGS_TABS, type SettingsScope } from "./settings-helpers";
export { EnvironmentRows } from "./environment-rows";
export { SettingsRow, SettingsSection } from "./settings-section";
export { CreateEnvironmentDialog } from "./create-environment-dialog";
export { ShortcutsPage } from "./shortcuts-page";
export { AgentsSettingsPanel, type AgentsSettingsTab } from "./agents-settings-panel";
export { ActivityPage } from "./activity-page";
export { hydrateShortcutPreferences, persistShortcutOverrides } from "./shortcut-persist";
export { hydrateAppearancePreferences, persistReduceTransparency } from "./appearance-persist";
export { AppearanceCard } from "./appearance-card";
export { PrivacyCard } from "./privacy-card";
export { ProjectSettingsDialog } from "./project-settings-dialog";

/**
 * Project settings (project, repositories, environments, agent context, platforms) or app settings
 * (agent tooling, the CLI reference, shortcuts, appearance, the local core); the tab picks which one opens.
 */
export function SettingsView(props: {
  open: boolean;
  onClose: () => void;
  tab?: string;
  projectId?: string;
  loading?: boolean;
  onTabChange?: (t: string) => void;
  /** Project controls share the host callbacks with the project switcher dialog. */
  renderProjectSettings?: (tab: ProjectSettingsPageId) => JSX.Element;
  /** Platforms share the host's integration data and connect flow. */
  renderPlatforms?: (tab: "connected" | "catalog") => JSX.Element;
  onResetLocalStore?: () => void;
}) {
  const tab = () => normalizeSettingsTab(props.tab);
  const [resetOpen, setResetOpen] = createSignal(false);

  const scope = () => settingsTabScope(tab());
  const tabs = () => settingsTabsFor(scope());
  const activeTab = () => SETTINGS_TABS.find((item) => item.id === tab());
  const headingFor = (item?: (typeof SETTINGS_TABS)[number]) =>
    item && item.group !== "App" ? `${item.group} / ${item.label}` : item?.label;

  const searchEntries = createMemo(() =>
    [...SETTINGS_SEARCH_ENTRIES, ...dynamicSettingsEntries()]
      .filter((entry) => settingsTabScope(entry.tab) === scope())
      .map((entry) => ({ ...entry, item: entry.tab })),
  );

  return (
    <>
      <SettingsDialog
        open={props.open}
        title={scope() === "project" ? "Project settings" : "App settings"}
        items={tabs().map((item) => ({ id: item.id, label: item.label, group: item.group, icon: item.tooltip.icon }))}
        active={tab()}
        onSelect={(id) => props.onTabChange?.(id)}
        searchEntries={searchEntries()}
        heading={headingFor(activeTab())}
        loading={props.loading}
        onClose={props.onClose}
      >
        <Show when={activeTab()?.group === "Project"}>
          {props.renderProjectSettings?.(tab() as ProjectSettingsPageId)}
        </Show>

        <Show when={tab() === "platforms-connected" || tab() === "platforms-catalog"}>
          {props.renderPlatforms?.(tab() === "platforms-catalog" ? "catalog" : "connected")}
        </Show>

        <Show when={tab() === "cli-reference"}>
          <CliReferenceSettings />
        </Show>

        <Show when={tab().startsWith("agents-")}>
          <AgentsSettingsPanel
            projectId={props.projectId ?? ""}
            tab={tab().slice("agents-".length) as AgentsSettingsTab}
          />
        </Show>

        <Show when={tab() === "shortcuts"}>
          <ShortcutsPage />
        </Show>

        <Show when={tab() === "appearance"}>
          <AppearanceCard />
        </Show>
        <Show when={tab() === "local-core"}>
          <CoreCard />
        </Show>
        <Show when={tab() === "privacy"}>
          <PrivacyCard />
        </Show>
        <Show when={tab() === "app-danger"}>
          <SettingsSection
            title="Danger zone"
            description="Reset recreates the demonstration project in the local store. Architecture, resources, and knowledge are replaced."
          >
            <SettingsRow label="Reset local store" description="Delete local data and reseed the demonstration project.">
              <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
                Reset local store
              </Button>
            </SettingsRow>
          </SettingsSection>
        </Show>
      </SettingsDialog>

      <A11yDialog
        open={resetOpen()}
        title="Reset local store?"
        size="sm"
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button size="sm" variant="texture" onClick={() => setResetOpen(false)}>
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
