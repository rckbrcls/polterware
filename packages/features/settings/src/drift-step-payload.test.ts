import { describe, expect, it } from "vitest";
import {
  driftFindingSeverityTone,
  parseDriftStepPayload,
} from "./drift-step-payload";

describe("parseDriftStepPayload", () => {
  it("parses findings from drift step payloadJson", () => {
    const payload = JSON.stringify({
      findings: [
        {
          type: "task_done_unmatched",
          severity: "warning",
          summary: "task api T2 is done with no commit on main",
          subject_ids: ["task-1"],
        },
        {
          type: "commit_without_task",
          severity: "warning",
          summary: "commit is on main with no task",
        },
      ],
    });
    expect(parseDriftStepPayload(payload)).toEqual({
      findings: [
        {
          type: "task_done_unmatched",
          severity: "warning",
          summary: "task api T2 is done with no commit on main",
          subjectIds: ["task-1"],
        },
        {
          type: "commit_without_task",
          severity: "warning",
          summary: "commit is on main with no task",
          subjectIds: [],
        },
      ],
    });
  });

  it("returns empty findings for invalid or empty payload", () => {
    expect(parseDriftStepPayload("")).toEqual({ findings: [] });
    expect(parseDriftStepPayload("{")).toEqual({ findings: [] });
    expect(parseDriftStepPayload("{}")).toEqual({ findings: [] });
  });
});

describe("driftFindingSeverityTone", () => {
  it("maps narrow checker severities", () => {
    expect(driftFindingSeverityTone("info")).toBe("ok");
    expect(driftFindingSeverityTone("warning")).toBe("warn");
    expect(driftFindingSeverityTone("conflict")).toBe("danger");
    expect(driftFindingSeverityTone("other")).toBe("muted");
  });
});
