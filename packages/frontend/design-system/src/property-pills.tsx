import { Index, Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { Button } from "./button";
import { PropertyPicker, type PropertyOption, type PropertyPickerProps } from "./property-picker";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import { TokenPicker } from "./token-picker";
import "./property-pills.css";

/** One property pill under the title: it opens the shared property picker. */
export type ComposerSingleProperty = {
  id: string;
  /** The property, such as "Stage"; the pill shows it until a value is picked. */
  label: string;
  icon?: JSX.Element;
  options: readonly PropertyOption[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: PropertyPickerProps["onCreate"];
  /** The picker's width, for options with a second line. */
  pickerWidth?: number;
  /** Hides the pill, such as one that only applies once another property is set; it fades in and out. */
  hidden?: boolean;
};

/** A property that holds several values, edited as tokens (`TokenPicker`). */
export type ComposerTokensProperty = {
  id: string;
  label: string;
  icon?: JSX.Element;
  options: readonly PropertyOption[];
  values: readonly string[];
  onValuesChange: (values: string[]) => void;
  /** What no value means, such as "Whole project". */
  emptyLabel?: string;
};

export type ComposerProperty = ComposerSingleProperty | ComposerTokensProperty;

const isTokens = (property: ComposerProperty): property is ComposerTokensProperty => "values" in property;

/**
 * Keeps a pill mounted through its exit: it enters with a fade, a short slide from the
 * pill before it, and a slight scale on `spring.moderate`, and leaves on the quicker exit
 * tween before it unmounts. Interrupted, it turns back from where it is. Reduced motion
 * keeps only the fade.
 */
function PillPresence(props: { shown: boolean; children: JSX.Element }) {
  const [mounted, setMounted] = createSignal(props.shown);
  const alpha = motionValue(props.shown ? 1 : 0);
  const x = motionValue(0);
  const scale = motionValue(1);
  let element: HTMLSpanElement | undefined;
  let running: AnimationPlaybackControls[] = [];
  const paint = () => {
    if (!element) return;
    element.style.opacity = String(alpha.get());
    element.style.transform = `translateX(${x.get()}px) scale(${scale.get()})`;
  };
  const unsubscribe = [alpha.on("change", paint), x.on("change", paint), scale.on("change", paint)];
  const stop = () => { running.forEach((controls) => controls.stop()); running = []; };
  onCleanup(() => { stop(); unsubscribe.forEach((off) => off()); });

  createEffect(on(() => props.shown, (shown) => {
    stop();
    const reduced = prefersReducedMotion();
    if (shown) {
      // A pill that was fully gone starts from its hidden pose; one still leaving turns back.
      if (!mounted()) { alpha.jump(0); x.jump(reduced ? 0 : -6); scale.jump(reduced ? 1 : 0.96); }
      setMounted(true);
      paint();
      running = [animate(alpha, 1, spring.moderate), animate(x, 0, spring.moderate), animate(scale, 1, spring.moderate)];
      return;
    }
    if (!mounted()) return;
    const exit = { type: "tween" as const, ...spring.moderate.exit };
    running = [
      animate(alpha, 0, exit),
      ...(reduced ? [] : [animate(x, -6, exit), animate(scale, 0.96, exit)]),
    ];
    const leaving = running;
    void Promise.all(leaving.map((controls) => controls.finished)).then(() => {
      if (running === leaving) setMounted(false);
    }, () => undefined);
  }, { defer: true }));

  return (
    <Show when={mounted()}>
      <span ref={(node) => { element = node; paint(); }} class="pw-property-pills__pill" aria-hidden={props.shown ? undefined : "true"}>
        {props.children}
      </span>
    </Show>
  );
}

/**
 * A row of property pills, as under the Composer's title: each opens the shared
 * `PropertyPicker`, a tokens property opens the `TokenPicker`, and a `hidden` pill fades
 * out of the row. Also used outside the Composer, such as Commander's Run an agent row.
 */
export function PropertyPills(props: {
  properties: readonly ComposerProperty[];
  class?: string;
  /** After a picker closes, such as to hand focus back to a search field. */
  onPickerClose?: () => void;
}) {
  const [openProperty, setOpenProperty] = createSignal<string | null>(null);
  // Pills are keyed by position, so a changed value keeps the same element (and focus).
  const pills: HTMLElement[] = [];
  const valueLabel = (property: ComposerSingleProperty) =>
    property.options.find((option) => option.value === property.value)?.label ?? property.label;
  const valueIcon = (property: ComposerSingleProperty) =>
    property.options.find((option) => option.value === property.value)?.icon ?? property.icon;

  return (
    <div class={`pw-property-pills ${props.class ?? ""}`} role="group" aria-label="Properties">
      <Index each={props.properties}>
        {(entry, index) => (
          <Show
            when={!isTokens(entry()) && (entry() as ComposerSingleProperty)}
            fallback={
              <TokenPicker
                label={entry().label}
                icon={entry().icon}
                options={entry().options}
                values={(entry() as ComposerTokensProperty).values}
                onChange={(values) => (entry() as ComposerTokensProperty).onValuesChange(values)}
                emptyLabel={(entry() as ComposerTokensProperty).emptyLabel}
              />
            }
          >
            {(property) => (
              <PillPresence shown={!property().hidden}>
                <Button
                  ref={(element: HTMLButtonElement) => { pills[index] = element; }}
                  size="sm"
                  variant="texture"
                  aria-label={`${property().label}: ${valueLabel(property())}`}
                  aria-expanded={openProperty() === property().id}
                  onClick={() => setOpenProperty((current) => (current === property().id ? null : property().id))}
                >
                  {valueIcon(property())}
                  {valueLabel(property())}
                </Button>
                <PropertyPicker
                  label={property().label}
                  options={property().options}
                  value={property().value}
                  onChange={(value) => property().onChange(value)}
                  onCreate={property().onCreate}
                  width={property().pickerWidth}
                  open={openProperty() === property().id && !property().hidden}
                  onClose={() => { setOpenProperty(null); props.onPickerClose?.(); }}
                  anchorRef={() => pills[index]}
                />
              </PillPresence>
            )}
          </Show>
        )}
      </Index>
    </div>
  );
}
