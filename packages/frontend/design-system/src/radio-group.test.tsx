// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { RadioGroup } from "./radio-group";

describe("RadioGroup", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("picks one option at a time", async () => {
    const [value, setValue] = createSignal("");
    const host = document.body.appendChild(document.createElement("div"));
    dispose = render(() => (
      <RadioGroup aria-label="Answer" value={value()} onValueChange={setValue} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
    ), host);
    await Promise.resolve();
    const rows = () => [...host.querySelectorAll<HTMLElement>(".pw-radio-row")];
    expect(rows().map((row) => row.textContent)).toEqual(["Yes", "No"]);
    expect(rows().every((row) => row.getAttribute("data-state") === "unchecked")).toBe(true);
    rows()[1]!.click();
    await Promise.resolve();
    expect(value()).toBe("no");
    expect(rows()[1]!.getAttribute("data-state")).toBe("checked");
    rows()[0]!.click();
    await Promise.resolve();
    expect(value()).toBe("yes");
    expect(rows()[1]!.getAttribute("data-state")).toBe("unchecked");
  });
});
