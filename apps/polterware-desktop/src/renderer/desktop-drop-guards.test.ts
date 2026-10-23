import { describe, expect, it, vi } from "vitest";
import { attachDesktopDropGuards } from "./desktop-drop-guards.js";

describe("attachDesktopDropGuards", () => {
  it("registers dragover and drop preventDefault handlers", () => {
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    };

    const detach = attachDesktopDropGuards(target as unknown as Window);

    expect(listeners.has("dragover")).toBe(true);
    expect(listeners.has("drop")).toBe(true);

    const event = { preventDefault: vi.fn() };
    listeners.get("drop")?.(event as unknown as Event);
    expect(event.preventDefault).toHaveBeenCalled();

    detach();
    expect(target.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
