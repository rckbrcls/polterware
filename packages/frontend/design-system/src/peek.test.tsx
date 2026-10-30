// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Peek, PeekChip } from "./peek";

describe("Peek", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("shows the title and chips, expands to the page, and closes", async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => (
      <Peek open title="Single local core" kind="Decision" onOpen={onOpen} onClose={onClose} properties={<PeekChip>Core</PeekChip>}>
        <p>One process opens the database.</p>
      </Peek>
    ), host);
    await Promise.resolve();
    expect(document.querySelector(".pw-peek__title")?.textContent).toBe("Single local core");
    expect(document.querySelector(".pw-peek__kind")?.textContent).toBe("Decision");
    expect(document.querySelector('[aria-label="Properties"]')?.textContent).toContain("Core");
    document.querySelector<HTMLButtonElement>('button[aria-label="Expand"]')!.click();
    expect(onOpen).toHaveBeenCalledOnce();
    document.querySelector<HTMLButtonElement>('.pw-peek button[aria-label="Close"]')!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it("has no Expand without a page to open", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <Peek open title="Rule" onClose={() => {}} />, host);
    await Promise.resolve();
    expect(document.querySelector('button[aria-label="Expand"]')).toBeNull();
  });
});
