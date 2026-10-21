import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { createMapEngine, type MapEngineHandle } from "./engine";
import type { MapViewProps } from "./types";
import "./map-view.css";

/**
 * Shared map primitive. OpenFreeMap tiles load whenever the MapLibre provider is used.
 */
export function MapView(props: MapViewProps) {
  let container: HTMLDivElement | undefined;
  const [engine, setEngine] = createSignal<MapEngineHandle | null>(null);
  let generation = 0;

  const live = () => (props.provider ?? "maplibre") === "maplibre";

  createEffect(() => {
    const online = live();
    const provider = props.provider ?? "maplibre";
    const pickEnabled = Boolean(props.pickEnabled);
    const onSelect = props.onSelect;
    const onPick = props.onPick;
    const onBoundsChange = props.onBoundsChange;
    generation += 1;
    const current = generation;
    let local: MapEngineHandle | null = null;
    setEngine(null);
    if (!online || !container) return;
    void createMapEngine(container, {
      provider,
      pickEnabled,
      controlsPosition: untrack(() => props.controlsPosition),
      onSelect,
      onPick,
      onBoundsChange,
      center: untrack(() => props.center),
      zoom: untrack(() => props.zoom),
      markers: untrack(() => props.markers),
      selectedId: untrack(() => props.selectedId),
    }).then(next => {
      if (current !== generation) {
        next?.destroy();
        return;
      }
      local = next;
      setEngine(next);
    }).catch(error => {
      console.error("Map view initialization failed.", error);
      if (current === generation) setEngine(null);
    });
    onCleanup(() => {
      generation += 1;
      local?.destroy();
      setEngine(null);
    });
  });

  createEffect(() => {
    // Zoom follows the user; only a new center (selection, first fit) moves the camera.
    const center = props.center;
    engine()?.setCenter(center, untrack(() => props.zoom));
  });

  createEffect(() => {
    engine()?.setMarkers(props.markers, props.selectedId);
  });

  createEffect(() => {
    if (!container || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => engine()?.resize());
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={element => { container = element; }}
      class={`pw-map-view ${props.class ?? ""}`}
      role="application"
      aria-label="Map"
      data-map-online={live() ? "true" : "false"}
    />
  );
}
