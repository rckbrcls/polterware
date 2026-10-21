import { Show, createEffect, createMemo, type ComponentProps } from "solid-js";
import {
  DetailPanel,
  PageEmpty,
  PageError,
  PageSkeleton,
} from "@polterware/frontend-design-system";
import { canExpandDetail, createDetailPanelSelector, detailDisplayFor, detailPanelStore } from "@polterware/frontend-state";
import { expandedDetail, requestDetailExpanded } from "./detail-expansion";

export type EntityDetailHostProps = Pick<
  ComponentProps<typeof DetailPanel.Root>,
  "children" | "mode" | "resizable" | "class"
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

  // The route owns expansion: expanded only inside the scope of the entity it names.
  const expanded = createMemo(() => {
    const target = expandedDetail();
    return target !== null && target.scopeId === activeScope();
  });
  // Peek-only kinds never offer the expand control; page-only kinds never rest in the lateral panel.
  const expandable = createMemo(() => canExpandDetail(activeTarget()?.entityKind));
  // Page-only kinds never render the lateral panel, not even for a frame while the route collapses.
  const pageOnly = createMemo(() => detailDisplayFor(activeTarget()?.entityKind) === "page");
  const panelOpen = () => open() && (!pageOnly() || expanded());
  createEffect(() => {
    const target = activeTarget();
    if (open() && target && !expanded() && detailDisplayFor(target.entityKind) === "page") detailPanelStore.getState().hide();
  });
  createEffect(() => {
    // Mirrors the route into the store for panels that read it (document toolbar).
    if (detailPanelStore.getState().expanded !== expanded()) detailPanelStore.setState({ expanded: expanded() });
  });
  createEffect(() => {
    // Back/Forward into an expanded entry restores that entity's selection.
    const target = expandedDetail();
    if (!target || activeTarget()?.entityId === target.entityId) return;
    const state = detailPanelStore.getState();
    if (state.activeScope === target.scopeId) state.activateTarget(target);
    else state.requestTarget(target);
  });

  return (
    <DetailPanel.Root
      mode={props.mode}
      resizable={props.resizable}
      expandable={expandable()}
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
      onExpandedChange={requestDetailExpanded}
      storageKey="polterware.shell.detail.sidebar.width"
      legacyStorageKey="polterware.shell.detail.width"
      aria-label="Entity details"
    >
      <DetailPanel.Collection>
        <div
          class="contents"
          onDblClick={(event) => {
            // The click that precedes a double click already selected the item; open it as a page.
            // Pointer capture can retarget the event to a container, so hit-test the pointer position too.
            const hit = document
              .elementsFromPoint(event.clientX, event.clientY)
              .find((element) => element.closest(ITEM_SELECTOR) && event.currentTarget.contains(element));
            const node = hit ?? (event.target instanceof Element ? event.target : null);
            if (!node || expanded() || !node.closest(ITEM_SELECTOR) || node.closest(CONTROL_SELECTOR)) return;
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
            <PageEmpty title="No selection" description="Select an item to see its details." />
          </DetailPanel.Body>
        </DetailPanel.Content>
      </Show>
    </DetailPanel.Root>
  );
}
