import { onCleanup, onMount } from "solid-js";
import { Button } from "./button";
import { ArrowDown, ArrowUp } from "./hugeicons";

export type EntityNavigatorProps = {
  /** 1-based position of the open entity in the list it was opened from. */
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
};

function isTypingTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]"));
}

/**
 * "3 / 12" with previous and next buttons for an entity page opened from a list.
 * K and J move through the list while the page is open.
 */
export function EntityNavigator(props: EntityNavigatorProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
    if (event.key === "j" && props.position < props.total) {
      event.preventDefault();
      props.onNext();
    } else if (event.key === "k" && props.position > 1) {
      event.preventDefault();
      props.onPrevious();
    }
  };
  onMount(() => window.addEventListener("keydown", onKeyDown));
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  return (
    <div class="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)]">
      <span class="tabular-nums" aria-live="polite">
        {props.position} / {props.total}
      </span>
      <Button variant="ghost" size="icon" aria-label="Previous (K)" disabled={props.position <= 1} onClick={() => props.onPrevious()}>
        <ArrowUp size={14} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next (J)" disabled={props.position >= props.total} onClick={() => props.onNext()}>
        <ArrowDown size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
