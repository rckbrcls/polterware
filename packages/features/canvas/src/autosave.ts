export type SaveState = "saved" | "pending" | "saving" | "error";

/** One writer per canvas. New edits coalesce; an older response never replaces local state. */
export function createAutosave<T>(write: (value: T) => Promise<unknown>, notify: (state: SaveState, error?: string) => void, delay = 500) {
  let latest: { version: number; value: T } | undefined;
  let version = 0;
  let savedVersion = 0;
  let running: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clearTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
  async function drain(): Promise<boolean> {
    while (latest && latest.version > savedVersion) {
      const snapshot = latest;
      notify("saving");
      try {
        await write(snapshot.value);
        savedVersion = snapshot.version;
      } catch (error) {
        notify("error", error instanceof Error ? error.message : String(error));
        return false;
      }
    }
    notify("saved");
    return true;
  }
  function flush(): Promise<boolean> {
    clearTimer();
    if (running) return running;
    running = drain().finally(() => { running = undefined; });
    return running;
  }
  return {
    schedule(value: T) {
      latest = { version: ++version, value };
      clearTimer();
      notify("pending");
      timer = setTimeout(() => { void flush(); }, delay);
    },
    flush,
  };
}
