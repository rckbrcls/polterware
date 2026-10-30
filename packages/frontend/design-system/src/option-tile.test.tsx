// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { Folder } from "./hugeicons";
import { PropertyPicker } from "./property-picker";

describe("OptionTile", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("leads every picker option with a tile, the initial standing in for a missing icon", async () => {
    const anchor = document.body.appendChild(document.createElement("button"));
    dispose = render(() => (
      <PropertyPicker label="Milestone" open onClose={() => {}} onChange={() => {}} anchorRef={() => anchor}
        options={[{ value: "", label: "backlog" }, { value: "beta", label: "Beta", icon: <Folder size={12} /> }]} />
    ), document.body.appendChild(document.createElement("div")));
    await Promise.resolve();
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.querySelector(".pw-option-tile") !== null)).toEqual([true, true]);
    expect(options[0]!.querySelector(".pw-option-tile__initial")?.getAttribute("data-initial")).toBe("B");
    expect(options[1]!.querySelector(".pw-option-tile svg")).not.toBeNull();
    // The initial is drawn by CSS, so it stays out of the option's text.
    expect(options[0]!.textContent).toContain("backlog");
    expect(options[0]!.textContent).not.toContain("B");
  });
});
