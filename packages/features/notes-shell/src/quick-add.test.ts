import { describe, expect, it, vi } from "vitest";
import { createShellBridge, type ShellWireBridge } from "./bridge";
import { createQuickNote, parseQuickAdd } from "./quick-add";

const now = new Date(2026, 9, 4, 10, 30); // Sunday, local wall clock.
const iso = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
describe("quick-add parser", () => {
  it.each([
    ["Buy milk tomorrow 9am #errands @Home", { title: "Buy milk", dueAt: iso(5, 9), dueAllDay: false, tags: ["errands"], space: "Home" }],
    ["Water plants today", { title: "Water plants", dueAt: iso(4), dueAllDay: true }],
    ["Call tomorrow", { title: "Call", dueAt: iso(5), dueAllDay: true }],
    ["Call Monday 2:30pm", { title: "Call", dueAt: iso(5, 14, 30), dueAllDay: false }],
    ["Call sunday", { title: "Call", dueAt: iso(11), dueAllDay: true }],
    ["Call Tuesday", { dueAt: iso(6) }], ["Call Wednesday", { dueAt: iso(7) }],
    ["Call Thursday", { dueAt: iso(8) }], ["Call Friday", { dueAt: iso(9) }], ["Call Saturday", { dueAt: iso(10) }],
    ["Call in 2 hours", { title: "Call", dueAt: iso(4, 12, 30), dueAllDay: false }],
    ["Call in 15 minutes", { dueAt: iso(4, 10, 45) }],
    ["Call 9am", { dueAt: iso(5, 9) }], ["Call tomorrow 12am", { dueAt: iso(5) }],
    ["Call tomorrow 12pm", { dueAt: iso(5, 12) }], ["Call 23:59", { dueAt: iso(4, 23, 59) }],
    ['Write note #work #work @"Home Office" !!!', { title: "Write note", tags: ["work"], space: "Home Office", priority: 3 }],
    ["Call !", { priority: 1 }], ["Call !!", { priority: 2 }],
    ["Send report!", { title: "Send report!" }],
    ["Call next month", { title: "Call next month", dueAt: undefined }],
  ])("parses %s", (input, expected) => expect(parseQuickAdd(input as string, now)).toMatchObject(expected));
  it.each(["", "tomorrow #tag", "Call 25:30", "Call 13pm", "Call 12:65pm", "Call today tomorrow", "Call in 0 hours", "Call in 2 hours 9am", "Call @Home @Work", "Call ! !!", "Call 9am 10am"])("rejects %s", input => expect(() => parseQuickAdd(input, now)).toThrow());
});
describe("quick-add core payload", () => {
  function bridge(spaces: { id: string; name: string }[] = [{ id: "home", name: "Home" }]) {
    const create = vi.fn(async (_input?: unknown) => ({ note: { id: "note", title: "Buy milk", rev: "1" } }));
    const createTag = vi.fn(async () => ({ tag: { id: "new-tag", name: "new" } }));
    const wire = { notes: { create }, tags: { list: async () => ({ tags: [{ id: "errands", name: "errands" }] }), create: createTag }, spaces: { list: async () => ({ spaces }) } } as unknown as ShellWireBridge;
    return { api: createShellBridge(wire), create, createTag };
  }
  it("resolves names and writes one contract-valid Create payload", async () => {
    const { api, create, createTag } = bridge();
    await createQuickNote(api, parseQuickAdd("Buy milk tomorrow 9am #errands @Home !!", now));
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ title: "Buy milk", dueAt: iso(5, 9).replace(".000Z", "Z"), spaceId: "home", tagIds: ["errands"], priority: 2 });
    expect(createTag).not.toHaveBeenCalled();
  });
  it("creates missing tags before creating the note", async () => {
    const { api, create, createTag } = bridge();
    await createQuickNote(api, parseQuickAdd("Buy milk #new", now));
    expect(createTag).toHaveBeenCalledWith({ name: "new" });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ tagIds: ["new-tag"] });
  });
  it.each([{ spaces: [] }, { spaces: [{ id: "a", name: "Home" }, { id: "b", name: "home" }] }])("does not create when Space is missing or ambiguous", async ({ spaces }) => {
    const { api, create } = bridge(spaces);
    await expect(createQuickNote(api, parseQuickAdd("Buy milk @Home", now))).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
