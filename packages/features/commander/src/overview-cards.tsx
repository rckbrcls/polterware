import { For, Show } from "solid-js";
import {
  BookOpen,
  Cloud,
  IconTile,
  type IconTileTone,
} from "@polterware/frontend-design-system";
import "./overview-cards.css";

export type OverviewCardModel = {
  id: string;
  title: string;
  /** One short status line under the title. */
  subtitle: string;
  tone?: IconTileTone;
  openCommandId: string;
};

const ICONS: Record<string, typeof BookOpen> = {
  knowledge: BookOpen,
  integrations: Cloud,
};

/** Compact overview cards for the global Commander home (not in-app ⌘K). */
export function OverviewCards(props: {
  cards: OverviewCardModel[];
  hidden?: boolean;
  onSelect: (cardId: string) => void;
}) {
  return (
    <Show when={!props.hidden && props.cards.length > 0}>
      <div class="commander-overview [-webkit-app-region:no-drag]">
        <div class="commander-overview__grid">
          <For each={props.cards}>
            {(card) => {
              const Icon = ICONS[card.id] ?? BookOpen;
              return (
                <button
                  type="button"
                  class="commander-overview-card card-texture"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    props.onSelect(card.id);
                  }}
                >
                  <IconTile size={24} tone={card.tone ?? "neutral"} seed={card.id}>
                    <Icon size={14} aria-hidden />
                  </IconTile>
                  <div class="commander-overview-card__text">
                    <p class="commander-overview-card__title">{card.title}</p>
                    <p class="commander-overview-card__subtitle">{card.subtitle}</p>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}
