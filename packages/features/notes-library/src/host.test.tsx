import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shellFeature, { NotesShell, createShellBridge, type ShellWireBridge, type NotesFeature } from "@polterware/feature-notes-shell";
import { createNotesBridge, type NotesWireBridge } from "./bridge";
import { fakeBridge } from "./fake-bridge";
import { noteFixture } from "./fixtures";
import { NoteCollection } from "./note-list";
import { NoteDetailHost } from "./host";
import { createNotesStore } from "./store";

let dispose: (() => void) | undefined;
const stores: ReturnType<typeof createNotesStore>[] = [];
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("pwnotes.shell.onboarding", "complete");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.isConnected && !this.closest("[hidden]") ? [new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList : [] as unknown as DOMRectList;
  });
});
afterEach(() => {
  dispose?.(); dispose = undefined; stores.splice(0).forEach(store => store.dispose());
  document.body.replaceChildren(); vi.restoreAllMocks();
});

describe("note host inside NotesShell", () => {
  it("opens the registered editor through openNote and collection shortcuts", async () => {
    const fake = fakeBridge([noteFixture()]);
    const wire = {
      ...fake.bridge,
      reminders: { status: async () => ({ permission: "authorized", armed: 1, planned: 0, notifierLastSeenAt: new Date().toISOString() }) },
      search: { search: async () => ({ hits: [] }) },
      app: { openDeepLink: fake.bridge.app.openDeepLink, onDeepLink: () => () => {}, getDeepLink: async () => null },
    };
    const store = createNotesStore(() => createNotesBridge(wire as unknown as NotesWireBridge));
    stores.push(store);
    const extra: NotesFeature = {
      id: "notes",
      routes: [
        { path: "/today", title: "Today", component: () => <NoteCollection mode="inbox" store={store} /> },
        { path: "/note/:id", title: "Note", component: () => <NoteDetailHost store={store} /> },
      ],
    };
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => <NotesShell features={[shellFeature, extra]} bridge={createShellBridge(wire as unknown as ShellWireBridge)} />, host);
    const row = await vi.waitFor(() => {
      const found = host.querySelector<HTMLElement>('[data-row-id="note-1"]');
      expect(found).not.toBeNull();
      return found!;
    });
    row.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fake.bridge.notes.setPinned).toHaveBeenCalledWith({ id: "note-1", pinned: true, expectedRev: "1" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("[data-note-title]")).not.toBeNull());
    expect((document.querySelector("[data-note-title]") as HTMLInputElement).value).toBe("Note 1");
    expect(host.querySelector('[data-row-id="note-1"]')).toBeNull();
  });
});
