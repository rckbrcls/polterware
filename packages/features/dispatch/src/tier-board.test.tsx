import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TierBoard } from "./tier-board";
import type { DispatchTierView } from "./dispatch-types";

let dispose: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("TierBoard", () => {
  it("adds a model from the palette anchored to a tier's Add model cell", async () => {
    const tiers = [{ name: "easy", agent: "codex", model: "gpt-mini", provider: "openai", speed: 5, strength: 2 }] as unknown as DispatchTierView[];
    const onChange = vi.fn();
    const load = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <TierBoard tiers={tiers} editable avatar={() => <span />} onChange={onChange}
      palette={{ models: [{ agent: "grok", model: "grok-4", provider: "xai", tier: "hard" }] as never, loading: false, problems: [], load }} />, host);
    // One Add model per tier, in the cell after its last card; there is no Drop a model text.
    expect(host.textContent).not.toContain("Drop a model");
    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Add model to Easy"]')!;
    expect(add.closest("[data-tier-slot]")?.getAttribute("data-tier-slot")).toBe("easy:1");
    add.click();
    await tick();
    expect(load).toHaveBeenCalled();
    const row = [...document.querySelectorAll<HTMLButtonElement>(".pw-tier-palette__item")].find((item) => item.textContent?.includes("grok-4"))!;
    row.click();
    const next = onChange.mock.calls.at(-1)![0] as DispatchTierView[];
    // The model lands in the cell that opened the palette, not in the tier the agent suggests.
    expect(next.filter((tier) => tier.name === "easy").map((tier) => tier.model)).toEqual(["gpt-mini", "grok-4"]);
  });
});
