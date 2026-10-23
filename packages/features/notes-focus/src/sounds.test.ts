import { afterEach, describe, expect, it, vi } from "vitest";
import { playFocusSound } from "./sounds";

afterEach(() => { vi.restoreAllMocks(); });

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  decodeAudioData = vi.fn(async (buffer: ArrayBuffer) => ({ byteLength: buffer.byteLength }));
  createBufferSource() {
    return { buffer: undefined as unknown, connect: vi.fn(), start: vi.fn() };
  }
  createOscillator() {
    return { type: "sine", frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn() };
  }
}

describe("focus sounds", () => {
  it("skips playback when sounds are off", async () => {
    expect(await playFocusSound("glass", false)).toBe("skipped");
  });

  it("synthesizes a tone when the bundled file is unavailable", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const result = await playFocusSound("glass", true, async () => new Response(null, { status: 404 }));
    expect(result).toBe("synthesized");
  });

  it("decodes a bundled file through Web Audio when fetch succeeds", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const result = await playFocusSound("bell", true, async () => new Response(bytes, { status: 200 }));
    expect(result).toBe("played");
  });
});
