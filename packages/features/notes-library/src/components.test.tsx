import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createNotesBridge, type NotesWireBridge } from "./bridge";
import { fakeBridge } from "./fake-bridge";
import { noteFixture } from "./fixtures";
import { createNotesStore } from "./store";
import { NoteFixtureWorkspace } from "./fixture-workspace";
import { orderedSections } from "./note-detail";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); document.body.innerHTML = ""; vi.restoreAllMocks(); });
function mount(seed = [noteFixture()], debounceMs = 30) {
  const fake = fakeBridge(seed), store = createNotesStore(() => createNotesBridge(fake.bridge as unknown as NotesWireBridge), debounceMs);
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <NoteFixtureWorkspace store={store} />, host);
  cleanups.push(() => { dispose(); store.dispose(); host.remove(); });
  return { ...fake, store, host };
}
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) { element.value = value; element.dispatchEvent(new InputEvent("input", { bubbles: true })); }
function press(element: Element, key: string, options: KeyboardEventInit = {}) { element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); }
function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === label)!; }
async function row(host: HTMLElement, id = "note-1") { await vi.waitFor(() => expect(host.querySelector(`[data-row-id="${id}"]`)).not.toBeNull()); return host.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!; }
async function open(host: HTMLElement) { press(await row(host), "Enter"); await vi.waitFor(() => expect(document.querySelector("[data-note-title]")).not.toBeNull()); }

describe("note page behavior through a fake preload bridge", () => {
  it("refreshes card labels and actions after a detail title save and closure", async () => {
    const { host, store, data, bridge, emit } = mount();
    await open(host);
    const title = document.querySelector<HTMLInputElement>("[data-note-title]")!;
    input(title, "Acknowledged title");
    await store.flush("note-1");
    expect(data.get("note-1")!.title).toBe("Acknowledged title");
    expect(store.state("note-1")).toBe("live");
    // The saved entity stays visible while the change stream refreshes the collection.
    emit();
    await vi.waitFor(() => expect(bridge.notes.list).toHaveBeenCalledTimes(2));
    document.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click();
    await vi.waitFor(() => {
      const savedRow = host.querySelector('[data-row-id="note-1"]')!;
      expect(savedRow.getAttribute("aria-label")).toBe("Acknowledged title");
      expect(savedRow.textContent).toContain("Acknowledged title");
      expect(savedRow.querySelector('[aria-label="Select Acknowledged title"]')).not.toBeNull();
      expect(savedRow.querySelector('[aria-label="Actions for Acknowledged title"]')).not.toBeNull();
    });
  });

  it("renders note cards after asynchronous paginated fake-bridge loading", async () => {
    const seed = Array.from({ length: 1200 }, (_, index) => noteFixture(index));
    const { host, bridge, store } = mount(seed);
    await vi.waitFor(() => expect(store.loading()).toBe(false));
    expect(bridge.notes.list).toHaveBeenCalledTimes(3);
    const cards = host.querySelectorAll('[aria-label="Notes"] [data-row-id]');
    expect(cards).toHaveLength(seed.length);
    expect(host.querySelector('[data-row-id="note-0"]')?.getAttribute("aria-label")).toBe("Note 0");
    expect(host.querySelector('[data-row-id="note-1199"]')?.getAttribute("aria-label")).toBe("Note 1199");
  });

  it("completes and reopens a note through its card actions without opening details", async () => {
    const { host, bridge, data } = mount();
    (await row(host)).querySelector<HTMLButtonElement>('[aria-label="Actions for Note 1"]')!.click();
    const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(element => element.textContent?.trim() === label);
    const selectMenuItem = (label: string) => {
      const item = menuItem(label)!;
      // Ark highlights an item on pointer move before selecting it.
      for (const type of ["pointermove", "pointerdown", "pointerup"]) {
        item.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", button: 0 }));
      }
      item.click();
    };
    await vi.waitFor(() => expect(menuItem("Complete")).toBeDefined());
    selectMenuItem("Complete");
    await vi.waitFor(() => expect(data.get("note-1")!.status).toBe("completed"));
    expect(bridge.notes.setStatus).toHaveBeenCalledWith({ id: "note-1", status: "completed", expectedRev: "1" });
    expect(document.querySelector("[data-note-title]")).toBeNull();
    (await row(host)).querySelector<HTMLButtonElement>('[aria-label="Actions for Note 1"]')!.click();
    await vi.waitFor(() => expect(menuItem("Mark as active")).toBeDefined());
    selectMenuItem("Mark as active");
    await vi.waitFor(() => expect(data.get("note-1")!.status).toBe("active"));
    expect(document.querySelector("[data-note-title]")).toBeNull();
  });

  it("supports keyboard create, edit, pin, complete and delete confirmation with undo", async () => {
    const { host, bridge, store } = mount();
    const first = await row(host); first.focus(); press(first, "p");
    await vi.waitFor(() => expect(bridge.notes.setPinned).toHaveBeenCalled());
    press(await row(host), "e"); await vi.waitFor(() => expect(document.querySelector("[data-note-title]")).not.toBeNull());
    const title = document.querySelector<HTMLInputElement>("[data-note-title]")!; title.focus(); input(title, "Edited using keyboard"); press(title, "s", { metaKey: true });
    await vi.waitFor(() => expect(store.record("note-1")!.title).toBe("Edited using keyboard")); await store.flush("note-1");
    button("Close details")?.click();
    const selected = await row(host); press(selected, "Backspace", { metaKey: true });
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const deleteButton = button("Delete"); deleteButton.focus(); deleteButton.click();
    await vi.waitFor(() => expect(store.deleting().has("note-1")).toBe(true));
    button("Undo").click(); await vi.waitFor(() => expect(store.deleting().size).toBe(0));
    press(await row(host), " "); await vi.waitFor(() => expect(bridge.notes.setStatus).toHaveBeenCalled());
    button("Undo").click(); await vi.waitFor(() => expect(store.record("note-1")!.status).toBe("active"));
    const current = await row(host); press(current, "n", { metaKey: true });
    await vi.waitFor(() => expect(bridge.notes.create).toHaveBeenCalledOnce());
    expect(bridge.notes.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Untitled", spaceId: "" }));
    await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>("[data-note-title]")?.value).toBe("Untitled"));
    input(document.querySelector<HTMLInputElement>("[data-note-title]")!, "Keyboard creation");
    await store.flush("created-1");
    expect(store.record("created-1")!.title).toBe("Keyboard creation");
  });
  it("debounces rapid title edits without flushing on every reactive detail update", async () => {
    const { host, store, bridge } = mount([noteFixture()], 1000); await open(host);
    const title = document.querySelector<HTMLInputElement>("[data-note-title]")!;
    input(title, "A"); input(title, "AB"); input(title, "ABC");
    await new Promise(done => setTimeout(done, 20));
    expect(bridge.notes.update).not.toHaveBeenCalled();
    await store.flush("note-1"); expect(bridge.notes.update).toHaveBeenCalledTimes(1);
    expect(store.record("note-1")!.title).toBe("ABC");
  });
  it("shows Reload and Overwrite on conflict and retains the Markdown draft", async () => {
    const { host, store, data } = mount(); await open(host);
    data.set("note-1", { ...data.get("note-1")!, content: "Remote", rev: "2" });
    store.edit("note-1", { content: "Local Markdown **draft**" }); await store.flush("note-1");
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="alert"]')].some(element => element.textContent?.includes("Edit conflict"))).toBe(true));
    expect(button("Reload")).toBeDefined(); expect(button("Overwrite")).toBeDefined();
    button("Overwrite").click(); await vi.waitFor(() => expect(data.get("note-1")!.content).toBe("Local Markdown **draft**"));
    expect(store.state("note-1")).toBe("live");
  });
  it("keeps Markdown editor focus during rapid checklist editing and preserves details on reorder", async () => {
    // ProseMirror measures the caret after DOM edits; jsdom does not provide range geometry.
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, "createRange").mockImplementation(() => Object.assign(createRange(), {
      getClientRects: () => [] as unknown as DOMRectList,
      getBoundingClientRect: () => new DOMRect(),
    }));
    const note = noteFixture(); note.checklist!.push({ id: "check-2", title: "Second", detail: "Second detail" });
    const { host, store, data } = mount([note], 1000); await open(host);
    const editor = document.querySelector<HTMLElement>('[role="textbox"][aria-label="Note content"]')!;
    const tasks = editor.querySelector<HTMLUListElement>('ul[data-type="taskList"]')!;
    const first = tasks.querySelector<HTMLLIElement>("li")!;
    const title = first.querySelector("p")!;
    editor.focus();
    for (const value of ["A", "AB", "ABC"]) {
      title.textContent = value;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      await vi.waitFor(() => expect(store.record("note-1")!.checklist[0]!.title).toBe(value));
      expect(document.activeElement).toBe(editor);
      expect(document.querySelector('[role="textbox"][aria-label="Note content"]')).toBe(editor);
    }
    tasks.append(first);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromDrop" }));
    await vi.waitFor(() => expect(store.record("note-1")!.checklist[1]!.title).toBe("ABC"));
    await store.flush("note-1");
    expect(data.get("note-1")!.checklist).toEqual([
      expect.objectContaining({ id: "check-2", title: "Second", detail: "Second detail", sortOrder: 0 }),
      expect.objectContaining({ id: "check-1", title: "ABC", detail: "Keep details", sortOrder: 1 }),
    ]);
  });
  it("invalidates Inbox membership after moving a note through the detail Space picker", async () => {
    const { host, store } = mount(); await open(host);
    store.edit("note-1", { spaceId: "space-1" }); await store.flush("note-1");
    await vi.waitFor(() => expect(host.textContent).toContain("Start from a template"));
    expect(store.record("note-1")!.spaceId).toBe("space-1");
  });
  it("renders offline recovery and empty collections honestly", async () => {
    const { host, bridge, store } = mount([]);
    await vi.waitFor(() => expect(host.textContent).toContain("Start from a template"));
    vi.mocked(bridge.notes.list).mockRejectedValueOnce(new Error("Core offline")); await store.refresh();
    expect(host.textContent).toContain("Notes unavailable"); expect(host.textContent).toContain("Retry connection");
    button("Retry connection").click(); await vi.waitFor(() => expect(store.loadError()).toBe(""));
  });
  it("shows note previews, due dates and pinned state directly on cards", async () => {
    const note = { ...noteFixture(), content: "**Important** [reference](https://example.com)", pinned: true };
    const { host, store } = mount([note]);
    const card = await row(host);
    expect(card.textContent).toContain("Important reference");
    expect(card.textContent).toContain(new Date(note.dueAt!).toLocaleDateString());
    expect(card.querySelector('[aria-label="Pinned"]')).not.toBeNull();
    press(card, "p");
    await vi.waitFor(() => expect(store.record("note-1")!.pinned).toBe(false));
    expect((await row(host)).querySelector('[aria-label="Pinned"]')).toBeNull();
  });
  it("orders visible contributed detail sections without importing their owners", () => {
    const component = () => <p>Contribution</p>;
    expect(orderedSections([{ id: "attachments", order: 30, component }, { id: "place", order: 20, component, visible: id => id === "other" }, { id: "schedule", order: 10, component }], "note-1").map(section => section.id)).toEqual(["schedule", "attachments"]);
  });
});
