import { NOMINATIM_HOST } from "./style";
import { hrefOf, isMapNetworkUrl } from "./network";

export type GeocodeHit = {
  name: string;
  lat: number;
  lng: number;
};

export type GeocodeAdapter = {
  enabled: boolean;
  search(query: string): Promise<GeocodeHit[]>;
};

/** Address search stays off unless a dedicated setting enables it. */
export function createDisabledGeocoder(): GeocodeAdapter {
  return {
    enabled: false,
    async search() {
      return [];
    },
  };
}

/**
 * Nominatim adapter. Never constructed unless the opt-in setting is on.
 * Rate-limited to 1 request/s. Requires a future CSP host (see requests).
 */
export function createNominatimGeocoder(options: {
  enabled: boolean;
  fetch?: typeof fetch;
  userAgent?: string;
}): GeocodeAdapter {
  let lastAt = 0;
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  return {
    enabled: options.enabled,
    async search(query: string) {
      if (!options.enabled) return [];
      const trimmed = query.trim();
      if (!trimmed) return [];
      const wait = Math.max(0, 1000 - (Date.now() - lastAt));
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      lastAt = Date.now();
      const url = `https://${NOMINATIM_HOST}/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmed)}`;
      if (!isMapNetworkUrl(url)) return [];
      const response = await send(url, {
        headers: { Accept: "application/json", "User-Agent": options.userAgent ?? "PolterwareNotes/1.0 (local desktop map search)" },
      });
      if (!response.ok) throw new Error("Address search failed.");
      const rows = await response.json() as { display_name?: string; lat?: string; lon?: string }[];
      return rows.flatMap(row => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        return [{ name: row.display_name ?? trimmed, lat, lng }];
      });
    },
  };
}

export { hrefOf };
