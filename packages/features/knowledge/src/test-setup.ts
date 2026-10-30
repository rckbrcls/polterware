import { vi } from "vitest";

// Component tests run in jsdom (a file comment opts in); shared UI imports read matchMedia on load.
if (typeof window !== "undefined") {
  // @ts-expect-error The shared setup is a side-effect script, not a module.
  await import("../../../frontend/design-system/test/setup");
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion"), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}
