import { createEffect, createSignal } from "solid-js";
import { CARD_IDS, type CardId } from "./card-order";
import { autoArrange, loadAnchors, loadHidden, loadOrder, saveAnchors, saveHidden, saveOrder, type Anchors } from "./card-layout";

export type Layout = { order: CardId[]; anchors: Anchors };

/**
 * Dashboard card layout shared by the grid and the toolbar's layout menu: sequence order, anchored
 * cells and hidden cards, persisted. The mounted dashboard publishes which cards the host reports
 * and the column count, and binds its animated `arrange` so menu actions glide the cards.
 */
export function createCardLayoutState() {
  const [order, setOrder] = createSignal<CardId[]>(loadOrder());
  createEffect(() => saveOrder(order()));
  const [anchors, setAnchors] = createSignal<Anchors>(loadAnchors());
  createEffect(() => saveAnchors(anchors()));
  const [hidden, setHidden] = createSignal<CardId[]>(loadHidden());
  createEffect(() => saveHidden(hidden()));
  const [available, setAvailable] = createSignal<CardId[]>([]);
  const [cols, setCols] = createSignal(2);
  let arrange: ((next: Layout) => void) | null = null;

  const apply = (next: Layout) => {
    if (arrange) arrange(next);
    else {
      setOrder(next.order);
      setAnchors(next.anchors);
    }
  };
  const isHidden = (id: CardId) => hidden().includes(id);
  /** Cards the host reports and the person has not hidden. */
  const shown = () => available().filter((id) => !isHidden(id));

  return {
    order,
    setOrder,
    anchors,
    setAnchors,
    hidden,
    isHidden,
    available,
    shown,
    publish(next: { available: CardId[]; cols: number }) {
      setAvailable(next.available);
      setCols(next.cols);
    },
    bindArrange(next: ((layout: Layout) => void) | null) {
      arrange = next;
    },
    toggle(id: CardId) {
      if (isHidden(id)) setHidden(hidden().filter((other) => other !== id));
      else if (shown().some((other) => other !== id)) setHidden([...hidden(), id]);
    },
    /** Packs the shown cards with no holes and drops every anchor. */
    autoLayout() {
      const arranged = autoArrange(shown(), cols());
      const rest = order().filter((id) => !arranged.includes(id));
      apply({ order: [...arranged, ...rest], anchors: {} });
    },
    reset() {
      setHidden([]);
      apply({ order: [...CARD_IDS], anchors: {} });
    },
  };
}

export type CardLayoutState = ReturnType<typeof createCardLayoutState>;
