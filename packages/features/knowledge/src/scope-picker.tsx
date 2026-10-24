import { createMemo } from "solid-js";
import { Select } from "@polterware/frontend-design-system";
import type { ScopeNodeItem } from "@polterware/feature-shell";

/** Picks the Atlas node an entity belongs to; the empty value is the whole project. */
export function ScopePicker(props: {
  nodes: readonly ScopeNodeItem[];
  /** Path of the selected node; empty for the whole project. */
  value: string;
  onChange: (path: string) => void;
  "aria-label"?: string;
  class?: string;
}) {
  const options = createMemo(() => [
    { value: "", label: "Whole project" },
    ...[...props.nodes]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((node) => ({ value: node.path, label: node.path })),
  ]);
  return (
    <Select
      size="sm"
      class={props.class ?? "w-full min-w-0"}
      aria-label={props["aria-label"] ?? "Atlas scope"}
      options={options()}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

/** Path of the node with `id`, or empty when it is gone or unset. */
export function scopePathOf(nodes: readonly ScopeNodeItem[], id: string | undefined): string {
  if (!id) return "";
  return nodes.find((node) => node.id === id)?.path ?? "";
}
