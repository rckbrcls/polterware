import { describe, expect, it } from "vitest";
import { KNOWLEDGE_AGENT_PROMPTS, knowledgePromptsForKind } from "./agent-prompts";

describe("knowledge agent prompts", () => {
  it("exports unique ids", () => {
    const ids = KNOWLEDGE_AGENT_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers three prompts per kind", () => {
    expect(knowledgePromptsForKind("card")).toHaveLength(3);
    expect(knowledgePromptsForKind("decision")).toHaveLength(3);
    expect(knowledgePromptsForKind("evidence")).toHaveLength(3);
  });

  it("starts every prompt from the project's own state", () => {
    for (const prompt of KNOWLEDGE_AGENT_PROMPTS) {
      expect(prompt.prompt).toContain("polterware status");
    }
  });
});
