import { Show, createEffect, createMemo, createSignal, type ComponentProps } from "solid-js";
import {
  DetailPanel,
  PageEmpty,
  PageError,
  PageSkeleton,
} from "@polterware/frontend-design-system";
import { canExpandDetail, createDetailPanelSelector, detailDisplayFor, detailPanelStore, isDocumentDetail } from "@polterware/frontend-state";
import { expandedDetail, requestDetailExpanded } from "./detail-expansion";
import { EntityDocumentContext } from "./entity-document";

export type EntityDetailHostProps = Pick<
  ComponentProps<typeof DetailPanel.Root>,
  "children" | "mode" | "resizable" | "class" | "pinned" | "storageKey"
>;

const ITEM_SELECTOR = "tr, [role='row'], [role='option'], [role='treeitem'], [aria-selected], [aria-current], [data-selected], article, li, [data-detail-opener]";
const CONTROL_SELECTOR = "input, textarea, select, a, [contenteditable='true'], [data-scope='menu']";

/** Page-owned entity panel backed by the shared selection store. */
export function EntityDetailHost(props: EntityDetailHostProps) {
  const open = createDetailPanelSelector((state) => state.open);
  const activeScope = createDetailPanelSelector((state) => state.activeScope);
  const available = createDetailPanelSelector((state) => state.available);
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);
  const collectionStatus = createDetailPanelSelector((state) => state.collectionStatus);
  const [documentHost, setDocumentHost] = createSignal<HTMLDivElement>();

  // The route owns expansion: expanded only inside the scope of the entity it names.
  const pageRoute = createMemo(() => {
    const target = expandedDetail();
    return target !== null && target.scopeId === activeScope();
  });
  // Documents occupy the collection canvas; the same lateral panel holds their properties.
  const pageOnly = createMemo(() => detailDisplayFor(activeTarget()?.entityKind) === "page");
  const documentKind = createMemo(() => isDocumentDetail(activeTarget()?.entityKind));
  const expandable = createMemo(() => !documentKind() && canExpandDetail(activeTarget()?.entityKind));
  const documentPage = () => documentKind() && pageRoute();
  const expanded = () => !documentKind() && pageRoute();
  // A document page shows its properties in its own rail, so the floating frame stays closed.
  const panelOpen = () => open() && !documentPage() && (!pageOnly() || pageRoute());
  createEffect(() => {
    if (open() && pageOnly() && !pageRoute()) detailPanelStore.getState().hide();
  });
  createEffect(() => {
    // Document navigation does not expand the properties card.
    if (detailPanelStore.getState().expanded !== expanded()) detailPanelStore.setState({ expanded: expanded() });
  });
  createEffect(() => {
    // Back/Forward into an expanded entry restores that entity's selection.
    const target = expandedDetail();
    const active = activeTarget();
    if (!target || (active?.scopeId === target.scopeId && active.entityId === target.entityId && active.entityKind === target.entityKind)) return;
    const state = detailPanelStore.getState();
    if (state.activeScope === target.scopeId) state.activateTarget(target);
    else state.requestTarget(target);
  });

  return (
    <EntityDocumentContext.Provider value={() => documentPage() ? documentHost() : undefined}>
      <DetailPanel.Root
        mode={documentKind() ? "overlay" : props.mode}
        resizable={props.resizable}
        expandable={expandable() && !props.pinned}
        pinned={props.pinned}
        class={props.class}
        open={panelOpen()}
        expanded={expanded()}
        available={available()}
        activeEntityId={activeTarget()?.entityId}
        onOpenChange={(next) => {
          const state = detailPanelStore.getState();
          if (next) state.show();
          else state.hide();
        }}
        onExpandedChange={(next) => { if (!documentKind()) requestDetailExpanded(next); }}
        storageKey={props.storageKey ?? "polterware.shell.detail.sidebar.width"}
        legacyStorageKey={props.storageKey ? undefined : "polterware.shell.detail.width"}
        aria-label="Entity details"
      >
        <DetailPanel.Collection>
          <Show when={documentPage()}>
            <div ref={setDocumentHost} class="flex h-full min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col" />
          </Show>
          <div
            class="contents"
            onDblClick={(event) => {
              // The click that precedes a double click already selected the item; open it as a page.
              // Pointer capture can retarget the event to a container, so hit-test the pointer position too.
              const hit = document
                .elementsFromPoint(event.clientX, event.clientY)
                .find((element) => element.closest(ITEM_SELECTOR) && event.currentTarget.contains(element));
              const node = hit ?? (event.target instanceof Element ? event.target : null);
              if (props.pinned || !node || expanded() || !node.closest(ITEM_SELECTOR) || node.closest(CONTROL_SELECTOR)) return;
              const state = detailPanelStore.getState();
              if (state.activeTarget ?? (state.lastTarget?.scopeId === state.activeScope ? state.lastTarget : null)) requestDetailExpanded(true);
            }}
          >
            {props.children}
          </div>
        </DetailPanel.Collection>
        <Show when={collectionStatus() === "loading" && !activeTarget()}>
          <DetailPanel.Content>
            <DetailPanel.Body>
              <DetailPanel.Main>
                <PageSkeleton layout="detail" label="Loading details…" class="min-h-0 p-0" />
              </DetailPanel.Main>
            </DetailPanel.Body>
          </DetailPanel.Content>
        </Show>
        <Show when={collectionStatus() === "error" && !activeTarget()}>
          <DetailPanel.Content>
            <DetailPanel.Body layout="document">
              <PageError message="The selected details could not be loaded." />
            </DetailPanel.Body>
          </DetailPanel.Content>
        </Show>
        <Show when={(collectionStatus() === "ready" || collectionStatus() === "idle") && !activeTarget()}>
          <DetailPanel.Content>
            <DetailPanel.Body layout="document">
              <PageEmpty title="Nothing selected" mood="lost" />
            </DetailPanel.Body>
          </DetailPanel.Content>
        </Show>
      </DetailPanel.Root>
    </EntityDocumentContext.Provider>
  );
}
