import { createMemo } from "solid-js";
import { Layers, TokenPicker } from "@polterware/frontend-design-system";
import { scopeContextOptions, type ScopeNodeItem } from "@polterware/feature-shell";

/**
 * Picks the Structure nodes an entity is about, as tokens like the scope filter menu's.
 * None is the whole project; for a decision, that makes it a principle.
 */
export function ContextPicker(props: {
  nodes: readonly ScopeNodeItem[];
  /** Ids of the picked nodes. */
  values: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const options = createMemo(() => scopeContextOptions(props.nodes));
  return (
    <TokenPicker
      label="Context"
      icon={<Layers size={14} />}
      emptyLabel="Whole project"
      options={options()}
      values={props.values}
      onChange={props.onChange}
      disabled={props.disabled}
    />
  );
}
