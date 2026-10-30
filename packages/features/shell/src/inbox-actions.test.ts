import { describe, expect, it } from "vitest";
import { keyActionTargets, sharedInboxActions } from "./inbox-actions";
import type { WorkspaceInboxAction } from "./workspace-mocks";

describe("Inbox bulk actions", () => {
  it("offers the no-answer actions every selected item has", () => {
    expect(sharedInboxActions([])).toEqual([]);
    expect(sharedInboxActions([{ actions: ["decide", "delegate", "defer"] }, { actions: ["decide", "defer", "ignore"] }])).toEqual(["defer"]);
    expect(sharedInboxActions([{ actions: ["defer", "ignore"] }, { actions: ["fix_code", "ignore"] }])).toEqual(["ignore"]);
    // Decide needs an answer, so it never runs on a selection.
    expect(sharedInboxActions([{ actions: ["decide"] }])).toEqual([]);
  });

  it("aims H and D at the selection when all offer it, else the active item", () => {
    const a = { id: "a", actions: ["defer", "ignore"] as WorkspaceInboxAction[] };
    const b = { id: "b", actions: ["decide", "defer"] as WorkspaceInboxAction[] };
    expect(keyActionTargets([a, b], undefined, "defer")).toEqual([a, b]);
    expect(keyActionTargets([a, b], a, "ignore")).toEqual([]);
    expect(keyActionTargets([], a, "ignore")).toEqual([a]);
    expect(keyActionTargets([], b, "ignore")).toEqual([]);
    expect(keyActionTargets([], undefined, "defer")).toEqual([]);
  });
});
