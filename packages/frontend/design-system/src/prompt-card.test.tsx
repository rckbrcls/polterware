// @vitest-environment jsdom

import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";

import { PromptCardGrid } from "./prompt-card";

describe("PromptCardGrid", () => {
  it("copies the prompt of the clicked card", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <PromptCardGrid
          items={[
            { id: "a", title: "A", description: "First", icon: <span>A</span>, prompt: "Prompt A" },
            { id: "b", title: "B", description: "Second", icon: <span>B</span>, prompt: "Prompt B" },
          ]}
        />
      ),
      host,
    );

    expect(host.querySelector(".pw-template-card-grid__label")?.textContent).toBe("Copy a prompt for your agent");
    const buttons = host.querySelectorAll("button.pw-template-card");
    expect(buttons).toHaveLength(2);
    buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(writeText).toHaveBeenCalledWith("Prompt B");

    dispose();
    host.remove();
  });
});
