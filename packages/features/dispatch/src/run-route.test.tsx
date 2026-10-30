import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createRunRoute } from "./run-route";

const CARDS = [
  { slug: "board-view", title: "Board view", milestone: "Beta", stage: "In progress" },
  { slug: "split-api", title: "Split the API", milestone: "Backlog", stage: "Planned" },
];

function route() {
  return createRoot(() => createRunRoute({
    tiers: () => [],
    agents: () => [],
    models: () => [{ agent: "codex", model: "gpt-5-codex-mini", provider: "openai", tier: "easy" }] as never,
    cards: () => CARDS,
  }));
}
const pill = (r: ReturnType<typeof route>, id: string) => r.properties().find((property) => property.id === id)!;

describe("createRunRoute", () => {
  it("starts on the Normal tier with no card", () => {
    expect(route().selection()).toEqual({ tier: "normal", agent: "", model: "", cardSlug: "" });
  });

  it("routes by one model or back to a tier", () => {
    const r = route();
    pill(r, "route").onChange("codex\u0000gpt-5-codex-mini");
    expect(r.selection()).toMatchObject({ tier: "normal", agent: "codex", model: "gpt-5-codex-mini" });
    pill(r, "route").onChange("tier:hard");
    expect(r.selection()).toMatchObject({ tier: "hard", agent: "", model: "" });
  });

  it("shows Card under a milestone and keeps them consistent", () => {
    const r = route();
    expect(pill(r, "card").hidden).toBe(true);
    r.setCard("board-view");
    expect(pill(r, "milestone").value).toBe("Beta");
    expect(pill(r, "card").hidden).toBe(false);
    expect(pill(r, "card").options.map((option) => option.value)).toEqual(["", "board-view"]);
    pill(r, "milestone").onChange("Backlog");
    expect(r.selection().cardSlug).toBe("");
    r.clearCard();
    expect(pill(r, "milestone").value).toBe("");
  });
});
