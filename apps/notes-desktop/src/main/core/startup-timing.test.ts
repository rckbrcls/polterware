import { describe, expect, it } from "vitest";
import { createStartupClock, startupTimingEnabled } from "./startup-timing.js";

describe("startup timing clock", () => {
  it("records Main phases from a shared origin and ignores later marks", () => {
    let now = 1000;
    const clock = createStartupClock({ now: () => now });
    clock.mark("electron-ready");
    now = 1125;
    clock.mark("core-attach");
    now = 1180;
    clock.mark("policy-rpc");
    now = 1190;
    clock.mark("window-show");
    now = 1400;
    clock.mark("window-show");
    expect(clock.report()).toEqual({
      "electron-ready": 0,
      "core-attach": 125,
      "policy-rpc": 180,
      "window-show": 190,
    });
    expect(clock.format()).toBe("startup.electron-ready=0.0ms startup.core-attach=125.0ms startup.policy-rpc=180.0ms startup.window-show=190.0ms");
  });

  it("stays silent unless PWNOTES_STARTUP_TIMING=1", () => {
    expect(startupTimingEnabled({})).toBe(false);
    expect(startupTimingEnabled({ PWNOTES_STARTUP_TIMING: "0" })).toBe(false);
    expect(startupTimingEnabled({ PWNOTES_STARTUP_TIMING: "1" })).toBe(true);
    const clock = createStartupClock({ enabled: false, now: () => 50 });
    clock.mark("electron-ready");
    expect(clock.report()).toEqual({});
    expect(clock.format()).toBe("");
  });
});
