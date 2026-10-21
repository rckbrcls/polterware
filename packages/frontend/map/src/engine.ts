/// <reference path="./supercluster.d.ts" />
/// <reference path="./worker-url.d.ts" />
import Supercluster from "supercluster";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { OPENFREEMAP_DARK_STYLE } from "./style";
import { mapTokenColors, type MapTokenColors } from "./tokens";
import type { MapBounds, MapCenter, MapMarker, MapPick, MapProviderId } from "./types";

export type MapEngineHandle = {
  destroy: () => void;
  setCenter: (center: MapCenter, zoom: number) => void;
  setMarkers: (markers: MapMarker[], selectedId?: string) => void;
  resize: () => void;
};

type EngineOptions = {
  center: MapCenter;
  zoom: number;
  markers: MapMarker[];
  selectedId?: string;
  pickEnabled?: boolean;
  controlsPosition?: "top-left" | "top-right";
  provider?: MapProviderId;
  onSelect?: (id: string) => void;
  onPick?: (pick: MapPick) => void;
  onBoundsChange?: (bounds: MapBounds, zoom: number) => void;
};

type PointProps = { id: string; radius: number };

function boundsOf(map: MapLibreMap): MapBounds {
  const box = map.getBounds();
  return { south: box.getSouth(), west: box.getWest(), north: box.getNorth(), east: box.getEast() };
}

export async function createMapEngine(container: HTMLElement, options: EngineOptions): Promise<MapEngineHandle | null> {
  if ((options.provider ?? "maplibre") !== "maplibre") return null;
  const maplibre = await import("maplibre-gl");
  // MapLibre resolves its worker from import.meta.url, which breaks once Vite pre-bundles or packages it.
  maplibre.setWorkerUrl(maplibreWorkerUrl);
  await import("maplibre-gl/dist/maplibre-gl.css");
  const colors: MapTokenColors = mapTokenColors(container);
  const clusterIndex = new Supercluster<PointProps>({ radius: 50, maxZoom: 16 });
  let markers = options.markers;
  let selectedId = options.selectedId;
  let map: MapLibreMap | null = null;
  let pickMarker: Marker | null = null;
  let radiusIds: string[] = [];
  let destroyed = false;
  let styleReady = false;
  let interactionsBound = false;

  const reportEngineError = (operation: string, error: unknown) => {
    console.error(`Map engine ${operation} failed.`, error);
  };

  const loadIndex = () => {
    clusterIndex.load(markers.map(marker => ({
      type: "Feature" as const,
      properties: { id: marker.id, radius: marker.radius ?? 0 },
      geometry: { type: "Point" as const, coordinates: [marker.lng, marker.lat] },
    })));
  };

  const syncClusters = () => {
    if (!map || !styleReady || !map.isStyleLoaded()) return;
    try {
      loadIndex();
      const box = map.getBounds();
      const zoom = Math.max(0, Math.floor(map.getZoom()));
      const clusters = clusterIndex.getClusters([box.getWest(), box.getSouth(), box.getEast(), box.getNorth()], zoom);
      const source = map.getSource("markers") as GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: clusters.map(feature => ({
          type: "Feature" as const,
          properties: feature.properties,
          geometry: feature.geometry,
        })),
      });
      for (const id of radiusIds) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      radiusIds = [];
      for (const marker of markers) {
        if (!marker.radius) continue;
        const id = `radius-${marker.id}`;
        radiusIds.push(id);
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "Point", coordinates: [marker.lng, marker.lat] }, properties: {} },
        });
        map.addLayer({
          id,
          type: "circle",
          source: id,
          paint: {
            "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, 0, 20, marker.radius / 0.075],
            "circle-color": colors.brand,
            "circle-opacity": 0.14,
            "circle-stroke-color": colors.brand,
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.7,
          },
        }, "clusters");
      }
      const selected = selectedId ? markers.find(item => item.id === selectedId) : undefined;
      if (selected && pickMarker) pickMarker.setLngLat([selected.lng, selected.lat]);
    } catch (error) {
      reportEngineError("cluster sync", error);
    }
  };

  const ensureStyle = () => {
    if (!map || destroyed || !map.isStyleLoaded()) return false;
    try {
      if (!map.getSource("markers")) {
        map.addSource("markers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("clusters")) {
        map.addLayer({ id: "clusters", type: "circle", source: "markers", filter: ["has", "point_count"], paint: {
          "circle-color": colors.brand, "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
        } });
      }
      if (!map.getLayer("cluster-count")) {
        map.addLayer({ id: "cluster-count", type: "symbol", source: "markers", filter: ["has", "point_count"],
          layout: { "text-field": "{point_count_abbreviated}", "text-size": 11 }, paint: { "text-color": colors.canvas } });
      }
      if (!map.getLayer("unclustered")) {
        map.addLayer({ id: "unclustered", type: "circle", source: "markers", filter: ["!", ["has", "point_count"]], paint: {
          "circle-color": colors.brand, "circle-radius": ["case", ["==", ["get", "id"], selectedId ?? ""], 10, 7],
          "circle-stroke-color": colors.canvas, "circle-stroke-width": 2,
        } });
      }
      styleReady = true;
      return true;
    } catch (error) {
      styleReady = false;
      reportEngineError("style setup", error);
      return false;
    }
  };

  loadIndex();
  map = new maplibre.Map({
    container,
    style: OPENFREEMAP_DARK_STYLE,
    center: [options.center.lng, options.center.lat],
    zoom: options.zoom,
    attributionControl: { compact: true, customAttribution: "Map tiles from OpenFreeMap · © OpenMapTiles · © OpenStreetMap" },
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), options.controlsPosition ?? "top-right");

  map.on("load", () => {
    if (!map || destroyed) return;
    if (!ensureStyle()) return;
    if (options.pickEnabled) {
      const start = selectedId ? markers.find(item => item.id === selectedId) : undefined;
      pickMarker = new maplibre.Marker({ color: colors.brand, draggable: true })
        .setLngLat([start?.lng ?? options.center.lng, start?.lat ?? options.center.lat])
        .addTo(map);
      pickMarker.on("dragend", () => {
        const lngLat = pickMarker?.getLngLat();
        if (lngLat) options.onPick?.({ lat: lngLat.lat, lng: lngLat.lng });
      });
    }
    if (interactionsBound) return;
    interactionsBound = true;
    map.on("click", "clusters", event => {
      const feature = event.features?.[0];
      if (!feature || !map) return;
      const clusterId = Number(feature.properties?.cluster_id);
      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      const geometry = feature.geometry as { coordinates: [number, number] };
      map.easeTo({ center: geometry.coordinates, zoom: expansionZoom });
    });
    map.on("click", "unclustered", event => {
      const id = event.features?.[0]?.properties?.id as string | undefined;
      if (id) options.onSelect?.(id);
    });
    map.on("click", event => {
      if (!options.pickEnabled || !event.originalEvent.shiftKey) return;
      pickMarker?.setLngLat(event.lngLat);
      options.onPick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    map.on("moveend", () => {
      if (!map) return;
      syncClusters();
      options.onBoundsChange?.(boundsOf(map), map.getZoom());
    });
    syncClusters();
    options.onBoundsChange?.(boundsOf(map), map.getZoom());
  });
  map.on("styledataloading", () => { styleReady = false; });
  map.on("styledata", () => {
    if (ensureStyle()) syncClusters();
  });

  return {
    destroy: () => {
      destroyed = true;
      pickMarker?.remove();
      pickMarker = null;
      // A map whose GPU context never initialized can throw while tearing down.
      try { map?.remove(); } catch (error) { reportEngineError("teardown", error); }
      map = null;
    },
    setCenter: (center, zoom) => {
      try { map?.easeTo({ center: [center.lng, center.lat], zoom }); }
      catch (error) { reportEngineError("center update", error); }
    },
    setMarkers: (next, nextSelected) => {
      markers = next;
      selectedId = nextSelected;
      try {
        if (styleReady && map?.isStyleLoaded() && map.getLayer("unclustered")) {
          map.setPaintProperty("unclustered", "circle-radius", ["case", ["==", ["get", "id"], selectedId ?? ""], 10, 7]);
        }
      } catch (error) {
        reportEngineError("marker update", error);
      }
      syncClusters();
    },
    resize: () => { map?.resize(); },
  };
}
