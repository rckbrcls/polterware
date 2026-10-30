import { For, Show } from "solid-js";
import { StatusChip } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";

/**
 * A record's Context in a table row: one chip per Structure node it is about (the first three, then
 * "+N"), or "Whole project" when it has none. The full paths are the cell's tooltip.
 */
export function ContextChips(props: { ids: readonly string[]; nodes: readonly ScopeNodeItem[] }) {
  const nodes = () => props.nodes.filter((node) => props.ids.includes(node.id));
  return (
    <span class="flex min-w-0 flex-wrap items-center gap-1" title={nodes().map((node) => node.path).join(", ") || undefined}>
      <Show when={nodes().length > 0} fallback={<StatusChip tone="muted" label="Whole project" />}>
        <For each={nodes().slice(0, 3)}>{(node) => <StatusChip tone="muted" label={node.title} />}</For>
        <Show when={nodes().length > 3}><StatusChip tone="muted" label={`+${nodes().length - 3}`} /></Show>
      </Show>
    </span>
  );
}
