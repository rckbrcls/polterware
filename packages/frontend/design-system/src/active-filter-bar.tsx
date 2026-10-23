import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { DetailPanelCollectionHeader } from "./detail-panel";
import { Button } from "./button";
import { X } from "./hugeicons";
import "./button.css";
import "./active-filter-bar.css";

export type ActiveFilterPill = {
  id: string;
  label: string;
  onRemove: () => void;
};

/**
 * Removable active-filter pills under PageToolbar (Linear-style filter bar).
 * Hidden when there are no pills.
 */
export function ActiveFilterBar(props: {
  items: readonly ActiveFilterPill[];
  onClear?: () => void;
  clearLabel?: string;
  class?: string;
  "aria-label"?: string;
}): JSX.Element {
  return (
    <DetailPanelCollectionHeader>
      <Show when={props.items.length > 0}>
        <div
          class={`pw-active-filter-bar ${props.class ?? ""}`}
          role="group"
          aria-label={props["aria-label"] ?? "Active filters"}
        >
          <div class="pw-active-filter-bar__pills">
            <For each={props.items}>
              {(item) => (
                <span class="pw-active-filter-pill pw-texture-button">
                  <span class="pw-active-filter-pill__label">{item.label}</span>
                  <button
                    type="button"
                    class="pw-active-filter-pill__remove"
                    aria-label={`Remove ${item.label}`}
                    onClick={() => item.onRemove()}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </span>
              )}
            </For>
          </div>
          <Show when={props.onClear}>
            <Button
              size="sm"
              variant="texture"
              class="!h-auto shrink-0 !px-2.5 !py-1 text-[11px] rounded-full"
              onClick={() => props.onClear?.()}
            >
              {props.clearLabel ?? "Clear"}
            </Button>
          </Show>
        </div>
      </Show>
    </DetailPanelCollectionHeader>
  );
}
