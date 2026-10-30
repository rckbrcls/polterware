import { children, Show, type JSX } from "solid-js";
import { IconTile } from "./icon-tile";
import "./option-tile.css";

/**
 * The 20px icon tile that leads every option of a list in a popover (pickers, selects,
 * filter menus), so a list reads like the rows it picks from. Without an icon it shows
 * the label's initial.
 */
export function OptionTile(props: { label: string; seed?: string; children?: JSX.Element }) {
  const icon = children(() => props.children);
  const initial = () => props.label.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "·";
  return (
    <IconTile size={20} tone="neutral" class="pw-option-tile" seed={`option-${props.seed ?? props.label}`}>
      <Show when={icon()} fallback={<span class="pw-option-tile__initial" data-initial={initial()} />}>{icon()}</Show>
    </IconTile>
  );
}
