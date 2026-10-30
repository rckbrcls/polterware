// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilestoneList } from "./milestone-list";

let dispose: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

describe("MilestoneList", () => {
  it("creates a milestone in the composer with its goal, state, and target date", async () => {
    const onAction = vi.fn(async () => "m-1");
    const onOpen = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <MilestoneList milestones={[]} cards={[]} onOpen={onOpen} onArchive={() => {}} onAction={onAction} />, host);
    host.querySelector<HTMLButtonElement>('button[aria-label="New milestone"]')!.click();
    await tick();
    const type = (selector: string, value: string) => {
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    // The shared composer: the name is its large title, then the goal and a target date.
    expect(document.querySelector(".pw-composer__title")).not.toBeNull();
    type('input[aria-label="Title"]', "Beta");
    type('textarea[aria-label="Description"]', "Ship the beta");
    type('input[aria-label="Target date"]', "2026-12-01");
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Create milestone")!.click();
    await tick();
    expect(onAction).toHaveBeenCalledWith({ kind: "create", name: "Beta", goal: "Ship the beta", state: "planned", targetDate: "2026-12-01" });
    expect(onOpen).toHaveBeenCalledWith("m-1");
  });
});
