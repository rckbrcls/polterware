import { For, createSignal, onCleanup, type JSX } from "solid-js";
import { render } from "solid-js/web";
import {
  DesignSystemProvider, Checkbox, SegmentedControl, NumberStepper, Slider, DatePicker, parseDate,
  TimePicker, ColorSwatchPicker, parseColor, IconPicker, PICKER_ICONS, TreeView, ProgressRing,
  Heatmap, CalendarGrid, PageEmpty, EmptyIllustration, Button, StatusChip, DataTable, DetailPanel,
  MarkdownEditor, IconTile, Kbd, Switch, Input, Textarea, Select, Field, FormStack, Card, Surface,
  PageToolbar, FilterChip, Popover, Dialog, Tabs, Tooltip, type PickerIconName,
} from "@polterware/frontend-design-system";
import "@fontsource-variable/inter/opsz.css";


function Entry(props: { title: string; children: JSX.Element }) {
  return <section class="gallery__entry" aria-label={props.title}><h2>{props.title}</h2><div class="gallery__examples">{props.children}</div></section>;
}
export function LegacyGallery() {
  const [reduced, setReduced] = createSignal(false);
  // The gallery toggle drives both CSS media rules and the shared JS preference helper.
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const result = nativeMatchMedia(query);
    if (query === "(prefers-reduced-motion: reduce)") Object.defineProperty(result, "matches", { get: () => reduced() || nativeMatchMedia(query).matches });
    return result;
  };
  onCleanup(() => { window.matchMedia = nativeMatchMedia; });
  const [checked, setChecked] = createSignal(true);
  const [segment, setSegment] = createSignal<string | null>("week");
  const [number, setNumber] = createSignal("25");
  const [volume, setVolume] = createSignal([40]);
  const [time, setTime] = createSignal("09:30");
  const [icon, setIcon] = createSignal<PickerIconName>("brain");
  const [progress, setProgress] = createSignal(65);
  const [note, setNote] = createSignal("## Note\n\nA small note with **Markdown**.");
  const [detail, setDetail] = createSignal(false), [expanded, setExpanded] = createSignal(false);
  const [dialog, setDialog] = createSignal(false), [popover, setPopover] = createSignal(false);
  const [tab, setTab] = createSignal("first");
  let popoverAnchor: HTMLButtonElement | undefined;
  const options = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];
  const rows = [{ id: "one", title: "Plan the day", state: "planned" }, { id: "two", title: "Take a walk", state: "armed" }];
  const days = Array.from({ length: 182 }, (_, index) => ({ date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10), value: index % 17 }));
  return <DesignSystemProvider storagePrefix="gallery" expandDetail={() => setExpanded(true)}>
    <main class="gallery" data-reduced-motion={reduced() ? "" : undefined}>
      <style>{reduced() ? "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }" : ""}</style>
      <header class="gallery__header"><div><h1>Design system</h1><p>Shared Polterware and Polterware Notes primitives · preview data</p></div><Switch checked={reduced()} onCheckedChange={setReduced} aria-label="Reduced motion" /></header>
      <Entry title="Checkbox"><Checkbox label="Controlled" checked={checked()} onCheckedChange={d => setChecked(d.checked === true)} /><Checkbox label="Round" shape="round" defaultChecked /><Checkbox label="Indeterminate" checked="indeterminate" /><Checkbox label="Disabled" disabled /></Entry>
      <Entry title="SegmentedControl"><SegmentedControl aria-label="Calendar view" options={options} value={segment()} onValueChange={d => setSegment(d.value)} /><SegmentedControl aria-label="Disabled view" options={options} defaultValue="day" disabled /></Entry>
      <Entry title="NumberStepper"><NumberStepper label="Minutes" value={number()} min={1} max={60} onValueChange={d => setNumber(d.value)} /><NumberStepper label="Disabled" defaultValue="5" disabled /></Entry>
      <Entry title="Slider"><div style={{ width: "240px" }}><Slider label="Volume" value={volume()} onValueChange={d => setVolume(d.value)} /></div><div style={{ width: "240px" }}><Slider label="Range" defaultValue={[20, 80]} disabled /></div></Entry>
      <Entry title="DatePicker"><DatePicker label="Due date" defaultValue={[parseDate("2026-10-04")]} /><DatePicker label="Disabled date" disabled /></Entry>
      <Entry title="TimePicker"><TimePicker label="Reminder" value={time()} onValueChange={setTime} /><TimePicker label="Disabled" disabled /></Entry>
      <Entry title="ColorSwatchPicker"><ColorSwatchPicker label="Space color" defaultValue={parseColor("#7EA8F0")} swatches={[{ value: "#7EA8F0", label: "Blue" }, { value: "#6ED9A8", label: "Green" }, { value: "#FFB84D", label: "Amber" }]} /></Entry>
      <Entry title="IconPicker"><IconPicker label="Space icon" value={icon()} onValueChange={setIcon} /><For each={Object.entries(PICKER_ICONS)}>{([name, Icon]) => <span title={name}><Icon size={16} /></span>}</For></Entry>
      <Entry title="TreeView"><TreeView label="Spaces" nodes={[{ id: "work", label: "Work", children: [{ id: "ideas", label: "Ideas" }] }, { id: "personal", label: "Personal" }]} defaultExpandedValue={["work"]} /></Entry>
      <Entry title="ProgressRing"><ProgressRing label="Focus session" value={progress()} /><Button variant="secondary" onClick={() => setProgress(value => (value + 25) % 101)}>Advance</Button><ProgressRing label="Complete" value={100} /></Entry>
      <Entry title="Heatmap"><Heatmap label="Contribution days" days={days} /></Entry>
      <Entry title="CalendarGrid"><For each={["day", "week", "month"] as const}>{view => <div class="gallery__wide"><CalendarGrid.Root view={view} label={`${view} calendar`}><CalendarGrid.Days><For each={Array.from({ length: view === "day" ? 1 : 7 }, (_, index) => index)}>{day => <CalendarGrid.Day label={`October ${day + 4}`} today={day === 0}><CalendarGrid.Header>Oct {day + 4}</CalendarGrid.Header><CalendarGrid.AllDay><CalendarGrid.Occurrence>Read a chapter</CalendarGrid.Occurrence></CalendarGrid.AllDay>{view === "month" ? <CalendarGrid.Overflow count={3} /> : <CalendarGrid.HourRow label="09:00"><CalendarGrid.Occurrence overdue>Morning walk</CalendarGrid.Occurrence></CalendarGrid.HourRow>}</CalendarGrid.Day>}</For></CalendarGrid.Days></CalendarGrid.Root></div>}</For></Entry>
      <Entry title="EmptyIllustration"><PageEmpty title="No notes yet" illustration={<EmptyIllustration><IconTile><span>✦</span></IconTile></EmptyIllustration>} /></Entry>
      <Entry title="Button"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button disabled>Disabled</Button></Entry>
      <Entry title="StatusChip"><StatusChip tone="ok">Armed</StatusChip><StatusChip tone="syncing">Planned</StatusChip><StatusChip tone="danger">Permission denied</StatusChip></Entry>
      <Entry title="IconTile"><IconTile brand="github"><span>G</span></IconTile><IconTile accent="var(--color-brand)"><span>S</span></IconTile>{["postgres", "aws", "stripe", "supabase", "redis", "docker", "openai", "vercel"].map((brand) => <IconTile brand={brand} size={36}><span>{brand[0]!.toUpperCase()}</span></IconTile>)}</Entry>
      <Entry title="Kbd"><Kbd>⌘J</Kbd><Kbd>⌘K</Kbd></Entry>
      <Entry title="DataTable and DetailPanel"><div class="gallery__wide gallery__panel"><DetailPanel.Root open={detail()} expanded={expanded()} onOpenChange={setDetail} onExpandedChange={setExpanded}><DetailPanel.Collection><DataTable.Root rows={rows} getRowId={row => row.id}><DataTable.Table><DataTable.Header><DataTable.ColumnHeader id="title">Note</DataTable.ColumnHeader></DataTable.Header><DataTable.Body>{row => <DataTable.Row row={row} onActivate={() => setDetail(true)}><DataTable.Cell>{row.title}</DataTable.Cell></DataTable.Row>}</DataTable.Body></DataTable.Table></DataTable.Root></DetailPanel.Collection><DetailPanel.Content><DetailPanel.Header /><DetailPanel.Body><DetailPanel.Main><DetailPanel.Title title="Note details" /><p>Double-click a row to expand.</p></DetailPanel.Main></DetailPanel.Body></DetailPanel.Content></DetailPanel.Root></div></Entry>
      <Entry title="MarkdownEditor"><div class="gallery__wide"><MarkdownEditor value={note()} onChange={setNote} /></div></Entry>
      <Entry title="Form stack"><FormStack><Field label="Name"><Input placeholder="Name" /></Field><Field label="Description"><Input placeholder="Description" /></Field></FormStack></Entry>
      <Entry title="Shared controls"><Field label="Title"><Input placeholder="Note title" /></Field><Textarea aria-label="Note" placeholder="Note" /><Select value="one" onChange={() => {}} options={[{ value: "one", label: "Option one" }]} /><Switch checked={checked()} onCheckedChange={setChecked} aria-label="Toggle" /><FilterChip>Pinned</FilterChip></Entry>
      <Entry title="Shared surfaces"><Card>Card content</Card><Surface>Surface content</Surface><PageToolbar.Root><PageToolbar.Leading><Button variant="ghost">Toolbar action</Button></PageToolbar.Leading></PageToolbar.Root></Entry>
      <Entry title="Shared overlays"><Button ref={popoverAnchor} onClick={() => setPopover(true)}>Open popover</Button><Popover open={popover()} onClose={() => setPopover(false)} anchorRef={() => popoverAnchor} title="Preview"><div class="pw-picker__body">Popover content</div></Popover><Button onClick={() => setDialog(true)}>Open dialog</Button><Dialog open={dialog()} onClose={() => setDialog(false)} title="Preview">Dialog content</Dialog><Tooltip.Root><Tooltip.Trigger>Tooltip</Tooltip.Trigger><Tooltip.Content>Helpful text</Tooltip.Content></Tooltip.Root></Entry>
      <Entry title="Tabs"><Tabs items={[{ id: "first", label: "First" }, { id: "second", label: "Second" }]} value={tab()} onChange={setTab} /></Entry>
    </main>
  </DesignSystemProvider>;
}
