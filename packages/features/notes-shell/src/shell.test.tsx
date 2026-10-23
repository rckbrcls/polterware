import { onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shellFeature, { createShellBridge, NoteDetailHost, NotesShell, useNotesShell, type ShellWireBridge, type NotesFeature } from "./index";
import { Button, DetailPanel } from "@polterware/frontend-design-system";

let dispose: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("pwnotes.shell.onboarding", "complete");
  // jsdom has no layout; Ark must see connected controls as visible to model browser focus.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.isConnected && !this.closest("[hidden]")) ? [new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList : [] as unknown as DOMRectList;
  });
});
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); });
function NoteEditorFixture() {
  const shell = useNotesShell();
  return <NoteDetailHost><DetailPanel.Body><DetailPanel.Main>Note editor {shell.selectedNoteId()}</DetailPanel.Main></DetailPanel.Body></NoteDetailHost>;
}
const noteEditorFeature: NotesFeature = {
  id: "note-editor-fixture",
  routes: [{ path: "/note/:id", title: "Note", component: NoteEditorFixture }],
};
function mount(extra: NotesFeature[] = [], options: { offline?: boolean; permission?: string; armed?: number; authorize?: false | (() => Promise<boolean>); holdStatus?: boolean } = {}) {
  let permission = options.permission ?? "authorized";
  let releaseStatus: ((value: unknown) => void) | undefined;
  const status = vi.fn(async () => {
    if (options.holdStatus) await new Promise(resolve => { releaseStatus = resolve; });
    if (options.offline) throw new Error("Core disconnected");
    return { permission, armed: options.armed ?? 0, planned: 0, notifierLastSeenAt: new Date().toISOString() };
  });
  const create = vi.fn(async (_input?: unknown) => ({ note: { id: "new-note", title: "Buy milk", rev: "1" } }));
  const listSpaces = vi.fn(async () => ({ spaces: [] }));
  const listNotes = vi.fn(async () => ({ total: 0 }));
  const requestNotificationAuthorization = vi.fn(options.authorize === false ? undefined : (options.authorize ?? (async () => { permission = "authorized"; return true; })));
  let onLink!: (link: { url: string; route: string }) => void;
  const unsubscribe = vi.fn();
  const wire = {
    reminders: { status }, spaces: { list: listSpaces },
    notes: { list: listNotes, create, get: async () => ({ note: { id: "new-note", title: "Buy milk", content: "Local note", rev: "1" } }) },
    tags: { list: async () => ({ tags: [] }) }, search: { search: vi.fn(async () => ({ hits: [{ noteId: "new-note", title: "Buy milk", snippet: "Local <b>note</b>" }] })) },
    onChange: () => unsubscribe,
    app: {
      onDeepLink: (callback: typeof onLink) => { onLink = callback; return unsubscribe; },
      getDeepLink: async () => null,
      ...(options.authorize === false ? {} : { requestNotificationAuthorization }),
    },
  } as unknown as ShellWireBridge;
  const host = document.createElement("div"); document.body.append(host);
  dispose = render(() => <NotesShell features={[shellFeature, ...extra, noteEditorFeature]} bridge={createShellBridge(wire)} />, host);
  return { host, status, create, listSpaces, listNotes, releaseStatus: () => releaseStatus?.({ permission, armed: options.armed ?? 0, planned: 0, notifierLastSeenAt: new Date().toISOString() }), onLink: (url: string) => onLink({ url, route: "" }), unsubscribe, requestNotificationAuthorization, search: wire.search.search };
}
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
  if (!found) throw new Error(`Button ${label} missing: ${document.body.textContent}`);
  return found;
}
function key(key: string, metaKey = true) { document.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey, bubbles: true, cancelable: true })); }
function fill(value: string) {
  const input = document.querySelector<HTMLInputElement>("#notes-command-input")!;
  input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); return input;
}
describe("Polterware Notes shell behavior", () => {
  it("renders every primary registry stub, landmarks and active navigation", async () => {
    const { host } = mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    expect(host.querySelector("header")).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Main navigation"]')).not.toBeNull();
    expect(host.querySelector("main")).not.toBeNull();
    for (const title of ["Inbox", "Calendar", "Spaces", "Map", "Focus"]) {
      button(title).click();
      await vi.waitFor(() => expect(host.textContent).toContain(`${title} is unavailable`));
      expect(host.querySelector('[aria-current="page"]')?.textContent).toContain(title);
      await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("MAIN"));
    }
  });
  it("renders registered routes and runs registered Commander actions", async () => {
    const run = vi.fn();
    const { host } = mount([{ id: "calendar", routes: [{ path: "/calendar", title: "Calendar", component: () => <p>Live calendar</p> }], commands: [{ id: "custom", label: "Custom action", keywords: ["favorite"], run }] }]);
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    key("3"); await vi.waitFor(() => expect(host.textContent).toContain("Live calendar"));
    key("k"); await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("notes-command-input"));
    fill("favorite"); button("Custom action").click();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });
  it("recovers from offline via reconnect UI", async () => {
    const options = { offline: true }; const { host, status } = mount([], options);
    await vi.waitFor(() => expect(host.textContent).toContain("Polterware Notes cannot reach the local core"));
    options.offline = false; button("Retry connection").click();
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    expect(status).toHaveBeenCalledTimes(2);
  });
  it("navigates history and opens Settings by keyboard", async () => {
    const { host } = mount(); await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    key("1"); await vi.waitFor(() => expect(host.textContent).toContain("Inbox is unavailable"));
    key("["); await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    key("]"); await vi.waitFor(() => expect(host.textContent).toContain("Inbox is unavailable"));
    key(","); await vi.waitFor(() => expect(document.body.textContent).toContain("Settings unavailable"));
  });
  it("creates through Commander and navigates to the note editor", async () => {
    const { host, create } = mount(); await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    key("k"); await vi.waitFor(() => expect(document.querySelector("#notes-command-input")).not.toBeNull());
    fill("new note");
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent?.trim() === "New note")!.click();
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[0]).toMatchObject({ title: "Untitled" });
    await vi.waitFor(() => expect(host.textContent).toContain("Note editor new-note"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    key("j"); await vi.waitFor(() => expect(host.textContent).toContain("Note editor new-note"));
  });
  it("routes Start focus and note-bound focus links to the Focus page", async () => {
    const onDeepLink = vi.fn((url: URL) => url.searchParams.get("action") === "focus");
    const { host, onLink } = mount([
      { id: "focus", routes: [{ path: "/focus", title: "Focus", component: () => <p>Live focus</p> }], onDeepLink },
    ]);
    await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    onLink("pwnotes://focus");
    await vi.waitFor(() => expect(host.textContent).toContain("Live focus"));
    onLink("pwnotes://note/01K6N3QWJ8P9A7B6C5D4E3F2G1?action=focus");
    expect(onDeepLink).toHaveBeenCalled();
    await vi.waitFor(() => expect(host.textContent).toContain("Note editor 01K6N3QWJ8P9A7B6C5D4E3F2G1"));
  });
  it("opens note search results and handles a warm deep link", async () => {
    const { host, onLink } = mount(); await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    onLink("pwnotes://calendar?date=2026-10-04"); await vi.waitFor(() => expect(host.textContent).toContain("Calendar is unavailable"));
    key("k"); await vi.waitFor(() => expect(document.querySelector("#notes-command-input")).not.toBeNull());
    fill("milk"); await vi.waitFor(() => expect(document.body.textContent).toContain("Buy milk"));
    expect(document.body.textContent).not.toContain("<b>");
    button("Buy milkLocal note").click(); await vi.waitFor(() => expect(host.textContent).toContain("Note editor new-note"));
  });
  it("exposes detail sections and parameterized routes without feature imports", async () => {
    const Detail = () => { const shell = useNotesShell(); return <NoteDetailHost><DetailPanel.Body><DetailPanel.Main>Editor {shell.selectedNoteId()}</DetailPanel.Main></DetailPanel.Body></NoteDetailHost>; };
    const Page = () => { const shell = useNotesShell(); return <Button onClick={() => shell.openNote("selected")}>Open selected</Button>; };
    const { host } = mount([{ id: "notes", routes: [{ path: "/today", title: "Today", component: Page }, { path: "/note/:id", title: "Note", component: Detail }] }]);
    await vi.waitFor(() => expect(host.textContent).toContain("Open selected"));
    button("Open selected").click(); await vi.waitFor(() => expect(host.textContent).toContain("Editor selected"));
    key("j"); await vi.waitFor(() => expect(host.textContent).toContain("Editor selected"));
  });
  it("cleans up bridge subscriptions when unmounted", async () => {
    const { host, unsubscribe } = mount(); await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
    dispose?.(); dispose = undefined; expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});

it("delegates collection keyboard actions and unregisters them on navigation", async () => {
  const action = vi.fn();
  const Page = () => {
    const shell = useNotesShell();
    onMount(() => { const unregister = shell.registerCollectionShortcuts(action); onCleanup(unregister); });
    return <p>Keyboard collection</p>;
  };
  const { host } = mount([{ id: "notes", routes: [{ path: "/today", title: "Today", component: Page }] }]);
  await vi.waitFor(() => expect(host.textContent).toContain("Keyboard collection"));
  for (const shortcut of ["Enter", " ", "e", "p"]) key(shortcut, false);
  key("Backspace");
  expect(action.mock.calls.map(call => call[0])).toEqual(["open", "toggle-done", "edit-title", "pin", "delete"]);
  key("1"); await vi.waitFor(() => expect(host.textContent).toContain("Inbox is unavailable"));
  key("Enter", false); expect(action).toHaveBeenCalledTimes(5);
});
it("leaves native controls, editable ancestors and overlays out of collection shortcuts", async () => {
  const action = vi.fn();
  const Page = () => {
    const shell = useNotesShell();
    onMount(() => { onCleanup(shell.registerCollectionShortcuts(action)); });
    return <div data-keyboard-fixture><button><span>Native button</span></button><a href="#">Link</a><input /><div contenteditable="true"><span>Editable</span></div><div role="dialog"><span>Dialog</span></div><div role="menu"><span>Menu</span></div><div role="listbox"><span>Option</span></div><div role="row" tabindex="0">Row</div><p>Other content</p></div>;
  };
  const { host } = mount([{ id: "notes", routes: [{ path: "/today", title: "Today", component: Page }] }]);
  await vi.waitFor(() => expect(host.querySelector("[data-keyboard-fixture]")).not.toBeNull());
  host.querySelector("[contenteditable]")!.setAttribute("contenteditable", "");
  for (const target of host.querySelectorAll('[data-keyboard-fixture] button span, a, input, [contenteditable] span, [role="dialog"] span, [role="menu"] span, [role="listbox"] span, [data-keyboard-fixture] p')) {
    for (const value of ["Enter", " ", "e", "p"]) {
      const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  }
  expect(action).not.toHaveBeenCalled();
  const row = host.querySelector('[role="row"]')!;
  const handled = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  row.dispatchEvent(handled);
  expect(handled.defaultPrevented).toBe(true);
  expect(action).toHaveBeenCalledWith("open");
  const prevented = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  prevented.preventDefault(); row.dispatchEvent(prevented);
  expect(action).toHaveBeenCalledOnce();
});
it("contains a feature render failure and permits navigation away", async () => {
  const { host } = mount([{ id: "calendar", routes: [{ path: "/calendar", title: "Calendar", component: () => { throw new Error("Calendar render failed"); } }] }]);
  await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
  key("3"); await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("Calendar render failed"));
  key("1"); await vi.waitFor(() => expect(host.textContent).toContain("Inbox is unavailable"));
});
it("keeps failed registered actions in Commander with honest error text", async () => {
  const { host } = mount([{ id: "actions", routes: [], commands: [{ id: "fail", label: "Fail action", run: async () => { throw new Error("Action failed"); } }] }]);
  await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
  key("k"); await vi.waitFor(() => expect(document.querySelector("#notes-command-input")).not.toBeNull());
  fill("fail action"); button("Fail action").click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("Action failed"));
});
it("shows skippable onboarding without requesting notification authorization on mount", async () => {
  localStorage.removeItem("pwnotes.shell.onboarding");
  const { requestNotificationAuthorization } = mount([], { permission: "not-determined" });
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Welcome to Polterware Notes"));
  expect(requestNotificationAuthorization).not.toHaveBeenCalled();
  button("Continue").click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Reminders: permission required"));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Enable notifications");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not arm a reminder");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toMatch(/Reminders: \d+ armed/);
  button("Skip onboarding").click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(localStorage.getItem("pwnotes.shell.onboarding")).toBe("complete");
  expect(requestNotificationAuthorization).not.toHaveBeenCalled();
});
it("enables notifications from onboarding and reports real reminder status", async () => {
  localStorage.removeItem("pwnotes.shell.onboarding");
  const { requestNotificationAuthorization } = mount([], { permission: "not-determined" });
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Welcome to Polterware Notes"));
  button("Continue").click();
  await vi.waitFor(() => expect(button("Enable notifications").disabled).toBe(false));
  expect(requestNotificationAuthorization).not.toHaveBeenCalled();
  button("Enable notifications").click();
  await vi.waitFor(() => expect(requestNotificationAuthorization).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Reminders refresh when Polterware Notes runs"));
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toMatch(/Reminders: \d+ armed/);
  expect(button("Enable notifications").disabled).toBe(true);
});
it("renders registered Commander sources and strips FTS markers from snippets", async () => {
  const run = vi.fn();
  const { host, search } = mount([{
    id: "search",
    routes: [],
    commandSources: [{ id: "notes", search: async query => ({ hits: [{ id: "hit-1", label: `Found ${query}`, snippet: "see <b>milk</b> here", run }] }) }],
  }]);
  await vi.waitFor(() => expect(host.textContent).toContain("Today is unavailable"));
  key("k"); await vi.waitFor(() => expect(document.querySelector("#notes-command-input")).not.toBeNull());
  fill("milk");
  await vi.waitFor(() => expect(document.body.textContent).toContain("Found milk"));
  expect(search).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("see milk here");
  expect(document.body.textContent).not.toContain("<b>");
  expect(document.querySelector('[role="dialog"]')?.innerHTML).not.toContain("<b>milk</b>");
  button("Found milksee milk here").click();
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
});
it("renders registered noteDetail, noteCollection, and sidebarTree", async () => {
  const Detail = (props: { noteId: string; detailSections: { id: string }[] }) => (
    <NoteDetailHost><DetailPanel.Body><DetailPanel.Main>Note detail {props.noteId} {props.detailSections.map(section => section.id).join(",")}</DetailPanel.Main></DetailPanel.Body></NoteDetailHost>
  );
  const Collection = (props: { spaceId: string }) => {
    const shell = useNotesShell();
    return <><p>Space collection {props.spaceId}/{shell.params().id}</p><Button onClick={() => shell.openNote("mem-1")}>Open note</Button></>;
  };
  const RegisteredDetail = () => {
    const shell = useNotesShell();
    return <Detail noteId={shell.selectedNoteId() ?? ""} detailSections={shell.detailSections()} />;
  };
  const { host, onLink } = mount([
    {
      id: "notes",
      routes: [{ path: "/note/:id", title: "Note", component: RegisteredDetail }],
      noteCollection: Collection,
      noteDetail: Detail,
      detailSections: [{ id: "schedule", order: 1, component: () => <p>Schedule card</p> }],
    },
    { id: "map", routes: [], detailSections: [{ id: "place", order: 2, component: () => <p>Place card</p> }] },
    { id: "spaces", routes: [], sidebarTree: { id: "spaces-tree", component: () => <p>Registered spaces tree</p> } },
  ]);
  await vi.waitFor(() => expect(host.textContent).toContain("Registered spaces tree"));
  onLink("pwnotes://space/home");
  await vi.waitFor(() => expect(host.textContent).toContain("Space collection home/home"));
  expect(host.textContent).not.toContain("Space is unavailable");
  button("Open note").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Note detail mem-1 schedule,place"));
});
it("starts independent queries with the reminder probe", async () => {
  const delayed = mount([], { holdStatus: true });
  await vi.waitFor(() => expect(delayed.status).toHaveBeenCalled());
  await vi.waitFor(() => expect(delayed.listNotes).toHaveBeenCalled());
  await vi.waitFor(() => expect(delayed.listSpaces).toHaveBeenCalled());
  expect(delayed.host.textContent).toContain("Starting Polterware Notes");
  delayed.releaseStatus();
  await vi.waitFor(() => expect(delayed.host.textContent).toContain("Today is unavailable"));
});
it("skips duplicate Space reads when a sidebar tree is registered", async () => {
  const withTree = mount([
    { id: "spaces", routes: [], sidebarTree: { id: "spaces-tree", component: () => <p>Registered spaces tree</p> } },
  ], { holdStatus: true });
  await vi.waitFor(() => expect(withTree.listNotes).toHaveBeenCalled());
  expect(withTree.listSpaces).not.toHaveBeenCalled();
  withTree.releaseStatus();
  await vi.waitFor(() => expect(withTree.host.textContent).toContain("Registered spaces tree"));
  expect(withTree.listSpaces).not.toHaveBeenCalled();
});
