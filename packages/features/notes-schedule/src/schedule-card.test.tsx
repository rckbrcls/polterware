import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import shellFeature, { NotesShell, createShellBridge, useNotesShell, type ShellWireBridge, type NotesFeature } from "@polterware/feature-notes-shell";
import { Button } from "@polterware/frontend-design-system";
import scheduleFeature from "./index";
import { fakeScheduleBridge } from "./fake-bridge";
import { toScheduleInput, formFromSchedule, type ScheduleForm } from "./mapping";

let dispose: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("pwnotes.shell.onboarding", "complete");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.isConnected && !this.closest("[hidden]")
      ? ([new DOMRect(0, 0, 100, 32)] as unknown as DOMRectList)
      : ([] as unknown as DOMRectList);
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  Reflect.deleteProperty(globalThis, "pwnotes");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function OpenNote() {
  const shell = useNotesShell();
  return <Button onClick={() => shell.openNote("note-1")}>Open note</Button>;
}

function mount(previewOccurrences?: string[]) {
  const fake = fakeScheduleBridge();
  if (previewOccurrences) {
    fake.wire.schedule.preview = vi.fn(async () => ({
      occurrences: previewOccurrences,
      description: "Every day",
    }));
  }
  Reflect.set(globalThis, "pwnotes", fake.wire);
  const opener: NotesFeature = {
    id: "opener",
    routes: [{ path: "/today", title: "Today", component: OpenNote }],
    noteDetail: () => {
      const shell = useNotesShell();
      return <>{shell.detailSections().map(section => {
        const Content = section.component;
        return <Content />;
      })}</>;
    },
  };
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <NotesShell features={[shellFeature, opener, scheduleFeature]} bridge={createShellBridge(fake.wire as unknown as ShellWireBridge)} />, host);
  return { host, fake };
}

function pointerClick(element: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 } as const;
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
  element.click();
}

function clickNamed(label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>("button, [role='menuitem'], input, .pw-switch-row")].find(item => {
    const text = item.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return item.getAttribute("aria-label") === label || text === label || text.startsWith(`${label} `) || (item.classList.contains("pw-switch-row") && text.includes(label));
  });
  if (!found) throw new Error(`Control ${label} missing: ${document.body.textContent}`);
  pointerClick(found);
  return found;
}

function pickMenu(option: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>("[role='menuitem']")].find(element => element.textContent?.includes(option));
  if (!item) throw new Error(`Menu item ${option} missing: ${document.body.textContent}`);
  pointerClick(item);
  return item;
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label);
  if (!found) throw new Error(`Button ${label} missing: ${document.body.textContent}`);
  return found;
}

function firstArg<T>(mock: unknown): T {
  const payload = (mock as { mock?: { calls?: unknown[][] } }).mock?.calls?.[0]?.[0];
  if (payload === undefined) throw new Error("Bridge method was not called");
  return payload as T;
}

async function openCard(previewOccurrences?: string[]) {
  const mounted = mount(previewOccurrences);
  await vi.waitFor(() => expect(mounted.host.textContent).toContain("Open note"));
  button("Open note").click();
  await vi.waitFor(() => expect(document.querySelector("[data-schedule-card]")).not.toBeNull());
  await vi.waitFor(() => expect(button("Save schedule")).toBeTruthy());
  return mounted;
}

describe("schedule card", () => {
  it("saves a one-shot through ScheduleService.Set with the mapped ScheduleInput", async () => {
    const { fake } = await openCard(["2026-10-04T12:00:00.000Z"]);
    await vi.waitFor(() => expect(fake.wire.schedule.preview).toHaveBeenCalled());
    button("Save schedule").focus();
    button("Save schedule").click();
    await vi.waitFor(() => expect(fake.wire.schedule.set).toHaveBeenCalled());
    const sent = firstArg<{ schedule: Record<string, unknown> }>(fake.wire.schedule.set).schedule;
    expect(sent.noteId).toBe("note-1");
    expect(sent.tz).toBeTruthy();
    expect(sent.fireAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(typeof sent.fireAt).toBe("string");
    await vi.waitFor(() => expect(document.querySelector("[data-reminder-state]")?.getAttribute("data-reminder-state")).toBe("armed"));
  });

  it("blocks an hourly all-day combination before calling Set", async () => {
    const { fake } = await openCard();
    await vi.waitFor(() => expect(document.querySelector("[data-schedule-card]")).not.toBeNull());
    clickNamed("All day");
    clickNamed("Repeat");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Hourly"));
    pickMenu("Hourly");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Sub-day recurrence cannot represent dates."));
    expect(button("Save schedule").disabled).toBe(true);
    expect(fake.wire.schedule.set).not.toHaveBeenCalled();
  });

  it("renders the Preview description and next occurrences from the core", async () => {
    await openCard(["2026-03-01T12:00:00.000Z", "2026-03-02T12:00:00.000Z", "2026-03-03T12:00:00.000Z"]);
    await vi.waitFor(() => expect(document.querySelector("[data-schedule-summary]")?.textContent).toBe("Every day"));
    expect(document.querySelectorAll("[data-occurrence]")).toHaveLength(3);
  });

  it("snoozes the next occurrence and completes a recurring occurrence", async () => {
    const { fake } = await openCard(["2026-10-05T08:00:00.000Z"]);
    await vi.waitFor(() => expect(document.querySelector("[data-occurrence]")).not.toBeNull());
    clickNamed("Repeat");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Daily"));
    pickMenu("Daily");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Complete occurrence"));
    button("Snooze").click();
    await vi.waitFor(() => expect(fake.wire.reminders.snooze).toHaveBeenCalled());
    const snooze = firstArg<{ minutes: number; occurrenceAt: string }>(fake.wire.reminders.snooze);
    expect(snooze.minutes).toBe(10);
    expect(typeof snooze.occurrenceAt).toBe("string");
    button("Complete occurrence").click();
    await vi.waitFor(() => expect(fake.wire.schedule.completeOccurrence).toHaveBeenCalled());
  });

  it("saves a focus recipe through SetFocusRecipe", async () => {
    const { fake } = await openCard(["2026-10-04T12:00:00.000Z"]);
    clickNamed("Focus recipe");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Work"));
    button("Save schedule").click();
    await vi.waitFor(() => expect(fake.wire.schedule.setFocusRecipe).toHaveBeenCalled());
    const recipe = firstArg<{ enabled: boolean; workMin: number }>(fake.wire.schedule.setFocusRecipe);
    expect(recipe.enabled).toBe(true);
    expect(recipe.workMin).toBe(25);
  });

  it("keeps the mapped ScheduleInput identical to what Save sends", () => {
    const current = formFromSchedule({
      noteId: "note-1",
      fireAt: "2026-03-01T12:00:00.000Z",
      tz: "America/Sao_Paulo",
      freq: "daily",
      every: 1,
      weekdayMask: 0,
      endType: "never",
      allDay: false,
    });
    const mapped = toScheduleInput(current as ScheduleForm, "note-1");
    expect(mapped.freq).toBe("daily");
    expect(mapped.tz).toBe("America/Sao_Paulo");
    expect(Date.parse(mapped.fireAt)).toBe(Date.parse("2026-03-01T12:00:00.000Z"));
  });
});
