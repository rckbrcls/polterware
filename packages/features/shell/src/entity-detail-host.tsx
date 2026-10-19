import { Show, type ComponentProps } from "solid-js";
import {
  DetailPanel,
  PageEmpty,
  PageError,
  PageSkeleton,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";

export type EntityDetailHostProps = Pick<
  ComponentProps<typeof DetailPanel.Root>,
  "children" | "mode" | "resizable" | "class"
>;

/** Page-owned entity panel backed by the shared selection store. */
export function EntityDetailHost(props: EntityDetailHostProps) {
  const open = createDetailPanelSelector((state) => state.open);
  const expanded = createDetailPanelSelector((state) => state.expanded);
  const available = createDetailPanelSelector((state) => state.available);
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);
  const collectionStatus = createDetailPanelSelector((state) => state.collectionStatus);

  return (
    <DetailPanel.Root
      mode={props.mode}
      resizable={props.resizable}
      class={props.class}
      open={open()}
      expanded={expanded()}
      available={available()}
      activeEntityId={activeTarget()?.entityId}
      onOpenChange={(next) => {
        const state = detailPanelStore.getState();
        if (next) state.show();
        else state.hide();
      }}
      onExpandedChange={(next) => {
        const state = detailPanelStore.getState();
        if (next) state.expand();
        else state.restore();
      }}
      storageKey="polterware.shell.detail.sidebar.width"
      legacyStorageKey="polterware.shell.detail.width"
      aria-label="Entity details"
    >
      <DetailPanel.Collection>{props.children}</DetailPanel.Collection>
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
