export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  radius?: number;
};

export type MapCenter = {
  lat: number;
  lng: number;
};

export type MapPick = {
  lat: number;
  lng: number;
};

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type MapProviderId = "maplibre" | "pmtiles";

export type MapViewProps = {
  center: MapCenter;
  zoom: number;
  markers: MapMarker[];
  selectedId?: string;
  online: boolean;
  provider?: MapProviderId;
  pickEnabled?: boolean;
  /** Corner for the zoom controls (default top-right). */
  controlsPosition?: "top-left" | "top-right";
  onSelect?: (id: string) => void;
  onPick?: (pick: MapPick) => void;
  onBoundsChange?: (bounds: MapBounds, zoom: number) => void;
  class?: string;
};
