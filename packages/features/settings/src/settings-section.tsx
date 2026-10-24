import { Show, splitProps, type Component, type ComponentProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconTile, SettingsRow as SharedSettingsRow, type IconTileTone } from "@polterware/frontend-design-system";

export { SettingsSection } from "@polterware/frontend-design-system";

/** Shared setting row with an optional leading tile for list entries. */
export function SettingsRow(props: ComponentProps<typeof SharedSettingsRow> & {
  icon?: Component<{ size?: number }>;
  tone?: IconTileTone;
  seed?: string;
}) {
  const [tile, row] = splitProps(props, ["icon", "tone", "seed"]);
  return (
    <Show when={tile.icon} fallback={<SharedSettingsRow {...row} />}>
      {(icon) => (
        <div class="flex items-center gap-3">
          <IconTile size={24} tone={tile.tone} seed={tile.seed} class="shrink-0">
            <Dynamic component={icon()} size={14} />
          </IconTile>
          <div class="min-w-0 flex-1">
            <SharedSettingsRow {...row} />
          </div>
        </div>
      )}
    </Show>
  );
}
