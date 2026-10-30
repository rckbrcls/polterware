// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDoc } from "@polterware/feature-shell";
import { RecordEditor, type RecordEditTarget } from "./record-editor";

let dispose: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

const DOC = { id: "doc-1", title: "Runbook", summary: "", bodyMarkdown: "Restart the core.", tags: [], scopeNodeIds: [], owner: "", updatedAt: "", entityLinks: [] } satisfies WorkspaceDoc;
const RULE = { id: "rule-1", slug: "core-sqlite", statement: "Only the core opens SQLite.", scopeNodeIds: [] };

function mount(target: RecordEditTarget) {
  const handlers = {
    onExpand: vi.fn(),
    onSaveDoc: vi.fn(async () => true),
    onSaveRule: vi.fn(async () => true),
  };
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => (
    <RecordEditor
      target={target}
      crumb="Project"
      cards={[]}
      decisions={[]}
      rules={[RULE]}
      docs={[DOC]}
      milestones={[]}
      components={[]}
      nodes={[]}
      onClose={() => {}}
      onSaveCard={async () => true}
      onSaveDecision={async () => true}
      {...handlers}
    />
  ), host);
  return handlers;
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent === label);

describe("RecordEditor", () => {
  it("edits a doc in its composer, with Expand to its page", async () => {
    const handlers = mount({ kind: "doc", id: "doc-1" });
    await tick();
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Title"]')!.value).toBe("Runbook");
    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]')!.value).toBe("Restart the core.");
    button("Expand")!.click();
    expect(handlers.onExpand).toHaveBeenCalledWith({ kind: "doc", id: "doc-1" });
    button("Save doc")!.click();
    await tick();
    expect(handlers.onSaveDoc).toHaveBeenCalledWith("doc-1", { title: "Runbook", body: "Restart the core.", scopeNodeIds: [], why: "" });
  });

  it("edits a rule with no Expand, because a Rule has no page", async () => {
    const handlers = mount({ kind: "rule", id: "rule-1" });
    await tick();
    expect(button("Expand")).toBeUndefined();
    button("Save rule")!.click();
    await tick();
    expect(handlers.onSaveRule).toHaveBeenCalledWith({ ref: "core-sqlite", statement: "Only the core opens SQLite.", scopeNodeIds: [], why: "" });
  });
});
