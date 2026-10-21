import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import {
  Bell,
  Button,
  Cog,
  Copy,
  Globe,
  HardDrive,
  Pause,
  CalendarClock,
  DataTable,
  Eye,
  Input,
  Kbd,
  NumberStepper,
  PageEmpty,
  RefreshCw,
  Select,
  StatusChip,
  SwitchRow,
  Textarea,
  TimePicker,
  pushToast,
} from "@polterware/frontend-design-system";
import { SHORTCUTS } from "./keymap";
import { NAMED_SOUNDS, formatActivityTime } from "./model";
import { previewSound } from "./sounds";
import { settingsStore, type ReindexState } from "./store";
import { HonestyLine, PanelFrame, SettingsRow, SettingsSection } from "./ui";

function usePanel() {
  onCleanup(settingsStore.connect());
  return settingsStore;
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast(`${label} copied.`, "success");
  } catch {
    pushToast(`Could not copy ${label.toLowerCase()}.`, "danger");
  }
}

function SaveStatus() {
  const store = settingsStore;
  return (
    <HonestyLine
      state={store.saveState()}
      error={store.keyError() || store.saveError()}
      idle={store.savingKey() ? `Saved ${store.savingKey()}` : "Live"}
    />
  );
}

const SOUND_OPTIONS = [
  { value: "", label: "Default", icon: <Bell size={14} aria-hidden="true" /> },
  { value: "none", label: "None", icon: <Pause size={14} aria-hidden="true" /> },
  ...NAMED_SOUNDS.map(sound => ({ value: sound, label: sound[0]!.toUpperCase() + sound.slice(1), icon: <Bell size={14} aria-hidden="true" /> })),
];

function reminderCopy(permission: string | undefined, armed: number | undefined, planned: number | undefined): { tone: "ok" | "warn" | "danger" | "muted"; label: string; body: string } {
  if (permission === "denied") {
    return {
      tone: "danger",
      label: "Permission denied",
      body: "macOS blocked notifications for Polterware Notes. Open System Settings → Notifications → Polterware Notes and enable them. Polterware Notes cannot open that pane.",
    };
  }
  if (permission === "authorized" || permission === "provisional" || permission === "ephemeral") {
    if ((armed ?? 0) > 0) return { tone: "ok", label: `${armed} armed`, body: "Reminders are delivered by macOS and are refreshed when Polterware Notes runs." };
    if ((planned ?? 0) > 0) return { tone: "warn", label: `${planned} planned`, body: "Reminders are planned. They are refreshed when Polterware Notes runs." };
    return { tone: "ok", label: "Authorized", body: "Reminders are refreshed when Polterware Notes runs." };
  }
  return { tone: "warn", label: "Not determined", body: "Polterware Notes has not asked macOS for notification permission yet." };
}

export function GeneralPanel() {
  const store = usePanel();
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="General" description="App details and background preferences.">
        <SettingsRow label="App">
          <span class="text-[12.5px] text-[var(--color-text-secondary)]">
            {store.appInfo()?.name ?? "Polterware Notes"} {store.appInfo()?.version ?? ""}
          </span>
        </SettingsRow>
        <SettingsRow label="Updates">
          <StatusChip tone="muted" label={store.appInfo()?.updates === "disabled" ? "Disabled" : "Unavailable"} />
        </SettingsRow>
        <SwitchRow
          label={<span class="flex flex-col whitespace-normal"><span>Keep running in background</span><span class="whitespace-normal text-[11.5px] text-[var(--color-text-secondary)]">Armed reminders still fire after Polterware Notes quits. This does not enable launch at login.</span></span>}
          checked={store.settings().appKeepRunningInBackground ?? false}
          onCheckedChange={value => void store.set("app.keepRunningInBackground", value)}
        />
        <SaveStatus />
      </SettingsSection>
    </PanelFrame>
  );
}

export function NotificationsPanel() {
  const store = usePanel();
  const status = () => reminderCopy(store.reminders()?.permission, store.reminders()?.armed, store.reminders()?.planned);
  const permission = () => store.reminders()?.permission ?? "not_determined";
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Delivery" description="Sound, all-day delivery time, and snooze.">
        <SettingsRow label="Sound" description="Preview plays the bundled file, or a short tone when the file is missing.">
          <Select aria-label="Notification sound" value={store.settings().notificationsSound ?? ""} options={SOUND_OPTIONS} onChange={value => void store.set("notifications.sound", value)} />
          <Button size="sm" variant="ghost" onClick={() => void previewSound(store.settings().notificationsSound || "glass")}>Preview</Button>
        </SettingsRow>
        <SettingsRow label="All-day time" description="Wall-clock time used for all-day reminders.">
          <TimePicker label="All-day time" value={store.settings().notificationsAllDayTime ?? "09:00"} onValueChange={value => void store.set("notifications.allDayTime", value)} />
        </SettingsRow>
        <SettingsRow label="Snooze minutes">
          <NumberStepper label="Snooze minutes" min={1} max={1440} value={String(store.settings().notificationsSnoozeMinutes ?? 10)} onValueChange={details => { if (Number.isFinite(details.valueAsNumber)) void store.set("notifications.snoozeMinutes", Math.trunc(details.valueAsNumber)); }} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Notifier">
        <SettingsRow label="Status" description={status().body}>
          <StatusChip tone={status().tone} label={status().label} />
          <Show when={permission() === "not_determined"}>
            <Button size="sm" disabled={store.authState() === "queued"} onClick={() => void store.requestNotifications()}>Enable notifications</Button>
          </Show>
        </SettingsRow>
        <Show when={store.authError()}><p class="m-0 text-[12px] text-[var(--color-danger)]" role="alert">{store.authError()}</p></Show>
        <SaveStatus />
      </SettingsSection>
    </PanelFrame>
  );
}

export function FocusPanel() {
  const store = usePanel();
  const setNumber = (key: "focus.work" | "focus.shortBreak" | "focus.longBreak" | "focus.cycles", value: number) => {
    if (Number.isFinite(value)) void store.set(key, Math.trunc(value));
  };
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Durations" description="Used for quick focus when a note has no recipe.">
        <SettingsRow label="Work minutes">
          <NumberStepper label="Work" min={1} max={60} value={String(store.settings().focusWorkMin ?? 25)} onValueChange={details => setNumber("focus.work", details.valueAsNumber)} />
        </SettingsRow>
        <SettingsRow label="Short break">
          <NumberStepper label="Short break" min={1} max={60} value={String(store.settings().focusShortBreakMin ?? 5)} onValueChange={details => setNumber("focus.shortBreak", details.valueAsNumber)} />
        </SettingsRow>
        <SettingsRow label="Long break">
          <NumberStepper label="Long break" min={1} max={60} value={String(store.settings().focusLongBreakMin ?? 15)} onValueChange={details => setNumber("focus.longBreak", details.valueAsNumber)} />
        </SettingsRow>
        <SettingsRow label="Cycles">
          <NumberStepper label="Cycles" min={1} max={12} value={String(store.settings().focusCycles ?? 4)} onValueChange={details => setNumber("focus.cycles", details.valueAsNumber)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Behavior">
        <SwitchRow label="Auto-continue" checked={store.settings().focusAutoContinue ?? false} onCheckedChange={value => void store.set("focus.autoContinue", value)} />
        <SwitchRow label="Play focus sounds" checked={store.settings().focusSounds ?? false} onCheckedChange={value => void store.set("focus.sounds", value)} />
        <SwitchRow label="Phase-end notifications" checked={store.settings().focusNotifications ?? false} onCheckedChange={value => void store.set("focus.notifications", value)} />
      </SettingsSection>
      <SettingsSection title="Sound">
        <SettingsRow label="Preview completion sound">
          <Button size="sm" variant="ghost" onClick={() => void previewSound("glass")}>Preview</Button>
        </SettingsRow>
        <SaveStatus />
      </SettingsSection>
    </PanelFrame>
  );
}

export function CalendarPanel() {
  const store = usePanel();
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Calendar" description="Week start for calendar and review grids.">
        <SettingsRow label="Week starts on">
          <Select
            aria-label="Week starts on"
            value={store.settings().calendarWeekStart ?? "mon"}
            options={[{ value: "mon", label: "Monday", icon: <CalendarClock size={14} aria-hidden="true" /> }, { value: "sun", label: "Sunday", icon: <CalendarClock size={14} aria-hidden="true" /> }]}
            onChange={value => void store.set("calendar.weekStart", value)}
          />
        </SettingsRow>
        <SaveStatus />
      </SettingsSection>
    </PanelFrame>
  );
}

export function MapPanel() {
  const store = usePanel();
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection
        title="Tiles"
        description="Online tiles are downloaded from OpenFreeMap. Your viewport is visible to the tile host. Places do not trigger notifications in v1."
      >
        <SwitchRow
          label="Online map tiles"
          checked={store.settings().mapOnline ?? false}
          onCheckedChange={value => void store.set("map.online", value)}
        />
        <SettingsRow label="Provider" description="PMTiles requires a local region file; no region loader is available in this build.">
          <Select
            aria-label="Map provider"
            value={store.settings().mapProvider ?? ""}
            options={[{ value: "", label: "Default", icon: <Cog size={14} aria-hidden="true" /> }, { value: "openfreemap", label: "OpenFreeMap", icon: <Globe size={14} aria-hidden="true" /> }, { value: "pmtiles", label: "PMTiles", icon: <HardDrive size={14} aria-hidden="true" /> }]}
            onChange={value => void store.set("map.provider", value)}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Address search">
        <SwitchRow
          label="Address search"
          checked={store.settings().mapGeocoding === true}
          disabled={store.saveState() === "queued"}
          onCheckedChange={value => void store.set("map.geocoding", value)}
        />
        <p class="text-[12px] text-[var(--color-text-muted)]">Typed address text is sent to Nominatim, a third party. Off by default. Changing this reloads Polterware Notes. Save place edits first.</p>
        <SaveStatus />
      </SettingsSection>
    </PanelFrame>
  );
}

function searchStatus(state: ReindexState, documents: number | undefined): { tone: "ok" | "warn" | "danger" | "muted" | "syncing"; label: string } {
  if (state === "progress") return { tone: "syncing", label: "Reindexing…" };
  if (state === "failed") return { tone: "danger", label: "Reindex failed" };
  if (state === "unavailable") return { tone: "muted", label: "Index unavailable" };
  return { tone: "ok", label: `${documents ?? 0} documents` };
}

export function SearchPanel() {
  const store = usePanel();
  const status = () => searchStatus(store.reindexState(), store.search()?.ftsDocuments);
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Search" description="Search matches words in your notes. Semantic search is unavailable.">
        <SettingsRow label="Index" description="Notes included in the search index.">
          <StatusChip tone={status().tone} label={status().label} />
          <Button size="sm" disabled={store.reindexState() === "progress"} onClick={() => void store.reindex()}>Reindex</Button>
        </SettingsRow>
        <Show when={store.reindexError()}><p class="m-0 text-[12px] text-[var(--color-danger)]" role="alert">{store.reindexError()}</p></Show>
      </SettingsSection>
    </PanelFrame>
  );
}

function SnippetBlock(props: { label: string; value: string }) {
  const store = usePanel();
  const displayed = () => {
    const token = store.agent()?.token;
    return !store.revealedToken() && token ? props.value.split(token).join("<mcp-token>") : props.value;
  };
  return (
    <div class="flex flex-col gap-2">
      <SettingsRow label={props.label}>
        <Button size="sm" variant="ghost" aria-label={`Copy ${props.label}`} onClick={() => void copyText(props.label, props.value)}>
          <Copy size={14} />
          Copy
        </Button>
      </SettingsRow>
      <Textarea readOnly rows={4} aria-label={props.label} value={displayed()} class="font-mono text-[12px]" />
    </div>
  );
}

export function AgentsAccessPanel() {
  const store = usePanel();
  const token = () => store.agent()?.token ?? "";
  const masked = () => token() ? "•".repeat(Math.min(24, token().length)) : "No token";
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="MCP access" description="Connect an agent on this Mac using MCP. Keep your access token private.">
        <SwitchRow
          label="Enable MCP"
          checked={store.settings().agentsMcpEnabled ?? false}
          onCheckedChange={value => void store.set("agents.mcpEnabled", value)}
        />
        <SettingsRow label="Port">
          <NumberStepper label="MCP port" min={1} max={65535} value={String(store.settings().agentsMcpPort ?? 47600)} onValueChange={details => { if (Number.isFinite(details.valueAsNumber)) void store.set("agents.mcpPort", Math.trunc(details.valueAsNumber)); }} />
        </SettingsRow>
        <SettingsRow label="Token" description={store.agent()?.tokenPresent ? "An access token is available." : "No access token yet."}>
          <code class="max-w-[16rem] truncate font-mono text-[12px] text-[var(--color-text-secondary)]">{store.revealedToken() ? token() || "No token" : masked()}</code>
          <Button size="sm" variant="ghost" aria-label={store.revealedToken() ? "Hide token" : "Reveal token"} onClick={() => store.setRevealedToken(!store.revealedToken())}><Eye size={14} /></Button>
          <Button size="sm" variant="ghost" disabled={!token()} onClick={() => void copyText("Token", token())}><Copy size={14} />Copy</Button>
          <Button size="sm" onClick={() => void store.rotateToken()}><RefreshCw size={14} />Rotate</Button>
        </SettingsRow>
        <Show when={store.tokenInvalidated()}>
          <p class="m-0 text-[12px] text-[var(--color-text-secondary)]" data-token-invalidated="true">
            Previous token is no longer valid.
          </p>
        </Show>
        <SwitchRow
          label="Allow file attach from agents"
          checked={store.settings().agentsAllowFileAttach ?? false}
          onCheckedChange={value => void store.set("agents.allowFileAttach", value)}
        />
        <SettingsRow label="Test connection" description="Check whether local MCP access is available.">
          <Button size="sm" disabled={store.mcpTestState() === "queued"} onClick={() => void store.testConnection()}>Test connection</Button>
          <Show when={store.mcpTest()}>
            {result => <StatusChip tone={result().ok ? "ok" : "danger"} label={result().ok ? "Connected" : "Failed"} />}
          </Show>
        </SettingsRow>
        <Show when={store.mcpTest()?.detail}>
          <p class="m-0 text-[12px] text-[var(--color-text-secondary)]" data-mcp-test-detail="true">{store.mcpTest()?.detail}</p>
        </Show>
        <SaveStatus />
      </SettingsSection>
      <SettingsSection title="Client snippets" description="Copy a configuration into your agent client.">
        <SnippetBlock label="Claude Code (stdio)" value={store.snippets().claudeStdio} />
        <SnippetBlock label="Claude Code (HTTP)" value={store.snippets().claudeHttp} />
        <SnippetBlock label="Cursor (stdio JSON)" value={store.snippets().cursorStdioJson} />
        <SnippetBlock label="Cursor (HTTP JSON)" value={store.snippets().cursorHttpJson} />
        <SnippetBlock label="Cursor mcp.json" value={store.snippets().cursorConfig} />
        <SnippetBlock label="Claude Desktop (stdio)" value={store.snippets().claudeDesktopStdio} />
        <SnippetBlock label="Claude Desktop (HTTP)" value={store.snippets().claudeDesktopHttp} />
      </SettingsSection>
    </PanelFrame>
  );
}

export function AgentsActivityPanel() {
  const store = usePanel();
  onMount(() => { void store.loadActivity(); });
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Agent writes" description="Changes made by connected agents.">
        <Show when={store.activityState() === "queued"}><p class="m-0 text-[12px] text-[var(--color-text-muted)]">Loading activity…</p></Show>
        <Show when={store.activityError()}><p class="m-0 text-[12px] text-[var(--color-danger)]" role="alert">{store.activityError()}</p></Show>
        <Show when={store.activityState() === "live" && store.activity().length === 0}>
          <PageEmpty title="No agent writes" description="MCP clients have not changed anything yet." />
        </Show>
        <Show when={store.activity().length > 0}>
          <DataTable.Root rows={store.activity()} getRowId={row => row.id ?? ""} virtualized={false} estimateRowHeight={44} columnWidthsKey="activity">
            <DataTable.Table aria-label="Agent activity">
              <DataTable.Header>
                <DataTable.ColumnHeader id="actor" sortable={false}>Actor</DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="time" sortable={false}>Time</DataTable.ColumnHeader>
                <DataTable.ColumnHeader id="summary" sortable={false}>Summary</DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body>
                {row => (
                  <DataTable.Row row={row}>
                    <DataTable.Cell>{row.actor}</DataTable.Cell>
                    <DataTable.Cell>{formatActivityTime(row.at)}</DataTable.Cell>
                    <DataTable.Cell>{row.summary}</DataTable.Cell>
                  </DataTable.Row>
                )}
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </Show>
      </SettingsSection>
    </PanelFrame>
  );
}

export function DataPanel() {
  const store = usePanel();
  const [confirmation, setConfirmation] = createSignal("");
  onMount(() => { void store.loadDoctor(); });
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Export and backup" description="Choose where to save an export or database backup.">
        <SettingsRow label="Export zip">
          <Button size="sm" disabled={store.exportState() === "queued"} onClick={() => void store.exportZip()}>Export</Button>
        </SettingsRow>
        <Show when={store.exportDetail()}><p class="m-0 text-[12px] text-[var(--color-text-secondary)]">{store.exportDetail()}</p></Show>
        <SettingsRow label="Backup">
          <Button size="sm" disabled={store.backupState() === "queued"} onClick={() => void store.backup()}>Backup</Button>
        </SettingsRow>
        <Show when={store.backupDetail()}><p class="m-0 text-[12px] text-[var(--color-text-secondary)]">{store.backupDetail()}</p></Show>
      </SettingsSection>
      <SettingsSection title="Reset" description="Type RESET to confirm. Data reset is unavailable in this build; your data will not change.">
        <SettingsRow label="Confirmation">
          <Input aria-label="Type RESET to confirm" value={confirmation()} onInput={event => setConfirmation(event.currentTarget.value)} />
          <Button size="sm" variant="danger" disabled={confirmation() !== "RESET"} onClick={() => store.resetLocalData(confirmation())}>Reset local data</Button>
        </SettingsRow>
        <p class="m-0 text-[12px] text-[var(--color-text-muted)]" role="status">{store.resetError()}</p>
      </SettingsSection>
      <SettingsSection title="Doctor">
        <Show when={store.doctorState() === "queued"}><p class="m-0 text-[12px] text-[var(--color-text-muted)]">Running doctor…</p></Show>
        <Show when={store.doctorError()}><p class="m-0 text-[12px] text-[var(--color-danger)]" role="alert">{store.doctorError()}</p></Show>
        <Show when={store.doctorOk() !== undefined}>
          <StatusChip tone={store.doctorOk() ? "ok" : "danger"} label={store.doctorOk() ? "Healthy" : "Issues found"} />
        </Show>
        <For each={store.doctor()}>
          {check => (
            <SettingsRow label={check.name} description={check.detail}>
              <StatusChip tone={check.ok ? "ok" : "danger"} label={check.ok ? "OK" : "Failed"} />
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
    </PanelFrame>
  );
}

export function ShortcutsPanel() {
  usePanel();
  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Keyboard" description="Keyboard shortcuts are read-only in this build.">
        <DataTable.Root rows={SHORTCUTS} getRowId={row => row.id} virtualized={false} estimateRowHeight={40} resizableColumns={false}>
          <DataTable.Table aria-label="Keyboard shortcuts">
            <DataTable.Header>
              <DataTable.ColumnHeader id="group" sortable={false}>Group</DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="action" sortable={false}>Action</DataTable.ColumnHeader>
              <DataTable.ColumnHeader id="keys" sortable={false}>Keys</DataTable.ColumnHeader>
            </DataTable.Header>
            <DataTable.Body>
              {row => (
                <DataTable.Row row={row}>
                  <DataTable.Cell>{row.group}</DataTable.Cell>
                  <DataTable.Cell>{row.action}</DataTable.Cell>
                  <DataTable.Cell><Kbd>{row.keys}</Kbd></DataTable.Cell>
                </DataTable.Row>
              )}
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </SettingsSection>
    </div>
  );
}

export function AdvancedPanel() {
  const store = usePanel();
  return (
    <PanelFrame state={store.loadState()} error={store.loadError()} onRetry={() => void store.refresh()}>
      <SettingsSection title="Links" description="Link preferences for Polterware Notes.">
        <SwitchRow
          label="Fetch link titles (unavailable in this build)"
          checked={store.settings().linksFetchTitles ?? false}
          onCheckedChange={value => void store.set("links.fetchTitles", value)}
        />
        <SaveStatus />
      </SettingsSection>
      <SettingsSection title="Files" description="Local files.">
        <SettingsRow label="Logs" description="Reveal the Polterware Notes log file in Finder."><Button size="sm" disabled={store.advancedState() === "queued"} onClick={() => void store.reveal("log")}>Open logs</Button></SettingsRow>
        <SettingsRow label="Open data folder" description="Reveal the Polterware Notes data directory in Finder."><Button size="sm" disabled={store.advancedState() === "queued"} onClick={() => void store.reveal("data")}>Open data folder</Button></SettingsRow>
        <HonestyLine state={store.advancedState()} idle={store.advancedDetail() || "Live"} error={store.advancedState() === "failed" ? store.advancedDetail() : ""} />
      </SettingsSection>
      <SettingsSection title="Window" description="Launch and window appearance.">
        <SettingsRow label="Open at login" description="Automatic launch at login is unavailable in this build."><StatusChip tone="muted" label="Unavailable" /></SettingsRow>
        <SwitchRow label="Reduce transparency" checked={store.reduceTransparency() === true} disabled={store.reduceTransparency() === undefined || store.appearanceState() === "queued"} onCheckedChange={value => void store.setReduceTransparency(value)} />
        <HonestyLine state={store.appearanceState()} idle="Window preference applied" error={store.appearanceError()} />
      </SettingsSection>
    </PanelFrame>
  );
}
