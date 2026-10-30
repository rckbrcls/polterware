// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { PropertyPicker } from "./property-picker";

describe("PropertyPicker groups", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("lists options under their group, shows hints, and searches by group and hint", async () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const onChange = vi.fn();
    dispose = render(
      () => (
        <PropertyPicker
          label="Agent"
          open
          onClose={() => {}}
          anchorRef={() => anchor}
          onChange={onChange}
          options={[
            { value: "a:1", label: "gpt-5", group: "codex", hint: "openai" },
            { value: "b:1", label: "grok-4", group: "grok", hint: "xai" },
            { value: "a:2", label: "gpt-5-mini", group: "codex" },
          ]}
        />
      ),
      document.body,
    );
    const groups = () => [...document.querySelectorAll(".pw-property-picker__group")].map((item) => item.textContent);
    const options = () => [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent ?? "");
    expect(groups()).toEqual(["codex", "grok"]);
    expect(options()[1]).toContain("gpt-5-mini");
    expect(document.querySelector(".pw-property-picker__hint")?.textContent).toBe("openai");

    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    input.value = "xai";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(options()).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("b:1");
  });
});
