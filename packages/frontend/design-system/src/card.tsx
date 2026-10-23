import type { JSX } from "solid-js";

/**
 * Nested card with concentric rings by default, or a framed gradient texture.
 * Prefer this over ad-hoc border + bg cards in features.
 */
export function Card(props: {
  children: JSX.Element;
  class?: string;
  /** `rings` preserves the nested card finish; `texture` shares the button frame and face. */
  variant?: "rings" | "texture";
  ref?: HTMLDivElement | ((element: HTMLDivElement) => void);
}) {
  return (
    <div ref={props.ref} class={`${props.variant === "texture" ? "card-texture-framed" : "card-panel"} p-3 ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

/**
 * Elevated host surface — same chrome as MainSurface / dialog panel.
 * Use for large quiet panels; use `float` for overlays (dialogs already use surface-panel-float).
 */
export function Surface(props: {
  children: JSX.Element;
  class?: string;
  /** Add outer lift for floating panels (not nested in MainSurface). */
  float?: boolean;
}) {
  return (
    <div
      class={`${props.float ? "surface-panel-float" : "surface-panel"} overflow-hidden ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}
