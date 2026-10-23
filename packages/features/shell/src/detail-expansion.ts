import { batch, createSignal } from "solid-js";
import { canExpandDetail, detailDisplayFor, detailPanelStore, type DetailTarget } from "@polterware/frontend-state";

/**
 * Expanding a detail is a navigation owned by the app's route. The route publishes the
 * expanded entity here; the panel host reads it and sends expand/collapse requests back.
 */
const [expandedDetail, setExpandedDetailTarget] = createSignal<DetailTarget | null>(null);
let handler: ((expanded: boolean) => void) | undefined;

export { expandedDetail, setExpandedDetailTarget };

export function setDetailExpandHandler(next: ((expanded: boolean) => void) | undefined) {
  handler = next;
}

/** The entity an expand request would act on: the active selection, else the scope's last one. */
function expandCandidate(): DetailTarget | null {
  const state = detailPanelStore.getState();
  return state.activeTarget ?? (state.lastTarget?.scopeId === state.activeScope ? state.lastTarget : null);
}

export function requestDetailExpanded(expanded: boolean) {
  const target = expandCandidate();
  if (expanded && target && !canExpandDetail(target.entityKind)) return;
  if (handler) handler(expanded);
  else if (expanded) detailPanelStore.getState().expand();
  else detailPanelStore.getState().restore();
  // A page-only entity has no lateral panel to fall back to, so leaving the page closes it.
  if (!expanded && target && detailDisplayFor(target.entityKind) === "page") detailPanelStore.getState().hide();
}

/**
 * User-initiated selection of an entity. Page-only kinds skip the lateral panel and
 * open as a full page right away; `registerCollection` auto-selection never does this.
 */
export function openDetail(target: DetailTarget) {
  if (detailDisplayFor(target.entityKind) !== "page") {
    detailPanelStore.getState().activateTarget(target);
    return;
  }
  const current = expandedDetail();
  const already = current?.scopeId === target.scopeId && current.entityId === target.entityId;
  // Publish the page before the selection so the lateral panel never renders (no peek flash).
  batch(() => {
    if (!already) setExpandedDetailTarget(target);
    detailPanelStore.getState().activateTarget(target);
  });
  if (!already) requestDetailExpanded(true);
}
