import { describe, expect, it } from "vitest";
import { plainSnippet } from "./snippet";

describe("Commander snippets", () => {
  it("strips FTS markers and never treats the value as HTML", () => {
    expect(plainSnippet("see <b>milk</b> here")).toBe("see milk here");
    expect(plainSnippet("<b>Note</b>")).toBe("Note");
    expect(plainSnippet("plain")).toBe("plain");
    expect(plainSnippet(undefined)).toBe("");
  });
});
