import { NOMINATIM_HOST, OPENFREEMAP_HOST } from "./style";

const BLOCKED_HOSTS = [OPENFREEMAP_HOST, NOMINATIM_HOST, "protomaps.com", "protomaps.github.io", "tile.openstreetmap.org"];

export function hrefOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isMapNetworkUrl(url: string): boolean {
  try {
    const host = new URL(url, "https://local.invalid").hostname;
    return BLOCKED_HOSTS.some(item => host === item || host.endsWith(`.${item}`));
  } catch {
    return BLOCKED_HOSTS.some(item => url.includes(item));
  }
}

/** True only for the online MapLibre provider. */
export function shouldLoadMapTiles(online: boolean, provider: "maplibre" | "pmtiles" = "maplibre"): boolean {
  void online;
  return provider === "maplibre";
}

/**
 * Rejects tile/geocode fetches while the caller has disabled network access.
 */
export function installMapNetworkGuard(shouldAllow: () => boolean): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = hrefOf(input);
    if (isMapNetworkUrl(url) && !shouldAllow()) {
      throw new Error("Map network requests are blocked while map.online is off.");
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}
