import { For, Show } from "solid-js";
import { parseSnippet, type SearchHitJSON } from "./model";

export function HighlightedSnippet(props: { snippet?: string; class?: string }) {
  const parts = () => parseSnippet(props.snippet);
  return (
    <span class={props.class} data-search-snippet>
      <For each={parts()}>
        {part => (
          <Show when={part.highlight} fallback={part.text}>
            <strong>{part.text}</strong>
          </Show>
        )}
      </For>
    </span>
  );
}

export function hitLabel(hit: SearchHitJSON): string {
  return hit.title || "Untitled note";
}
