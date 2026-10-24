import { createMemo, createSignal, Show, type JSX } from "solid-js";
import {
  A11yDialog,
  Button,
  SettingsDialog,
} from "@polterware/frontend-design-system";
import { normalizeSettingsTab, SETTINGS_TABS } from "./settings-helpers";
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
export { ProjectSettingsDialog } from "./project-settings-dialog";

/** App settings: agents, integrations, shortcuts, and this computer. */
export function SettingsView(props: {
  open: boolean;
  onClose: () => void;
  tab?: string;
  projectId?: string;
  loading?: boolean;
  onTabChange?: (t: string) => void;
  /** Integrations tab body; the host supplies it so this package stays independent of the Integrations feature. */
  renderIntegrations?: (tab: "connected" | "catalog", setTab: (tab: "connected" | "catalog") => void) => JSX.Element;
  onResetLocalStore?: () => void;
}) {
  const tab = () => normalizeSettingsTab(props.tab);
  const [resetOpen, setResetOpen] = createSignal(false);

  const activeTab = () => SETTINGS_TABS.find((item) => item.id === tab());
  const headingFor = (item?: (typeof SETTINGS_TABS)[number]) =>
    item && (item.group === "Agents" || item.group === "Integrations") ? `${item.group} · ${item.label}` : item?.label;

  const searchEntries = createMemo(() =>
    [...SETTINGS_SEARCH_ENTRIES, ...dynamicSettingsEntries()].map((entry) => ({ ...entry, item: entry.tab })),
  );

  return (
    <>
      <SettingsDialog
        open={props.open}
        title="Settings"
        items={SETTINGS_TABS.map((item) => ({ id: item.id, label: item.label, group: item.group, icon: item.tooltip?.icon }))}
        active={tab()}
        onSelect={(id) => props.onTabChange?.(id)}
        searchEntries={searchEntries()}
        heading={headingFor(activeTab())}
        loading={props.loading}
        onClose={props.onClose}
      >
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
          <PrivacyCard />
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
