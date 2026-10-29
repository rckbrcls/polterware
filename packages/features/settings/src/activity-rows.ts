import type { DispatchRunEventView } from "@polterware/feature-dispatch";
import type { ProjectChangeRow } from "./agents-types";

/** A dispatch history entry as an Activity row. */
export function dispatchEventRow(event: DispatchRunEventView): ProjectChangeRow {
  return {
    stepId: `dispatch:${event.id}`,
    agentRunId: event.runId,
    projectId: event.projectId,
    actorKind: "agent",
    agentLabel: event.agent ? `${event.agent}${event.tier ? ` · ${event.tier}` : ""}` : "dispatch",
    runStatus: event.kind,
    runTask: event.tier ? `Dispatch (${event.tier})` : "Dispatch",
    summary: event.text || `Dispatch ${event.kind}`,
    payloadJson: "{}",
    createdAt: event.at,
  };
}

function instant(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Changes and dispatch entries in one feed, newest first; rows without a readable time go last. */
export function mergeActivityRows(changes: readonly ProjectChangeRow[], events: readonly DispatchRunEventView[]): ProjectChangeRow[] {
  return [...changes, ...events.map(dispatchEventRow)]
    .map((row, index) => ({ row, index, at: instant(row.createdAt) }))
    .sort((a, b) => (b.at === a.at ? a.index - b.index : b.at > a.at ? 1 : -1))
    .map((entry) => entry.row);
}
