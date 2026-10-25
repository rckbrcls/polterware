import { afterEach, describe, expect, it } from "vitest";
import { scopeArgs, setActiveScope } from "./load";

describe("scopeArgs", () => {
  afterEach(() => {
    setActiveScope({ nodeIds: [] });
  });

  it("omits scope_nodes when nothing is selected", () => {
    setActiveScope({ nodeIds: [] });
    expect(scopeArgs()).toEqual({});
  });

  it("sends every node id and drops blanks", () => {
    setActiveScope({ nodeIds: ["sys", "", "auth"] });
    expect(scopeArgs()).toEqual({ scopeNodes: ["sys", "auth"] });
  });
});
