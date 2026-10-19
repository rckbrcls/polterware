import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Button, CollapsibleSection, MapPin, PageContent, PageError, PageLoading, PageOffline, PageToolbar, DetailPanel } from "@polterware/frontend-design-system";
import { MapView } from "@polterware/frontend-map";
import { NoteDetailHost, useNotesShell } from "@polterware/feature-notes-shell/feature";
import { mapStore, type MapStore } from "./store";
import "./map-page.css";

export function MapPage(props: { store?: MapStore }) {
  const store = props.store ?? mapStore;
  const shell = useNotesShell();
  const [listOpen, setListOpen] = createSignal(false);

  onMount(() => onCleanup(store.connect()));

  createEffect(() => {
    const id = store.selectedId();
    if (id) shell.openNote(id);
  });

  return (
    <NoteDetailHost><div data-map-page class="notes-map-page">
      <PageToolbar.Root>
        <PageToolbar.Leading>
          <h1 class="m-0 truncate text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">Map</h1>
        </PageToolbar.Leading>
      </PageToolbar.Root>
      <PageContent class="notes-map-page__body">
        <Show when={store.loadState() === "queued"}><PageLoading label="Loading places" /></Show>
        <Show when={store.loadState() === "unavailable"}>
          <PageOffline title="Map unavailable" message={store.loadError() || "The local core is unreachable."} onRetry={() => void store.reload()} />
        </Show>
        <Show when={store.loadState() === "failed"}>
          <PageError title="Map failed" message={store.loadError()} onRetry={() => void store.reload()} />
        </Show>
        <Show when={store.loadState() === "live"}>
          <DetailPanel.Root class="notes-map-page__panel" mode="overlay" resizable shortcuts={false} expandable={false}
            storageKey="pwnotes.map.places.width" open={listOpen()} onOpenChange={setListOpen} aria-label="Places">
            <DetailPanel.Collection>
              <section class="notes-map-page__canvas" aria-label="Map canvas">
                <MapView
                  online
                  controlsPosition="top-left"
                  center={store.center()}
                  zoom={store.zoom()}
                  markers={store.markers()}
                  selectedId={store.selectedId() ?? undefined}
                  onSelect={id => store.select(id)}
                  onBoundsChange={(box, zoom) => store.setBounds(box, zoom)}
                />
                <Show when={!listOpen()}>
                  <Button variant="icon" data-detail-opener class="notes-map-page__list-toggle" aria-label="Show places" title="Show places" onClick={() => setListOpen(true)}>
                    <MapPin size={16} />
                  </Button>
                </Show>
              </section>
            </DetailPanel.Collection>
            <DetailPanel.Content>
              <DetailPanel.Header />
              <DetailPanel.Body layout="document">
                <DetailPanel.Main class="!px-4 !pb-4 !pt-0">
                  <CollapsibleSection title="Places" icon={<MapPin size={14} />}>
                    <Show when={store.places().length} fallback={<p class="text-[13px] text-[var(--color-text-muted)]">No places yet. Pin a note from its Place card.</p>}>
                      <ul class="notes-map-page__rows">
                        <For each={store.places()}>{place => (
                          <li>
                            <Button
                              variant="ghost"
                              class={`notes-map-page__row ${store.selectedId() === place.noteId ? "is-selected" : ""}`}
                              aria-current={store.selectedId() === place.noteId ? "true" : undefined}
                              onClick={() => store.select(place.noteId)}
                            >
                              <span class="notes-map-page__row-title">{place.title}</span>
                              <span class="notes-map-page__row-meta">{place.name || `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}</span>
                            </Button>
                          </li>
                        )}</For>
                      </ul>
                    </Show>
                  </CollapsibleSection>
                </DetailPanel.Main>
              </DetailPanel.Body>
            </DetailPanel.Content>
          </DetailPanel.Root>
        </Show>
      </PageContent>
    </div></NoteDetailHost>
  );
}
