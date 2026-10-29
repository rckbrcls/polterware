import { describe, expect, it } from "vitest";
import type { DispatchTierView } from "./dispatch-types";
import { placeTierCard, removeTierCard, tierColumns } from "./tier-board-model";

const row = (name: string, position: number, agent: string, model: string): DispatchTierView => ({ name, position, agent, model, provider: "", speed: 0, strength: 0 });
const table = [row("easy", 0, "codex", "a"), row("easy", 1, "grok", "b"), row("hard", 0, "cursor", "c")];
const order = (tiers: DispatchTierView[], name: string) => tierColumns(tiers)[name]!.map((tier) => `${tier.agent}:${tier.position}`);

describe("tier board model", () => {
  it("moves a card within a tier and renumbers positions", () => {
    const next = placeTierCard(table, table[1]!, { tier: "easy", index: 0 }, { tier: "easy", index: 1 });
    expect(order(next, "easy")).toEqual(["grok:0", "codex:1"]);
  });
  it("moves a card across tiers, shifting the cards below the slot", () => {
    const next = placeTierCard(table, table[0]!, { tier: "hard", index: 0 }, { tier: "easy", index: 0 });
    expect(order(next, "easy")).toEqual(["grok:0"]);
    expect(order(next, "hard")).toEqual(["codex:0", "cursor:1"]);
  });
  it("appends a new card past the end and refuses a duplicate in the same tier", () => {
    const added = placeTierCard(table, { agent: "codex", model: "z", provider: "openai", speed: 0, strength: 0 }, { tier: "normal", index: 99 });
    expect(order(added, "normal")).toEqual(["codex:0"]);
    expect(placeTierCard(table, table[0]!, { tier: "easy", index: 2 })).toHaveLength(table.length);
  });
  it("removes a card", () => {
    expect(order(removeTierCard(table, { tier: "easy", index: 0 }), "easy")).toEqual(["grok:0"]);
  });
});
