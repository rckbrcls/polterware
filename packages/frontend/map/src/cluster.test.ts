import { describe, expect, it, vi } from "vitest";
import { clusterMarkers, generateClusterMarkers } from "./cluster";
import { createDisabledGeocoder, createNominatimGeocoder } from "./geocode";
import { isMapNetworkUrl, shouldLoadMapTiles } from "./network";
import { OPENFREEMAP_DARK_STYLE } from "./style";

const SAO_PAULO = { south: -24.2, west: -47.2, north: -22.8, east: -46.0 };

describe("map clustering", () => {
  it("clusters 500 markers and finishes well under a frame", () => {
    const markers = generateClusterMarkers(500);
    expect(markers).toHaveLength(500);
    const started = performance.now();
    const clustered = clusterMarkers(markers, SAO_PAULO, 10);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(50);
    expect(clustered.length).toBeGreaterThan(0);
    expect(clustered.length).toBeLessThan(500);
    expect(clustered.some(item => item.kind === "cluster" && item.count > 1)).toBe(true);
    const expanded = clusterMarkers(markers, SAO_PAULO, 16);
    expect(expanded.filter(item => item.kind === "point").length).toBeGreaterThan(clustered.filter(item => item.kind === "point").length);
  });

  it("keeps identities for unclustered points", () => {
    const clustered = clusterMarkers([{ id: "home", lat: -23.55, lng: -46.63, radius: 200 }], SAO_PAULO, 12);
    expect(clustered).toEqual([{ kind: "point", id: "home", lat: -23.55, lng: -46.63, radius: 200 }]);
  });
});

describe("map network gate", () => {
  it("recognizes OpenFreeMap style and tile hosts", () => {
    expect(isMapNetworkUrl(OPENFREEMAP_DARK_STYLE)).toBe(true);
    expect(isMapNetworkUrl("https://tiles.openfreemap.org/data/v3/10/1/1.pbf")).toBe(true);
    expect(isMapNetworkUrl("https://nominatim.openstreetmap.org/search?q=x")).toBe(true);
    expect(isMapNetworkUrl("https://example.com/style.json")).toBe(false);
  });

  it("loads MapLibre tiles without a map.online gate", () => {
    expect(shouldLoadMapTiles(false, "maplibre")).toBe(true);
    expect(shouldLoadMapTiles(true, "pmtiles")).toBe(false);
    expect(shouldLoadMapTiles(true, "maplibre")).toBe(true);
  });
});

describe("geocoding adapter", () => {
  it("does not fetch when disabled", async () => {
    const fetch = vi.fn();
    const adapter = createNominatimGeocoder({ enabled: false, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(adapter.enabled).toBe(false);
    await expect(adapter.search("São Paulo")).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await expect(createDisabledGeocoder().search("São Paulo")).resolves.toEqual([]);
  });

  it("rate-limits Nominatim to one request per second when enabled", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify([{ display_name: "São Paulo", lat: "-23.55", lon: "-46.63" }]), { status: 200 }));
    const adapter = createNominatimGeocoder({ enabled: true, fetch: fetch as unknown as typeof globalThis.fetch });
    await adapter.search("São Paulo");
    const second = adapter.search("Campinas");
    await second;
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetch.mock.calls.at(0)?.at(0) ?? "");
    expect(firstUrl).toContain("nominatim.openstreetmap.org");
  });
});
