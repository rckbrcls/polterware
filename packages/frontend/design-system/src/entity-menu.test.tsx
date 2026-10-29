// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { DataTable, focusDataTableRow } from "./table";
import { createEntityContextMenu, EntityContextMenu, EntityMenuButton, type EntityAction } from "./entity-menu";
import { EntityNavigator } from "./entity-navigator";
import { PropertyPicker } from "./property-picker";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(view: () => any) {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(view, host);
  return { host, dispose };
}

describe("EntityMenu", () => {
  it("lists the same actions in the button menu and the right-click menu, with group separators", async () => {
    const archive = vi.fn();
    const actions: EntityAction[] = [
      { id: "open", label: "Open", hint: "↵", onSelect: vi.fn() },
      { id: "copy", label: "Copy link", onSelect: vi.fn() },
      { id: "archive", label: "Archive", danger: true, group: "danger", onSelect: archive },
    ];
    const menu = createEntityContextMenu();
    const { host, dispose } = mount(() => (
      <div onContextMenu={(event) => menu.open(event, actions)}>
        <span data-testid="target">Row</span>
        <EntityContextMenu menu={menu} />
      </div>
    ));
    host.querySelector("[data-testid=target]")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
    expect(menu.state()).toMatchObject({ x: 20, y: 30 });
    await vi.waitFor(() => expect(document.querySelectorAll("[role=menuitem]")).toHaveLength(3));
    const items = [...document.querySelectorAll("[role=menuitem]")].map((item) => item.textContent);
    expect(items).toEqual(["Open↵", "Copy link", "Archive"]);
    expect(document.querySelectorAll("[role=separator]")).toHaveLength(1);
    dispose();
  });

  it("opens nothing for an entity with no actions", () => {
    const menu = createEntityContextMenu();
    const event = new MouseEvent("contextmenu", { cancelable: true });
    menu.open(event, []);
    expect(menu.state()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    const { host, dispose } = mount(() => <EntityMenuButton label="Actions for Empty" actions={[]} />);
    expect(host.querySelector("button")).toBeNull();
    dispose();
  });

  it("keeps clicks on the button from reaching the row", () => {
    const activate = vi.fn();
    const { host, dispose } = mount(() => (
      <div onClick={activate}>
        <EntityMenuButton label="Actions for Alpha" actions={[{ id: "open", label: "Open", onSelect: vi.fn() }]} />
      </div>
    ));
    host.querySelector<HTMLButtonElement>("button[aria-label='Actions for Alpha']")!.click();
    expect(activate).not.toHaveBeenCalled();
    dispose();
  });
});

describe("DataTable row keyboard", () => {
  function table(onPeek?: (row: { id: string }) => void, onActivate = vi.fn()) {
    return mount(() => (
      <DataTable.Root rows={[{ id: "a" }, { id: "b" }, { id: "c" }]}>
        <DataTable.Table aria-label="Rows">
          <DataTable.Body>
            {(row) => (
              <DataTable.Row row={row} rowId={row.id} onActivate={onActivate} onPeek={onPeek}>
                <DataTable.Cell>{row.id}</DataTable.Cell>
              </DataTable.Row>
            )}
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    ));
  }

  it("moves focus with arrows and J/K, and Space peeks when the row can", () => {
    const peek = vi.fn();
    const activate = vi.fn();
    const { host, dispose } = table(peek, activate);
    const row = (id: string) => host.querySelector<HTMLTableRowElement>(`[data-row-id='${id}']`)!;
    row("a").focus();
    row("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(row("b"));
    row("b").dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(document.activeElement).toBe(row("c"));
    row("c").dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(document.activeElement).toBe(row("c"));
    row("c").dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(document.activeElement).toBe(row("b"));
    row("b").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(peek).toHaveBeenCalledWith({ id: "b" });
    expect(activate).not.toHaveBeenCalled();
    row("b").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(activate).toHaveBeenCalledWith({ id: "b" });
    expect(focusDataTableRow("a")).toBe(true);
    expect(document.activeElement).toBe(row("a"));
    expect(focusDataTableRow("missing")).toBe(false);
    dispose();
  });

  it("keeps Space as activation without a peek", () => {
    const activate = vi.fn();
    const { host, dispose } = table(undefined, activate);
    host.querySelector<HTMLTableRowElement>("[data-row-id='a']")!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(activate).toHaveBeenCalledWith({ id: "a" });
    dispose();
  });
});

describe("EntityNavigator", () => {
  it("moves with J and K inside the list bounds and ignores typing", () => {
    const next = vi.fn();
    const previous = vi.fn();
    const { host, dispose } = mount(() => (
      <>
        <input aria-label="Title" />
        <EntityNavigator position={1} total={3} onPrevious={previous} onNext={next} />
      </>
    ));
    expect(host.textContent).toContain("1 / 3");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(previous).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(next).toHaveBeenCalledTimes(1);
    host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLButtonElement>("[aria-label='Previous (K)']")!.disabled).toBe(true);
    dispose();
  });
});

describe("PropertyPicker", () => {
  const options = [
    { value: "shape", label: "Shape" },
    { value: "plan", label: "Plan" },
    { value: "build", label: "Build" },
  ];

  it("picks the nth option with a digit and filters by typing", async () => {
    const change = vi.fn();
    const close = vi.fn();
    let anchor!: HTMLButtonElement;
    const { dispose } = mount(() => (
      <>
        <button ref={anchor}>Stage</button>
        <PropertyPicker label="Stage" options={options} value="shape" open onClose={close} onChange={change} anchorRef={() => anchor} />
      </>
    ));
    const input = await vi.waitFor(() => {
      const element = document.querySelector<HTMLInputElement>("input[aria-label='Set stage']");
      expect(element).not.toBeNull();
      return element!;
    });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    expect(change).toHaveBeenCalledWith("plan");
    expect(close).toHaveBeenCalled();
    dispose();
  });

  it("offers to create what matches no option", async () => {
    const change = vi.fn();
    const create = vi.fn(async (text: string) => `new-${text}`);
    let anchor!: HTMLButtonElement;
    const { dispose } = mount(() => (
      <>
        <button ref={anchor}>Milestone</button>
        <PropertyPicker label="Milestone" options={options} open onClose={vi.fn()} onChange={change} onCreate={create} anchorRef={() => anchor} />
      </>
    ));
    const input = await vi.waitFor(() => document.querySelector<HTMLInputElement>("input[aria-label='Set milestone']")!);
    input.value = "Beta";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector("[role=option]")?.textContent).toContain("Create “Beta”"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith("new-Beta"));
    expect(create).toHaveBeenCalledWith("Beta");
    dispose();
  });
});
