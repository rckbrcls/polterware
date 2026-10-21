export {
  DEFAULT_GLOBAL_COMMANDER_ACCELERATOR as GLOBAL_COMMANDER_SHORTCUT,
} from "../shared/shortcut-preferences.js";

export interface GlobalShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface ShortcutLogger {
  info(message: string): void;
  warn(message: string): void;
}

export function registerGlobalCommanderShortcut({
  accelerator,
  log,
  onToggleCommander,
  shortcuts,
}: {
  accelerator: string;
  log: ShortcutLogger;
  onToggleCommander: () => void;
  shortcuts: GlobalShortcutRegistry;
}): () => void {
  const registered = shortcuts.register(accelerator, onToggleCommander);

  if (!registered) {
    log.warn(
      `Could not register global Commander shortcut ${accelerator}. Another app may already own it.`,
    );
    return () => {};
  }

  log.info(`Registered global Commander shortcut ${accelerator}.`);
  return () => shortcuts.unregister(accelerator);
}
