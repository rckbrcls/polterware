import type { CoreChangeEvent } from "../../shared/ipc.js";
import type { CoreClients } from "./client.js";

export type ChangeWatcherOptions = {
  getClients: () => CoreClients;
  /** Re-attaches to (or restarts) the core; true when it is a different core. */
  reconnect: () => Promise<boolean>;
  emit: (event: CoreChangeEvent) => void;
  log?: (message: string) => void;
};

/**
 * Keeps one WatchChanges stream open for the Desktop. When the stream ends
 * (core stopped, replaced, or crashed) it reconnects with backoff and asks
 * renderers to resync, since events may have been missed.
 */
export function startChangeWatcher(options: ChangeWatcherOptions): () => void {
  const controller = new AbortController();
  let afterSeq = 0n;

  void (async () => {
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        const stream = options.getClients().changes.watchChanges({ afterSeq }, { signal: controller.signal });
        for await (const change of stream) {
          failures = 0;
          afterSeq = change.seq;
          if (change.resync || change.kinds.length > 0) {
            options.emit({
              seq: Number(change.seq),
              projectIds: [...change.projectIds],
              kinds: [...change.kinds],
              origins: [...change.origins],
              resync: change.resync,
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        options.log?.(`Core change stream closed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (controller.signal.aborted) return;
      failures += 1;
      await delay(Math.min(250 * 2 ** (failures - 1), 5000));
      try {
        if (await options.reconnect()) afterSeq = 0n;
        options.emit({ seq: 0, projectIds: [], kinds: [], origins: [], resync: true });
      } catch (error) {
        options.log?.(`Core reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  })();

  return () => controller.abort();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
