import { describe, expect, it } from "vitest";
import { mapInbox } from "./map-records";

describe("mapInbox", () => {
  it("maps items and counts, dropping unknown kinds and actions", () => {
    const inbox = mapInbox({
      items: [
        {
          id: "i3f9a2c1",
          kind: "decision",
          blocking: true,
          title: "Include merge commits?",
          options: ["yes", "no"],
          where: "git-metadata-import",
          state: "open",
          actions: ["decide", "delegate", "defer", "bogus"],
        },
        { id: "i07bd4e2", kind: "setup", title: "Connect vercel for app/web in production", state: "deferred", actions: ["ignore"] },
        { id: "idrift", kind: "drift", title: "dropped: drift is retired" },
        { id: "ixx", kind: "unknown", title: "dropped" },
      ],
      openCount: 1,
      blockingCount: 1,
    });

    expect(inbox.items.map((item) => item.id)).toEqual(["i3f9a2c1", "i07bd4e2"]);
    expect(inbox.items[0]?.actions).toEqual(["decide", "delegate", "defer"]);
    expect(inbox.items[0]?.options).toEqual(["yes", "no"]);
    expect(inbox.items[1]?.state).toBe("deferred");
    expect(inbox.openCount).toBe(1);
    expect(inbox.blockingCount).toBe(1);
  });

  it("returns an empty inbox for an empty response", () => {
    expect(mapInbox({})).toEqual({ items: [], openCount: 0, blockingCount: 0 });
  });
});
