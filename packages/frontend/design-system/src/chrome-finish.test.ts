import { describe, expect, it } from "vitest";
import { chromeStopsFromTint } from "./chrome-finish";

const TINT = [0.2, 0.45, 0.9] as const;

describe("chromeStopsFromTint", () => {
  it("builds the hard silver ramp with duplicate seams and a near-white highlight", () => {
    const stops = chromeStopsFromTint(TINT);
    expect(stops).toHaveLength(7);
    expect(stops.map((stop) => stop.position)).toEqual([0.18, 0.43, 0.43, 0.55, 0.55, 0.7, 0.7]);
    expect(stops[2]?.color).toEqual(stops[0]?.color);
    expect(stops[3]?.color).toEqual(stops[0]?.color);
    expect(stops[5]?.color).toEqual(stops[4]?.color);
    expect(stops[6]?.color).toEqual(stops[0]?.color);
    const highlight = stops[0]?.color ?? [0, 0, 0];
    expect(highlight.every((channel) => channel > 0.8)).toBe(true);
    const valley = stops[4]?.color ?? [1, 1, 1];
    expect(Math.max(...valley)).toBeLessThan(Math.min(...highlight));
  });

  it("keeps the same ramp for every horizon and smooth argument", () => {
    expect(chromeStopsFromTint(TINT, 0.2, true)).toEqual(chromeStopsFromTint(TINT, 0.8, false));
  });
});
