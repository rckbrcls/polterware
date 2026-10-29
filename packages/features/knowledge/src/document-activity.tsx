import { For, Show, createEffect, createSignal, on } from "solid-js";
import { ActorIcon } from "@polterware/feature-shell";
import { activeProjectId } from "@polterware/frontend-state";
import { mapDocumentChanges, type DocumentChange } from "./document-activity-model";

type ChangesBridge = {
  listChanges: (payload: { projectId: string; subjectId: string; limit?: number }) => Promise<unknown>;
};

const LIMIT = 20;

function changesBridge(): ChangesBridge | undefined {
  const root = globalThis as { polterware?: { core?: { context?: { listChanges?: ChangesBridge["listChanges"] } } } };
  const listChanges = root.polterware?.core?.context?.listChanges;
  return listChanges ? { listChanges } : undefined;
}

/** "5m ago", "3h ago", "2d ago", then the date. */
function ago(value: string, now = Date.now()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The Activity section at the end of a document, as on a Linear issue: every justified
 * change that named this entity, newest first, with who made it and why. Hidden while the
 * entity has no history.
 */
export function DocumentActivity(props: { subjectId: string }) {
  const [changes, setChanges] = createSignal<DocumentChange[]>([]);
  let ticket = 0;

  createEffect(on(() => [activeProjectId(), props.subjectId] as const, async ([projectId, subjectId]) => {
    const current = ++ticket;
    const bridge = changesBridge();
    if (!bridge || !projectId || !subjectId) {
      setChanges([]);
      return;
    }
    try {
      const rows = mapDocumentChanges(await bridge.listChanges({ projectId, subjectId, limit: LIMIT }));
      if (current === ticket) setChanges(rows);
    } catch {
      if (current === ticket) setChanges([]);
    }
  }));

  return (
    <Show when={changes().length > 0}>
      <section class="pw-document-activity" aria-label="Activity">
        <h2 class="pw-document-activity__title">Activity</h2>
        <ol class="pw-document-activity__list">
          <For each={changes()}>
            {(change) => (
              <li class="pw-document-activity__item">
                <span class="pw-document-activity__actor">
                  <ActorIcon actorKind={change.actorKind} agentKey={change.actor} agentLabel={change.actor} seedKey={change.agentRunId || change.id} size={20} />
                </span>
                <div class="pw-document-activity__body">
                  <p class="pw-document-activity__line">
                    <span class="pw-document-activity__name">{change.actor}</span>{" "}
                    <span>{change.summary || "Changed this"}</span>
                    <Show when={ago(change.createdAt)}>
                      {(when) => <span class="pw-document-activity__when" title={new Date(change.createdAt).toLocaleString()}>{when()}</span>}
                    </Show>
                  </p>
                  <Show when={change.rationale}>
                    <p class="pw-document-activity__why">{change.rationale}</p>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ol>
      </section>
    </Show>
  );
}
