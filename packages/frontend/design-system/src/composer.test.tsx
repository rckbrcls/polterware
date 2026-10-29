// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Composer, type ComposerDraft } from "./composer";

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
}

function field(label: string) {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
}

function type(label: string, value: string) {
  const element = field(label)!;
  element.value = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function pressModEnter(label: string) {
  field(label)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
}

describe("Composer", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  function mount(onSubmit: (draft: ComposerDraft) => Promise<boolean | void> | boolean | void) {
    const [open, setOpen] = createSignal(true);
    const [stage, setStage] = createSignal("shape");
    dispose = render(
      () => (
        <Composer
          open={open()}
          onClose={() => setOpen(false)}
          crumbs={["Polterware", "New card"]}
          titlePlaceholder="Card title"
          descriptionPlaceholder="Add a description"
          whyPlaceholder="Optional"
          properties={[{ id: "stage", label: "Stage", options: [{ value: "shape", label: "Shape" }, { value: "build", label: "Build" }], value: stage(), onChange: setStage }]}
          submitLabel="Create card"
          onSubmit={onSubmit}
        />
      ),
      document.body.appendChild(document.createElement("div")),
    );
    return { open, stage };
  }

  it("needs a title, then creates with Cmd+Enter and closes", async () => {
    const onSubmit = vi.fn();
    const state = mount(onSubmit);
    await expect.poll(() => field("Title")).toBeTruthy();
    expect(document.body.textContent).toContain("New card");
    expect(button("Create card")?.disabled).toBe(true);
    type("Title", "  Import git history  ");
    type("Description", "Branch and commits as evidence");
    type("Why", "Agents need it");
    expect(button("Create card")?.disabled).toBe(false);
    pressModEnter("Description");
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
    expect(onSubmit).toHaveBeenCalledWith({ title: "Import git history", description: "Branch and commits as evidence", why: "Agents need it" });
    await expect.poll(() => state.open()).toBe(false);
  });

  it("keeps the draft when the write fails", async () => {
    const state = mount(async () => false);
    await expect.poll(() => field("Title")).toBeTruthy();
    type("Title", "Retry me");
    button("Create card")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.open()).toBe(true);
    expect((field("Title") as HTMLInputElement).value).toBe("Retry me");
  });

  it("stays open and clears the text with Create more, keeping the properties", async () => {
    const onSubmit = vi.fn(async () => true);
    const state = mount(onSubmit);
    await expect.poll(() => field("Title")).toBeTruthy();
    [...document.querySelectorAll<HTMLElement>(".pw-composer__create-more span")].find((item) => item.textContent === "Create more")!.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Stage: Shape"]')!.click();
    await expect.poll(() => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].length).toBeGreaterThan(0);
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((item) => item.textContent?.includes("Build"))!.click();
    expect(state.stage()).toBe("build");
    type("Title", "First");
    pressModEnter("Title");
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
    await expect.poll(() => (field("Title") as HTMLInputElement).value).toBe("");
    expect(state.open()).toBe(true);
    expect(document.querySelector('[aria-label="Stage: Build"]')).not.toBeNull();
  });

  it("keeps a host-controlled field's element while its value changes", async () => {
    const [path, setPath] = createSignal("");
    dispose = render(
      () => (
        <Composer
          open
          onClose={() => undefined}
          crumbs={["Polterware", "New doc"]}
          titlePlaceholder="Doc title"
          fields={[{ id: "path", label: "Path", value: path(), onChange: setPath }]}
          submitLabel="Create doc"
          onSubmit={() => true}
        />
      ),
      document.body.appendChild(document.createElement("div")),
    );
    await expect.poll(() => field("Path")).toBeTruthy();
    const before = field("Path");
    type("Path", "docs/deploy.md");
    expect(path()).toBe("docs/deploy.md");
    expect(field("Path")).toBe(before);
  });
});
