/** One line of a document's history: who changed it, what they did, and why. */
export type DocumentChange = {
  id: string;
  actorKind: string;
  actor: string;
  agentRunId: string;
  runStatus: string;
  summary: string;
  rationale: string;
  createdAt: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Reads the core's change rows, newest first, and folds a run of the same person or agent
 * making the same change (an autosave burst) into its latest line.
 */
export function mapDocumentChanges(raw: unknown): DocumentChange[] {
  const changes = (raw as { changes?: unknown })?.changes;
  const out: DocumentChange[] = [];
  for (const item of Array.isArray(changes) ? changes : []) {
    const row = (item ?? {}) as Record<string, unknown>;
    let rationale = "";
    try {
      rationale = text((JSON.parse(text(row.payloadJson) || "{}") as Record<string, unknown>).rationale);
    } catch {
      // A payload that is not JSON has no rationale to show.
    }
    const actorKind = text(row.actorKind) || "agent";
    const change: DocumentChange = {
      id: text(row.stepId),
      actorKind,
      actor: text(row.agentLabel) || (actorKind === "human" ? "Someone" : "An agent"),
      agentRunId: text(row.agentRunId),
      runStatus: text(row.runStatus),
      summary: text(row.summary),
      rationale: rationale.trim(),
      createdAt: text(row.createdAt),
    };
    if (!change.id) continue;
    const previous = out[out.length - 1];
    if (previous && previous.actor === change.actor && previous.summary === change.summary && !change.rationale) continue;
    out.push(change);
  }
  return out;
}
