import { describe, expect, it } from "vitest";
import type { DispatchRunEventView } from "@polterware/feature-dispatch";
import { mergeActivityRows } from "./activity-rows";
import type { ProjectChangeRow } from "./agents-types";

const change = (stepId: string, createdAt: string): ProjectChangeRow => ({
  stepId, agentRunId: "", projectId: "p", actorKind: "human", agentLabel: "", runStatus: "", runTask: "",
  summary: stepId, payloadJson: "{}", createdAt,
});
const event = (id: string, at: string): DispatchRunEventView => ({
  id, runId: "run-1", projectId: "p", kind: "started", agent: "codex", tier: "easy", text: "", seq: 1, at,
});

describe("activity rows", () => {
  it("interleaves dispatch entries with changes by time, newest first", () => {
    const rows = mergeActivityRows(
      [change("c-new", "2026-10-02T10:00:00Z"), change("c-old", "2026-10-01T10:00:00Z")],
      [event("e-mid", "2026-10-01T12:00:00.500Z"), event("e-newest", "2026-10-03T08:00:00Z")],
    );
    expect(rows.map((row) => row.stepId)).toEqual(["dispatch:e-newest", "c-new", "dispatch:e-mid", "c-old"]);
  });
  it("keeps the input order for equal times and puts unreadable times last", () => {
    const rows = mergeActivityRows(
      [change("a", "2026-10-01T10:00:00Z"), change("broken", ""), change("b", "2026-10-01T10:00:00Z")],
      [],
    );
    expect(rows.map((row) => row.stepId)).toEqual(["a", "b", "broken"]);
  });
  it("labels a dispatch entry with its agent and tier", () => {
    const [row] = mergeActivityRows([], [event("e", "2026-10-01T10:00:00Z")]);
    expect(row).toMatchObject({ actorKind: "agent", agentLabel: "codex / easy", runTask: "Agent run (easy)", summary: "Agent run started" });
  });
});
