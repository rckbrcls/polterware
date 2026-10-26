import type { JSX } from "solid-js";
import { For } from "solid-js";

import { Tooltip } from "./tooltip";
import "./texture-button-group.css";

export type TextureButtonGroupItem = {
  /** Drives aria-label and the shared Tooltip. */
  label: string;
  icon: JSX.Element;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * One texture pill split into icon segments (back / forward). The segments share a single
 * frame; each has its own face, hover, press, and disabled state.
 */
export function TextureButtonGroup(props: { label: string; items: readonly TextureButtonGroupItem[]; class?: string }) {
  return (
    <div role="group" aria-label={props.label} class={["pw-texture-group", props.class].filter(Boolean).join(" ")}>
      <For each={props.items}>
        {(item) => (
          <Tooltip.Root disabled={item.disabled}>
            <Tooltip.Trigger
              asChild={(triggerProps) => (
                <button
                  {...triggerProps({ type: "button", "aria-label": item.label, disabled: item.disabled, onClick: item.onClick })}
                  class="pw-texture-group__segment"
                >
                  {item.icon}
                </button>
              )}
            />
            <Tooltip.Content>{item.label}</Tooltip.Content>
          </Tooltip.Root>
        )}
      </For>
    </div>
  );
}
