import { Button } from "@polterware/frontend-design-system";

export type { PaletteItem } from "./palette-items";
export { CARD_PALETTE_ITEMS, DEFAULT_PALETTE_ITEMS as DEFAULT_ITEMS } from "./palette-items";
export { CommandPalette } from "./command-palette";
export { RUN_AGENT_PREFIX } from "./palette-body";
export { CommanderWindow } from "./commander-window";
export { OverviewCards, type OverviewCardModel } from "./overview-cards";
export { OverviewDetail } from "./overview-detail";
export type {
  OverviewDetailPayload,
  OverviewId,
} from "./overview-types";
export { OVERVIEW_CARD_ORDER, OVERVIEW_TITLES } from "./overview-types";
export { SearchResultsPage, SEARCH_HITS, type SearchHit } from "./search-results";

/** @deprecated use CommandPalette */
export function CommanderView(props: { onCommand?: (id: string) => void }) {
  return (
    <section class="p-4">
      <p class="m-0 text-[13px] text-[var(--color-text-muted)]">
        Commander is available via the configured Commander shortcut as a command palette.
      </p>
      <Button size="sm" class="mt-2" onClick={() => props.onCommand?.("nav.structure")}>
        Open Structure
      </Button>
    </section>
  );
}
