import type { ChangeEvent } from "../../shared/bridge.js";
import type { CoreClients } from "./client.js";

export function startChangeWatcher(options: {
  getClients: () => CoreClients;
  reconnect: () => Promise<boolean>;
  emit: (event: ChangeEvent) => void;
}): () => void {
  const controller = new AbortController();
  let seq = 0n;
  void (async () => {
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        for await (const event of options.getClients().changes.watch({ sinceSeq: seq }, { signal: controller.signal })) {
          if (controller.signal.aborted) return;
          seq = event.seq;
          failures = 0;
          options.emit({ seq: String(seq), changes: event.changes.map(({ entity, id, op }) => ({ entity, id, op })), resync: event.snapshot });
        }
      } catch { /* Reconnect without logging server payloads or credentials. */ }
      if (controller.signal.aborted) return;
      await new Promise<void>(resolveDelay => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolveDelay(); };
        const timer = setTimeout(finish, Math.min(250 * 2 ** Math.min(failures++, 5), 5000));
        controller.signal.addEventListener("abort", finish, { once: true });
      });
      if (controller.signal.aborted) return;
      try {
        if (await options.reconnect()) seq = 0n;
        if (!controller.signal.aborted) options.emit({ seq: "0", changes: [], resync: true });
      } catch { /* Retry with bounded backoff. */ }
    }
  })();
  return () => controller.abort();
}
