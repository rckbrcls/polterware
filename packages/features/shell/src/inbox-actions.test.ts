import { describe, expect, it } from "vitest";
import { sharedInboxActions } from "./inbox-actions";

describe("Inbox bulk actions", () => {
  it("offers the no-answer actions every selected item has", () => {
    expect(sharedInboxActions([])).toEqual([]);
    expect(sharedInboxActions([{ actions: ["decide", "delegate", "defer"] }, { actions: ["decide", "defer", "ignore"] }])).toEqual(["defer"]);
    expect(sharedInboxActions([{ actions: ["verify", "reject"] }, { actions: ["verify", "defer"] }])).toEqual(["verify"]);
    // Decide needs an answer, so it never runs on a selection.
    expect(sharedInboxActions([{ actions: ["decide"] }])).toEqual([]);
  });
});
