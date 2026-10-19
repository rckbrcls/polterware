import type { CoreChangeEvent } from "../../shared/ipc";

/** Kinds that change the project shell (switcher, environments, settings, canvas). */
const SHELL_KINDS = new Set(["projects", "environments", "settings", "architecture"]);
/** Kinds held in the workspace extension slices. */
const EXTENSION_KINDS = new Set(["knowledge", "ppm", "integrations"]);

const DEBOUNCE_MS = 300;

export type ChangeRefresherOptions = {
  currentProjectId: () => string;
  refreshShell: (projectId: string) => Promise<void>;
  refreshExtensions: (projectId: string) => Promise<void>;
  refreshWork: (projectId: string) => Promise<void>;
  onError?: (error: unknown) => void;
};

/**
 * Collects core change events and, after a short quiet period, reloads only
 * the slices they touch for the current project. Events caused only by this
 * Desktop are skipped: its write paths already refresh what they changed, and
 * reloading on every Knowledge keystroke save would reset the editor.
 */
export function createChangeRefresher(options: ChangeRefresherOptions) {
  let kinds = new Set<string>();
  let resync = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  function relevant(event: CoreChangeEvent): boolean {
    if (event.resync) return true;
    if (event.origins.length > 0 && event.origins.every((origin) => origin === "desktop")) return false;
    const projectId = options.currentProjectId();
    // The project list shows every project, so any project row change counts.
    if (event.kinds.includes("projects")) return true;
    return event.projectIds.length === 0 || (projectId !== "" && event.projectIds.includes(projectId));
  }

  function flush() {
    timer = undefined;
    const projectId = options.currentProjectId();
    const pendingKinds = kinds;
    const pendingResync = resync;
    kinds = new Set();
    resync = false;
    if (!projectId) return;
    const has = (set: Set<string>) => pendingResync || [...pendingKinds].some((kind) => set.has(kind));
    running = running.then(async () => {
      try {
        if (has(SHELL_KINDS)) await options.refreshShell(projectId);
        if (has(EXTENSION_KINDS)) await options.refreshExtensions(projectId);
        else if (pendingKinds.has("work")) await options.refreshWork(projectId);
      } catch (error) {
        options.onError?.(error);
      }
    });
  }

  return {
    push(event: CoreChangeEvent) {
      if (!relevant(event)) return;
      if (event.resync) resync = true;
      for (const kind of event.kinds) kinds.add(kind);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
