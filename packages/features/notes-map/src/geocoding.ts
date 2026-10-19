import { createNominatimGeocoder, type GeocodeHit } from "@polterware/frontend-map";

export function createAddressSearch(send: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
  let queue: Promise<unknown> = Promise.resolve();
  let allowed: () => boolean = () => false;
  const adapter = createNominatimGeocoder({
    enabled: true,
    fetch: (input, init) => {
      if (!allowed()) throw new Error("Address search is off. No address was sent.");
      return send(input, init);
    },
  });
  return (query: string, enabled: () => boolean): Promise<GeocodeHit[]> => {
    if (!enabled() || !query.trim()) return Promise.resolve([]);
    const result = queue.catch(() => undefined).then(async () => {
      if (!enabled()) return [];
      allowed = enabled;
      try { return await adapter.search(query); }
      catch (error) {
        if (!enabled()) return [];
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Address search failed. Nominatim may be blocked or unavailable. If you just changed Address search, wait for Polterware Notes to reload and try again. ${detail}`);
      }
    });
    queue = result;
    return result;
  };
}

export const searchAddress = createAddressSearch();
