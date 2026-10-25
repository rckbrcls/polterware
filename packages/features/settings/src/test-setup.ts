import { vi } from "vitest";

// Shared UI imports include charts that observe the current pixel ratio.
vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
  matches: false, media: query, onchange: null,
  addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
})));
