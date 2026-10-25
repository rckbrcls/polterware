import { describe, expect, it } from "vitest";
import { loadAtlas } from "./load";

describe("Structure registry reads", () => {
  it("propagates a failed read instead of presenting an empty registry", async () => {
    const api = { work: { listAtlas: async () => { throw new Error("Core unavailable"); } } };
    await expect(loadAtlas("project", "", api as unknown as Parameters<typeof loadAtlas>[2])).rejects.toThrow("Core unavailable");
  });
});
