import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Button, LayoutDashboard, X } from "@polterware/frontend-design-system";
import type { PlatformContext } from "@polterware/frontend-platform";
import { OverviewCards, type OverviewCardModel } from "./overview-cards";
import { OverviewDetail } from "./overview-detail";
import type { OverviewDetailPayload, OverviewId } from "./overview-types";
import { PaletteBody } from "./palette-body";
import type { PaletteItem } from "./palette-items";
import "./commander.css";
import "./commander-window.css";

type CommanderView = { kind: "home" } | { kind: "detail"; cardId: OverviewId };

function isOverviewId(value: string): value is OverviewId {
  return value === "knowledge" || value === "integrations";
}

/**
 * Global Commander surface for the frameless Electron overlay window.
 * Search stays at the top; overview cards drill in without leaving the overlay.
 */
export function CommanderWindow(props: {
  onClose: () => void;
  onCommand?: (id: string) => void;
  onOpenDesktop?: () => void;
  items?: PaletteItem[];
  platform?: PlatformContext;
  onFocusSearch?: (focus: () => void) => () => void;
  overviewCards?: OverviewCardModel[];
  overviewDetail?: OverviewDetailPayload;
}) {
  let searchInput: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal("");
  const [view, setView] = createSignal<CommanderView>({ kind: "home" });

  function focusSearch() {
    searchInput?.focus();
    searchInput?.select();
  }

  function goHome() {
    setView({ kind: "home" });
  }

  function openDesktop(commandId?: string) {
    if (commandId) {
      props.onCommand?.(commandId);
    } else {
      props.onOpenDesktop?.();
    }
    props.onClose();
  }

  onMount(() => {
    focusSearch();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view().kind === "detail") {
        goHome();
        return;
      }
      props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));

    const unsubscribe = props.onFocusSearch?.(focusSearch);
    if (unsubscribe) onCleanup(unsubscribe);
  });

  const detailCardId = () => {
    const current = view();
    return current.kind === "detail" ? current.cardId : null;
  };
  const showOverview = () => view().kind === "home" && query().trim().length === 0;

  const emptyDetail = (): OverviewDetailPayload => ({
    features: [],
    integrations: [],
  });

  return (
    <div class="commander-window-root">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        class="commander-window-panel commander-panel surface-panel-float"
      >
        <div class="flex min-h-0 flex-1 flex-col px-0 pb-3">
          <PaletteBody
            items={props.items}
            platform={props.platform}
            onCommand={(id) => openDesktop(id)}
            onQueryChange={(next) => {
              setQuery(next);
              if (next.trim().length > 0 && view().kind === "detail") {
                goHome();
              }
            }}
            searchRowClass="commander-window-search"
            hideResults={detailCardId() !== null}
            searchInputRef={(el) => {
              searchInput = el;
            }}
            trailing={
              <>
                <Button
                  variant="icon"
                  class="commander-action"
                  aria-label="Open Desktop"
                  title="Open Desktop"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openDesktop();
                  }}
                >
                  <LayoutDashboard size={16} aria-hidden />
                </Button>
                <Button
                  variant="icon"
                  class="commander-action"
                  aria-label="Close"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    props.onClose();
                  }}
                >
                  <X size={16} aria-hidden />
                </Button>
              </>
            }
            belowSearch={
              <Show when={detailCardId()}>
                {(cardId) => (
                  <div class="flex min-h-0 flex-1 flex-col">
                    <OverviewDetail
                      cardId={cardId()}
                      detail={props.overviewDetail ?? emptyDetail()}
                      onBack={goHome}
                      onOpenDesktop={(commandId) => openDesktop(commandId)}
                    />
                  </div>
                )}
              </Show>
            }
            scrollLeading={
              <Show when={showOverview()}>
                <OverviewCards
                  cards={props.overviewCards ?? []}
                  onSelect={(cardId) => {
                    if (!isOverviewId(cardId)) return;
                    setView({ kind: "detail", cardId });
                  }}
                />
              </Show>
            }
          />
        </div>
      </div>
    </div>
  );
}
