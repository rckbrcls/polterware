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

let backHandler: (() => boolean) | undefined;

/** The app goes back in its history; it returns false when there is nowhere to go back to. */
export function setPageBackHandler(next: (() => boolean) | undefined) {
  backHandler = next;
}

/**
 * The Back of an open page: the place it was opened from (a Structure node, a list), like the
 * title bar's back; with no history, the page closes back to its list.
 */
export function requestPageBack() {
  if (!backHandler?.()) requestDetailExpanded(false);
}

let sectionHandler: ((section: string, tab?: string) => void) | undefined;

/** The app routes what a page asks for through its trail, such as a crumb back to Truth › Docs. */
export function setSectionNavigateHandler(next: ((section: string, tab?: string) => void) | undefined) {
  sectionHandler = next;
}

/** Leave the open page for a section (its default tab when `tab` is omitted). */
export function requestSectionNavigate(section: string, tab?: string) {
  sectionHandler?.(section, tab);
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
