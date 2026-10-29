import { describe, expect, it } from "vitest";
import { mapDocumentChanges } from "./document-activity-model";

const row = (stepId: string, agentLabel: string, summary: string, rationale = "", actorKind = "human") => ({
  stepId, agentRunId: `run-${stepId}`, actorKind, agentLabel, runStatus: "completed", summary,
  payloadJson: JSON.stringify({ summary, ...(rationale ? { rationale } : {}) }), createdAt: "2026-10-29T10:00:00Z",
});

describe("document activity", () => {
  it("reads who changed the entity and why, folding an autosave burst into its latest line", () => {
    const changes = mapDocumentChanges({
      changes: [
        row("s3", "Ada", "Saved Local-first truth"),
        row("s2", "Ada", "Saved Local-first truth"),
        row("s1", "codex", "Proposed Local-first truth", "Agents need one rule for the store", "agent"),
        { stepId: "", summary: "dropped" },
      ],
    });
    expect(changes.map((change) => [change.id, change.actor, change.summary, change.rationale])).toEqual([
      ["s3", "Ada", "Saved Local-first truth", ""],
      ["s1", "codex", "Proposed Local-first truth", "Agents need one rule for the store"],
    ]);
    expect(mapDocumentChanges({ changes: [{ stepId: "x", actorKind: "human", payloadJson: "not json" }] })[0]).toMatchObject({ actor: "Someone", rationale: "" });
  });
});
