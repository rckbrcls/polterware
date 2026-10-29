import { describe, expect, it } from "vitest";
import { loadStructure } from "./load";

describe("Structure registry reads", () => {
  it("propagates a failed read instead of presenting an empty registry", async () => {
    const api = { work: { listStructure: async () => { throw new Error("Core unavailable"); } } };
    await expect(loadStructure("project", "", api as unknown as Parameters<typeof loadStructure>[2])).rejects.toThrow("Core unavailable");
  });
});
