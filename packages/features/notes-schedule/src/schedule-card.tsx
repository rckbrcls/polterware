import { For, Show, createEffect, createMemo, createSignal, onCleanup, on, type JSX } from "solid-js";
import { useNotesShell } from "@polterware/feature-notes-shell/feature";
import {
  Button, CalendarClock, Clock, DateTimePicker, DetailPanel, Switch, Field, Globe, History, Moon, Sun, XIcon, FilterChip, NumberStepper, PageError, PageLoading, SegmentedControl, Select, SwitchRow, TimePicker,
} from "@polterware/frontend-design-system";
import { browserBridge, type ScheduleBridge } from "./bridge";
import {
  END_OPTIONS, REPEAT_OPTIONS, WEEKDAYS, defaultFocusRecipe, defaultForm, errorText, focusFromSchedule, focusRecipeInput, formFromSchedule, formatOccurrence,
  reminderWording, timezoneOptions, toScheduleInput, validateFocusRecipe, validateScheduleForm, type FocusRecipeForm, type ReminderWording, type ScheduleForm, type ScheduleJSON,
} from "./mapping";

type Preview = { occurrences: string[]; description: string };
type ReminderStatus = { permission?: string; armed?: number; planned?: number; notifierLastSeenAt?: string };
type SaveState = "live" | "queued" | "failed" | "unavailable";

const REPEAT_ICONS: Record<string, JSX.Element> = {
  "": <XIcon size={14} aria-hidden="true" />,
  hourly: <Clock size={14} aria-hidden="true" />,
  daily: <Sun size={14} aria-hidden="true" />,
  weekly: <CalendarClock size={14} aria-hidden="true" />,
  monthly: <Moon size={14} aria-hidden="true" />,
  yearly: <History size={14} aria-hidden="true" />,
};

export function ScheduleCard(props: { children?: JSX.Element; onAllDayChange?: (allDay: boolean) => void }): JSX.Element {
  const shell = useNotesShell();
  const noteId = () => shell.selectedNoteId();
  return <Show when={noteId()}>{id => <ScheduleEditor noteId={id()} onAllDayChange={props.onAllDayChange}>{props.children}</ScheduleEditor>}</Show>;
}

function ScheduleEditor(props: { noteId: string; children?: JSX.Element; onAllDayChange?: (allDay: boolean) => void }) {
  const [form, setForm] = createSignal<ScheduleForm>(defaultForm());
  const [focus, setFocus] = createSignal<FocusRecipeForm>(defaultFocusRecipe());
  const [preview, setPreview] = createSignal<Preview>({ occurrences: [], description: "" });
  const [completions, setCompletions] = createSignal<string[]>([]);
  const [noteStatus, setNoteStatus] = createSignal("active");
  const [saved, setSaved] = createSignal(false);
  const [status, setStatus] = createSignal<ReminderStatus>();
  const [snoozeMinutes, setSnoozeMinutes] = createSignal(10);
  const [saveState, setSaveState] = createSignal<SaveState>("unavailable");
  const [pending, setPending] = createSignal(true);
  const [loadError, setLoadError] = createSignal("");
  const [formError, setFormError] = createSignal("");
  const [coreError, setCoreError] = createSignal("");
  const [previewError, setPreviewError] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const validation = () => validateScheduleForm(form()) || validateFocusRecipe(focus());
  const wording = (): ReminderWording => reminderWording({
    ...status(),
    noteStatus: noteStatus(),
    nextOccurrenceCompleted: completed(preview().occurrences[0], completions()),
  });
  function patch(partial: Partial<ScheduleForm>) {
    setForm(current => ({ ...current, ...partial }));
    setSaveState("queued");
    setFormError("");
  }
  function patchFocus(partial: Partial<FocusRecipeForm>) {
    setFocus(current => ({ ...current, ...partial }));
    setSaveState("queued");
  }
  async function withBridge<T>(label: string, run: (bridge: ScheduleBridge) => Promise<T>): Promise<T | undefined> {
    try {
      setBusy(label);
      const result = await run(browserBridge());
      setCoreError("");
      return result;
    } catch (error) {
      setCoreError(errorText(error));
      setSaveState("failed");
      return undefined;
    } finally {
      setBusy("");
    }
  }
  async function refreshStatus(bridge: ScheduleBridge) {
    const next = await bridge.reminders.status({}) as ReminderStatus;
    setStatus(next);
    return next;
  }
  async function load(id: string) {
    setPending(true); setLoadError("");
    try {
      const bridge = browserBridge();
      const [noteResponse, settingsResponse] = await Promise.all([
        bridge.notes.get({ id, include: { schedule: true, completions: true } }),
        bridge.settings.get({}).catch(() => ({ settings: { notificationsSnoozeMinutes: 10 } })),
      ]);
      const note = (noteResponse as { note?: { status?: string; schedule?: ScheduleJSON; completions?: { occurrenceAt?: string }[] } }).note;
      if (!note) throw new Error("Note unavailable. It may have been deleted.");
      const schedule = note.schedule;
      setForm(formFromSchedule(schedule));
      setFocus(focusFromSchedule(schedule));
      setNoteStatus(note.status ?? "active");
      setCompletions((note.completions ?? []).map(item => item.occurrenceAt ?? "").filter(Boolean));
      setSaved(Boolean(schedule?.fireAt));
      const settings = (settingsResponse as { settings?: { notificationsSnoozeMinutes?: number } }).settings;
      if (settings?.notificationsSnoozeMinutes) setSnoozeMinutes(settings.notificationsSnoozeMinutes);
      await refreshStatus(bridge);
      setSaveState("live");
    } catch (error) {
      setLoadError(errorText(error));
      setSaveState("unavailable");
    } finally {
      setPending(false);
    }
  }
  async function refreshPreview(current: ScheduleForm, id: string) {
    const issue = validateScheduleForm(current);
    if (issue) { setFormError(issue); setPreview({ occurrences: [], description: "" }); return; }
    setFormError("");
    try {
      const result = await browserBridge().schedule.preview({ schedule: toScheduleInput(current, id), limit: 5 }) as Preview;
      setPreview({ occurrences: result.occurrences ?? [], description: result.description ?? "" });
      setPreviewError("");
    } catch (error) {
      setPreview({ occurrences: [], description: "" });
      setPreviewError(errorText(error));
    }
  }
  createEffect(on(() => props.noteId, id => {
    let active = true;
    void load(id).then(() => { if (active) void refreshPreview(form(), id); });
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = browserBridge().onChange(event => {
        if (saveState() === "queued") return;
        if (event.resync || event.changes.some(change => ["schedule", "note", "notes", "reminders"].includes(change.entity))) {
          void load(id);
        }
      });
    } catch { /* The editor already reports an unavailable bridge. */ }
    onCleanup(() => { active = false; unsubscribe?.(); });
  }));
  createEffect(on(() => JSON.stringify(form()), () => {
    const id = props.noteId;
    const current = form();
    const timer = setTimeout(() => { void refreshPreview(current, id); }, 250);
    onCleanup(() => clearTimeout(timer));
  }));
  createEffect(on(() => [JSON.stringify(form()), JSON.stringify(focus()), saveState()] as const, ([, , state]) => {
    if (state !== "queued" || busy() || validation()) return;
    const timer = setTimeout(() => { void save(); }, 800);
    onCleanup(() => clearTimeout(timer));
  }, { defer: true }));
  async function save() {
    const issue = validation();
    if (issue) { setFormError(issue); return; }
    const id = props.noteId;
    const payload = toScheduleInput(form(), id);
    const recipe = focus();
    await withBridge("save", async bridge => {
      await bridge.schedule.set({ schedule: payload });
      if (recipe.enabled || saved()) await bridge.schedule.setFocusRecipe(focusRecipeInput(recipe, id));
      setSaved(true);
      setSaveState("live");
      await refreshPreview(form(), id);
      const started = Date.now();
      while (Date.now() - started < 2000) {
        await refreshStatus(bridge);
        if ((status()?.armed ?? 0) > 0 || Date.now() - started > 1500) break;
        await new Promise(done => setTimeout(done, 250));
      }
    });
  }
  async function clear() {
    await withBridge("clear", async bridge => {
      await bridge.schedule.clear({ noteId: props.noteId });
      setSaved(false);
      setForm(defaultForm());
      setFocus(defaultFocusRecipe());
      setPreview({ occurrences: [], description: "" });
      setSaveState("live");
      await refreshStatus(bridge);
    });
  }
  async function complete(occurrenceAt: string, reopen = false) {
    await withBridge(reopen ? "reopen" : "complete", async bridge => {
      if (reopen) await bridge.schedule.reopenOccurrence({ noteId: props.noteId, occurrenceAt });
      else await bridge.schedule.completeOccurrence({ noteId: props.noteId, occurrenceAt });
      await load(props.noteId);
      await refreshPreview(form(), props.noteId);
    });
  }
  async function snooze() {
    const occurrenceAt = preview().occurrences.find(item => !completed(item, completions()));
    if (!occurrenceAt) { setCoreError("No upcoming occurrence to snooze."); return; }
    await withBridge("snooze", async bridge => {
      await bridge.reminders.snooze({ noteId: props.noteId, occurrenceAt, minutes: snoozeMinutes() });
      await refreshStatus(bridge);
    });
  }
  const tz = createMemo(() => form().tz);
  const tzOptions = createMemo(() => timezoneOptions(tz()).map(option => ({ ...option, icon: <Globe size={14} aria-hidden="true" /> })));
  const keyboard = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  };
  return <div data-schedule-card class="flex flex-col gap-4" onKeyDown={keyboard}>
    <h2 class="sr-only">Schedule</h2>
    <Show when={pending()}><PageLoading label="Loading schedule" /></Show>
    <Show when={loadError()}><PageError title="Schedule unavailable" message={loadError()} onRetry={() => void load(props.noteId)} /></Show>
    <Show when={!pending() && !loadError()}>
      <DetailPanel.Properties>
        <DetailPanel.Property label="Time of day" value={
          <Select aria-label="Time of day" value={form().allDay ? "all-day" : "at-time"}
            options={[{ value: "at-time", label: "At time", icon: <Clock size={14} aria-hidden="true" /> }, { value: "all-day", label: "All day", icon: <CalendarClock size={14} aria-hidden="true" /> }]}
            onChange={value => { patch({ allDay: value === "all-day" }); props.onAllDayChange?.(value === "all-day"); }} />
        } />
        <DetailPanel.Property label="Starts" value={
          <DateTimePicker class="!w-auto !ml-auto" aria-label="Starts" dateOnly={form().allDay} value={dateTimeValue(form().date, form().time, form().allDay)}
            onValueChange={value => patch(splitDateTime(value, "date", "time"))} />
        } />
        {props.children}
        <DetailPanel.Property label="Time zone" value={
          <Select id="schedule-tz" aria-label="Time zone" value={form().tz} options={tzOptions()} onChange={tz => patch({ tz })} />
        } />
        <DetailPanel.Property label="Repeat" value={
          <Select aria-label="Repeat" value={form().freq} options={REPEAT_OPTIONS.map(option => ({ value: option.value, label: option.label, icon: REPEAT_ICONS[option.value] }))} onChange={freq => patch({ freq: freq as ScheduleForm["freq"], weekdays: freq === "weekly" ? form().weekdays : WEEKDAYS.map(() => false) })} />
        } />
        <Show when={form().freq}>
          <DetailPanel.Property label="Every" value={
            <NumberStepper class="!ml-auto" min={1} value={String(form().every)} onValueChange={details => patch({ every: Number.isFinite(details.valueAsNumber) ? Math.max(1, Math.trunc(details.valueAsNumber)) : 1 })} />
          } />
        </Show>
        <Show when={form().freq === "weekly"}>
          <DetailPanel.Property label="On" value={
            <div role="group" aria-label="Weekdays" class="ml-auto grid w-[168px] grid-cols-7 gap-0.5">
              <For each={WEEKDAYS}>{day =>
                <FilterChip class="!w-full !justify-center !px-0" selected={form().weekdays[day.bit]} aria-label={day.label} onClick={() => {
                  const weekdays = [...form().weekdays];
                  weekdays[day.bit] = !weekdays[day.bit];
                  patch({ weekdays });
                }}>{day.label.slice(0, 1)}</FilterChip>
              }</For>
            </div>
          } />
        </Show>
        <Show when={form().freq}>
          <DetailPanel.Property label="Ends" value={
            <Select aria-label="Ends" value={form().endType} options={END_OPTIONS.map(option => ({ value: option.value, label: option.label }))} onChange={endType => patch({ endType: (endType as ScheduleForm["endType"]) || "never" })} />
          } />
        </Show>
        <Show when={form().freq && form().endType === "until"}>
          <DetailPanel.Property label="Until" value={
            <DateTimePicker class="!w-auto !ml-auto" aria-label="Repeats until" dateOnly={form().allDay} value={dateTimeValue(form().untilDate, form().untilTime, form().allDay)}
              onValueChange={value => patch(splitDateTime(value, "untilDate", "untilTime"))} />
          } />
        </Show>
        <Show when={form().freq && form().endType === "count"}>
          <DetailPanel.Property label="Occurrences" value={
            <NumberStepper class="!ml-auto" min={1} value={String(form().occurrenceCount)} onValueChange={details => patch({ occurrenceCount: Number.isFinite(details.valueAsNumber) ? Math.max(1, Math.trunc(details.valueAsNumber)) : 1 })} />
          } />
        </Show>
      </DetailPanel.Properties>
      <Show when={formError()}><p role="alert">{formError()}</p></Show>
      <Show when={previewError()}><p role="status">Preview failed: {previewError()}</p></Show>
      <DetailPanel.Properties>
        <DetailPanel.Property label="Focus recipe" value={<div class="flex w-full justify-end"><Switch size="sm" aria-label="Focus recipe" checked={focus().enabled} onCheckedChange={enabled => patchFocus({ enabled })} /></div>} />
        <Show when={focus().enabled}>
          <DetailPanel.Property label="Work" value={<NumberStepper aria-label="Work" min={1} max={60} value={String(focus().workMin)} onValueChange={details => patchFocus({ workMin: clamp(details.valueAsNumber, 1, 60) })} />} />
          <DetailPanel.Property label="Short break" value={<NumberStepper aria-label="Short break" min={1} max={60} value={String(focus().shortBreakMin)} onValueChange={details => patchFocus({ shortBreakMin: clamp(details.valueAsNumber, 1, 60) })} />} />
          <DetailPanel.Property label="Long break" value={<NumberStepper aria-label="Long break" min={1} max={60} value={String(focus().longBreakMin)} onValueChange={details => patchFocus({ longBreakMin: clamp(details.valueAsNumber, 1, 60) })} />} />
          <DetailPanel.Property label="Cycles" value={<NumberStepper aria-label="Cycles" min={1} max={12} value={String(focus().cycles)} onValueChange={details => patchFocus({ cycles: clamp(details.valueAsNumber, 1, 12) })} />} />
          <DetailPanel.Property label="Auto-continue" value={<div class="flex w-full justify-end"><Switch size="sm" aria-label="Auto-continue" checked={focus().autoContinue} onCheckedChange={autoContinue => patchFocus({ autoContinue })} /></div>} />
        </Show>
      </DetailPanel.Properties>
      <Show when={coreError()}><p role="alert">{coreError()}</p></Show>
    </Show>
  </div>;
}

function completed(occurrence: string | undefined, completions: readonly string[]): boolean {
  if (!occurrence) return false;
  const stamp = Date.parse(occurrence);
  return completions.some(item => Date.parse(item) === stamp);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function dateTimeValue(date: string, time: string, allDay: boolean): string {
  if (!date) return "";
  return allDay ? date : `${date}T${time || "09:00"}`;
}

function splitDateTime<D extends "date" | "untilDate", T extends "time" | "untilTime">(value: string, dateKey: D, timeKey: T): Partial<ScheduleForm> {
  const patch: Record<string, string> = { [dateKey]: value.slice(0, 10) };
  if (value.length > 10) patch[timeKey] = value.slice(11, 16);
  return patch as Partial<ScheduleForm>;
}

