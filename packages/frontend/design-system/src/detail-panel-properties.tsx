import { Show, type JSX } from "solid-js";
import { Plus } from "./hugeicons";

export type DetailPanelPropertiesProps = {
  children: JSX.Element;
  class?: string;
  /**
   * `list` = label column + right-aligned value (panels); `inline` = wrapping label/value pairs;
   * `rail` = a document's properties rail: muted label, then the value as a left-aligned ghost pill.
   */
  variant?: "list" | "inline" | "rail";
};

export type DetailPanelPropertyProps = {
  label: string;
  /** Empty values hide the row unless `onAdd` is provided. */
  value?: JSX.Element | null;
  mono?: boolean;
  onAdd?: () => void;
  class?: string;
};

function isEmptyValue(value: JSX.Element | null | undefined): boolean {
  return value === null || value === undefined || value === false || value === "";
}

export function DetailPanelProperties(props: DetailPanelPropertiesProps) {
  return (
    <dl
      class={`pw-detail-panel__properties ${props.class ?? ""}`}
      data-variant={props.variant ?? "list"}
    >
      {props.children}
    </dl>
  );
}

export function DetailPanelProperty(props: DetailPanelPropertyProps) {
  const empty = () => isEmptyValue(props.value);
  return (
    <Show when={!empty() || props.onAdd}>
      <div class={`pw-detail-panel__property ${props.class ?? ""}`}>
        <dt>{props.label}</dt>
        <dd classList={{ "font-mono": props.mono, "pw-selectable": props.mono }}>
          <Show
            when={!empty()}
            fallback={
              <button
                type="button"
                class="pw-detail-panel__property-add"
                onClick={() => props.onAdd?.()}
              >
                <Plus size={12} aria-hidden />
                Add {props.label.toLowerCase()}
              </button>
            }
          >
            {props.value}
          </Show>
        </dd>
      </div>
    </Show>
  );
}
