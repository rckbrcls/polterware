import { afterEach, describe, expect, it, vi } from "vitest";
import { previewSound } from "./sounds";

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

describe("notification sound preview", () => {
  it("skips none", async () => {
    expect(await previewSound("none")).toBe("skipped");
  });

  it("synthesizes when the bundled file is missing", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    expect(await previewSound("glass", async () => new Response(null, { status: 404 }))).toBe("synthesized");
  });
});
