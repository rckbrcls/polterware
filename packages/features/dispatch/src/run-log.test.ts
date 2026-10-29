import { describe, expect, it } from "vitest";
import { splitRunLog } from "./run-log";

describe("run log", () => {
  it("keeps the agent's Markdown whole between the core's event lines", () => {
    const log = "## Plan\n\n- Read the store\n- Add the handler\n[verified] all checks passed\nDone.\n";
    expect(splitRunLog(log)).toEqual([
      { kind: "text", text: "## Plan\n\n- Read the store\n- Add the handler" },
      { kind: "event", event: "verified", text: "all checks passed" },
      { kind: "text", text: "Done." },
    ]);
  });

  it("leaves bracketed lines inside a code fence as text, and an empty log as nothing", () => {
    expect(splitRunLog("```\n[note] not an event\n```")).toEqual([{ kind: "text", text: "```\n[note] not an event\n```" }]);
    expect(splitRunLog("  \n")).toEqual([]);
  });
});
