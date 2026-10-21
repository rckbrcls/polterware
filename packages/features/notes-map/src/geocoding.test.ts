import { afterEach, describe, expect, it, vi } from "vitest";
import { createAddressSearch } from "./geocoding";

afterEach(() => vi.useRealTimers());

describe("opt-in manual geocoding", () => {
  it("never fetches while off or for an empty address", async () => {
    const send = vi.fn();
    const search = createAddressSearch(send);
    expect(await search("Home", () => false)).toEqual([]);
    expect(await search(" ", () => true)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
  it("serializes requests at one per second and rechecks opt-in after waiting", async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    const send = vi.fn(async () => { times.push(Date.now()); return new Response(JSON.stringify([{ display_name: "Home", lat: "1", lon: "2" }])); });
    const search = createAddressSearch(send);
    const first = search("Home", () => true);
    const second = search("Studio", () => true);
    const third = search("Park", () => true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await first).toEqual([{ name: "Home", lat: 1, lng: 2 }]);
    await second; await third;
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(1000);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(1000);
    let enabled = true;
    const cancelled = search("Private address", () => enabled);
    await vi.advanceTimersByTimeAsync(10);
    enabled = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await cancelled).toEqual([]);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("reports blocked-host failures and explains the renderer reload", async () => {
    const search = createAddressSearch(vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(search("Home", () => true)).rejects.toThrow("Nominatim may be blocked or unavailable");
  });
});
