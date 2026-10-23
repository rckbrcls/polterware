import { Show, onCleanup, onMount } from "solid-js";
import { PLACE_NOTICE, TILE_NOTICE } from "./model";
import { mapStore } from "./store";

export function MapSettingsPanel() {
  onMount(() => onCleanup(mapStore.connect()));

  return (
    <div data-map-settings class="flex flex-col gap-4">
      <p class="text-[13px] font-medium text-[var(--color-text-primary)]">Map</p>
      <p class="text-[13px] text-[var(--color-text-secondary)]">{TILE_NOTICE}</p>
      <p class="text-[13px] text-[var(--color-text-secondary)]">{PLACE_NOTICE}</p>
      <p class="text-[13px] text-[var(--color-text-muted)]">Address search is controlled in Settings → Map. It sends typed address text to Nominatim only when enabled. Changing it reloads Polterware Notes.</p>
      <Show when={mapStore.saveError()}><p role="alert" class="text-[13px] text-[var(--color-text-secondary)]">{mapStore.saveError()}</p></Show>
    </div>
  );
}
