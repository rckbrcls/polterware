import { describe, expect, it } from "vitest";
import { mapWorkCards } from "./map-records";

describe("mapWorkCards", () => {
  it("maps cards with tasks, questions, and invariants", () => {
    const cards = mapWorkCards([
      {
        id: "01J",
        slug: "git-metadata-import",
        title: "Git metadata import",
        stage: "plan",
        decisions: ["Verdict-0007"],
        updatedAt: "2026-09-28T12:00:00Z",
        tasks: [
          { id: "t1", number: 1, title: "Commit evidence upsert", state: "done" },
          { id: "t2", number: 2, title: "Stamp revision", state: "bogus", scope: "backend/*", claimHolder: "codex" },
        ],
        questions: [{ id: "q1", text: "Include merge commits?", blocking: true, options: ["yes", "no"], state: "open" }],
        invariants: [{ id: "i1", text: "No network calls during scan" }],
      },
      { id: "02J", slug: "untitled", stage: "unknown" },
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.stage).toBe("plan");
    expect(cards[0]?.tasks.map((task) => task.state)).toEqual(["done", "open"]);
    expect(cards[0]?.tasks.map((task) => task.claimHolder)).toEqual(["", "codex"]);
    expect(cards[0]?.questions[0]?.blocking).toBe(true);
    expect(cards[0]?.invariants[0]?.text).toBe("No network calls during scan");
    expect(cards[1]?.stage).toBe("shape");
    expect(cards[1]?.title).toBe("untitled");
  });
});
