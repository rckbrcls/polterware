import { createSignal, onCleanup, onMount } from "solid-js";
import { CommanderWindow } from "@polterware/feature-commander";
import {
  hydrateAppearancePreferences,
  hydrateShortcutPreferences,
} from "@polterware/feature-settings";
import {
  loadCommanderOverview,
  type CommanderOverviewCard,
  type CommanderOverviewDetail,
} from "./load-commander-overview";
import { bootstrapPlatform } from "./platform-bootstrap";

const PLATFORM_CONTEXT = bootstrapPlatform();

const EMPTY_DETAIL: CommanderOverviewDetail = {
  features: [],
  integrations: [],
};

/**
 * Renderer entry for the frameless global Commander BrowserWindow
 * (`?surface=commander`). Must not mount the full Shell/App.
 */
export function CommanderApp() {
  const [overviewCards, setOverviewCards] = createSignal<CommanderOverviewCard[]>([]);
  const [overviewDetail, setOverviewDetail] = createSignal<CommanderOverviewDetail>(EMPTY_DETAIL);

  async function refreshOverview() {
    const snapshot = await loadCommanderOverview();
    setOverviewCards(snapshot.cards);
    setOverviewDetail(snapshot.detail);
  }

  onMount(() => {
    void hydrateShortcutPreferences();
    void hydrateAppearancePreferences();
    void refreshOverview();
    const unsubscribeFocus = window.polterware.commander.onFocusSearch(() => {
      void refreshOverview();
    });
    onCleanup(unsubscribeFocus);
  });

  return (
    <CommanderWindow
      platform={PLATFORM_CONTEXT}
      overviewCards={overviewCards()}
      overviewDetail={overviewDetail()}
      onClose={() => {
        void window.polterware.commander.hideOverlay();
      }}
      onOpenDesktop={() => {
        void window.polterware.commander.showMainWindow();
      }}
      onCommand={(id) => {
        void window.polterware.commander.runCommand(id);
      }}
      onFocusSearch={(focus) => window.polterware.commander.onFocusSearch(focus)}
    />
  );
}
