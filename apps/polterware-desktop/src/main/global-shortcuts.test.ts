import { describe, expect, it, vi } from "vitest";
import {
  GLOBAL_COMMANDER_SHORTCUT,
  registerGlobalCommanderShortcut,
  type GlobalShortcutRegistry,
} from "./global-shortcuts.js";

function createRegistry(registerResult: boolean): GlobalShortcutRegistry {
  return {
    register: vi.fn().mockReturnValue(registerResult),
    unregister: vi.fn(),
  };
}

describe("registerGlobalCommanderShortcut", () => {
  it("registers the provided accelerator and unregisters it on cleanup", () => {
    const shortcuts = createRegistry(true);
    const log = { info: vi.fn(), warn: vi.fn() };
    const onToggleCommander = vi.fn();

    const unregister = registerGlobalCommanderShortcut({
      accelerator: GLOBAL_COMMANDER_SHORTCUT,
      log,
      onToggleCommander,
      shortcuts,
    });

    expect(shortcuts.register).toHaveBeenCalledWith(GLOBAL_COMMANDER_SHORTCUT, onToggleCommander);
    expect(log.info).toHaveBeenCalledWith(
      `Registered global Commander shortcut ${GLOBAL_COMMANDER_SHORTCUT}.`,
    );

    unregister();

    expect(shortcuts.unregister).toHaveBeenCalledWith(GLOBAL_COMMANDER_SHORTCUT);
  });

  it("logs registration failures without unregistering an unowned shortcut", () => {
    const shortcuts = createRegistry(false);
    const log = { info: vi.fn(), warn: vi.fn() };

    const unregister = registerGlobalCommanderShortcut({
      accelerator: GLOBAL_COMMANDER_SHORTCUT,
      log,
      onToggleCommander: vi.fn(),
      shortcuts,
    });

    expect(log.warn).toHaveBeenCalledWith(
      `Could not register global Commander shortcut ${GLOBAL_COMMANDER_SHORTCUT}. Another app may already own it.`,
    );

    unregister();

    expect(shortcuts.unregister).not.toHaveBeenCalled();
  });
});
