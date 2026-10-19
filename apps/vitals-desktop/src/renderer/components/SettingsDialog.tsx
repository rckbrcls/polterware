import {
  A11yDialog,
  Activity,
  Card,
  ControlButton,
  Cog,
  DataTable,
  Hammer,
  Input,
  Plug,
  Select,
  Switch,
  X,
  pushToast,
} from "@polterware/frontend-design-system";
import { For, Show, createEffect, createMemo, createSignal, type Component, type JSX } from "solid-js";
import type { KnownHost } from "../../shared/bridge";
import type { VitalsSettings } from "../../shared/settings";

type SectionId = "general" | "monitoring" | "connections" | "advanced";

const SECTIONS: { id: SectionId; label: string; icon: Component<{ size?: number; "aria-hidden"?: boolean }> }[] = [
  { id: "general", label: "General", icon: Cog },
  { id: "monitoring", label: "Monitoring", icon: Activity },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "advanced", label: "Advanced", icon: Hammer },
];

interface SearchEntry {
  section: SectionId;
  group: string;
  label: string;
  description?: string;
  keywords?: string;
}

const SEARCH_ENTRIES: SearchEntry[] = [
  { section: "general", group: "Appearance", label: "Theme", description: "System, dark or light.", keywords: "dark light mode color" },
  { section: "general", group: "Appearance", label: "Reduce transparency", description: "Solid window chrome instead of the frosted glass.", keywords: "glass vibrancy blur translucent opaque" },
  { section: "general", group: "Units", label: "Network unit", description: "Bytes or bits per second.", keywords: "bandwidth rate bits bytes" },
  { section: "monitoring", group: "Charts", label: "History window", description: "How much history the charts keep.", keywords: "samples minutes graph" },
  { section: "monitoring", group: "Processes", label: "Confirm before kill", keywords: "process signal prompt" },
  { section: "monitoring", group: "Processes", label: "Default kill signal", description: "TERM or KILL.", keywords: "sigterm sigkill process" },
  { section: "connections", group: "Sessions", label: "Confirm before closing a session", keywords: "tab close disconnect prompt" },
  { section: "connections", group: "Reconnect", label: "Auto-reconnect", keywords: "ssh drop retry" },
  { section: "connections", group: "Reconnect", label: "Reconnect delay", keywords: "seconds retry wait" },
  { section: "connections", group: "Known hosts", label: "Known hosts", description: "Trusted host key fingerprints.", keywords: "ssh fingerprint key trust remove" },
  { section: "advanced", group: "Layout", label: "Reset card layout", keywords: "cards order dashboard default" },
  { section: "advanced", group: "History", label: "Clear recent hosts", keywords: "recents history" },
];

const sectionDomId = (group: string) => `vitals-settings-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function SettingsSection(props: { title: string; description?: string; children: JSX.Element }) {
  return (
    <section id={sectionDomId(props.title)} class="flex scroll-mt-2 flex-col gap-2">
      <div class="px-1">
        <h3 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">{props.title}</h3>
        <Show when={props.description}>
          <p class="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{props.description}</p>
        </Show>
      </div>
      <Card class="flex flex-col gap-4 !p-4">{props.children}</Card>
    </section>
  );
}

function SettingsRow(props: { label: JSX.Element; description?: JSX.Element; for?: string; children?: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <label for={props.for} class="block text-[12.5px] text-[var(--color-text-primary)]">{props.label}</label>
        <Show when={props.description}>
          <p class="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{props.description}</p>
        </Show>
      </div>
      <Show when={props.children}>
        <div class="flex shrink-0 items-center gap-2">{props.children}</div>
      </Show>
    </div>
  );
}

export function SettingsDialog(props: {
  open: boolean;
  settings: VitalsSettings;
  onClose: () => void;
  onChange: (patch: Partial<VitalsSettings>) => void;
  onResetLayout: () => void;
  onClearRecents: () => void;
}) {
  const [section, setSection] = createSignal<SectionId>("general");
  const [query, setQuery] = createSignal("");
  const [hosts, setHosts] = createSignal<KnownHost[]>([]);
  const [hostsLoading, setHostsLoading] = createSignal(false);
  const [hostsError, setHostsError] = createSignal("");

  const searching = () => query().trim().length > 0;
  const results = createMemo(() => {
    const terms = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return SEARCH_ENTRIES.filter((entry) => {
      const haystack = [entry.label, entry.group, entry.description, entry.keywords, SECTIONS.find((s) => s.id === entry.section)?.label]
        .filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  });

  const refreshHosts = async () => {
    setHostsLoading(true);
    setHostsError("");
    try { setHosts(await window.vitals.listKnownHosts()); }
    catch { setHostsError("Failed to load known hosts."); }
    finally { setHostsLoading(false); }
  };
  createEffect(() => {
    if (!props.open) return;
    setQuery("");
    void refreshHosts();
  });
  const removeHost = async (key: string) => {
    try { await window.vitals.removeKnownHost(key); await refreshHosts(); }
    catch { pushToast("Failed to remove known host.", "danger"); }
  };

  const selectSection = (id: SectionId) => {
    setQuery("");
    setSection(id);
  };
  const openResult = (entry: SearchEntry) => {
    selectSection(entry.section);
    // Wait for the section to mount before scrolling to its group.
    requestAnimationFrame(() => document.getElementById(sectionDomId(entry.group))?.scrollIntoView({ block: "start" }));
  };

  return (
    <A11yDialog open={props.open} title="Settings" size="xl" chrome="flush"
      bodyClass="p-0" showCloseButton={false} autoFocusField={false} onClose={props.onClose}
      class="!rounded-[var(--radius-dialog)] !bg-[var(--color-app-background)]">
      <div class="flex min-h-0 flex-1 p-2">
        <nav aria-label="Settings sections" class="flex w-52 shrink-0 flex-col gap-1 p-2">
          <Input size="sm" type="search" class="mb-2 !rounded-full" placeholder="Search settings" aria-label="Search settings"
            autocomplete="off" spellcheck={false} value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query()) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }} />
          <For each={SECTIONS}>{(item) => {
            const active = () => !searching() && section() === item.id;
            const Icon = item.icon;
            return (
              <button type="button" aria-current={active() ? "page" : undefined}
                  class="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-0 px-2.5 text-left text-[12.5px]"
                  classList={{
                    "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]": active(),
                    "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]": !active(),
                  }}
                  onClick={() => selectSection(item.id)}>
                  <Icon size={14} aria-hidden />
                  {item.label}
                </button>
            );
          }}</For>
        </nav>

        <div class="surface-panel relative !rounded-[calc(var(--radius-dialog)-0.5rem)] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <button type="button" aria-label="Close" onClick={props.onClose}
            class="absolute top-5 right-5 z-10 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
            <X size={16} aria-hidden />
          </button>
          <div class="flex min-h-0 flex-1 flex-col overflow-auto px-8 pt-6 pb-8">
            <h2 class="m-0 mb-6 pr-10 text-[16px] font-semibold text-[var(--color-text-primary)]">
              {searching() ? "Search results" : SECTIONS.find((item) => item.id === section())?.label}
            </h2>

            <Show when={searching()}>
              <Show when={results().length > 0} fallback={
                <p class="m-0 px-1 text-[12.5px] text-[var(--color-text-muted)]">No settings match “{query().trim()}”.</p>
              }>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  <For each={results()}>{(entry) => (
                    <li>
                      <button type="button" onClick={() => openResult(entry)}
                        class="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius-control)] border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--color-surface-hover)]">
                        <span class="text-[12.5px] text-[var(--color-text-primary)]">{entry.label}</span>
                        <span class="text-[11.5px] text-[var(--color-text-muted)]">
                          {SECTIONS.find((item) => item.id === entry.section)?.label} · {entry.group}
                          {entry.description ? ` — ${entry.description}` : ""}
                        </span>
                      </button>
                    </li>
                  )}</For>
                </ul>
              </Show>
            </Show>

            <div class="flex flex-col gap-6" classList={{ hidden: searching() }}>
              <Show when={section() === "general"}>
                <SettingsSection title="Appearance">
                  <SettingsRow label="Theme" description="Follow the system or pin a theme." for="settings-theme">
                    <Select id="settings-theme" size="md" class="w-48" value={props.settings.theme} options={[
                      { value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" },
                    ]} onChange={(theme) => props.onChange({ theme: theme as VitalsSettings["theme"] })} />
                  </SettingsRow>
                  <SettingsRow label="Reduce transparency" description="Use solid window chrome instead of the frosted glass.">
                    <Switch aria-label="Reduce transparency" checked={props.settings.reduceTransparency}
                      onCheckedChange={(reduceTransparency) => props.onChange({ reduceTransparency })} />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Units">
                  <SettingsRow label="Network unit" description="How network throughput is shown." for="settings-network">
                    <Select id="settings-network" size="md" class="w-48" value={props.settings.networkUnit} options={[
                      { value: "bytes", label: "Bytes per second" }, { value: "bits", label: "Bits per second" },
                    ]} onChange={(networkUnit) => props.onChange({ networkUnit: networkUnit as VitalsSettings["networkUnit"] })} />
                  </SettingsRow>
                </SettingsSection>
              </Show>

              <Show when={section() === "monitoring"}>
                <SettingsSection title="Charts">
                  <SettingsRow label="History window" description="About one sample per second." for="settings-history">
                    <Select id="settings-history" size="md" class="w-48" value={String(props.settings.historyWindowMinutes)}
                      options={[2, 5, 10].map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` }))}
                      onChange={(value) => props.onChange({ historyWindowMinutes: Number(value) as VitalsSettings["historyWindowMinutes"] })} />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Processes">
                  <SettingsRow label="Confirm before kill" description="Ask before sending a signal to a process.">
                    <Switch aria-label="Confirm before kill" checked={props.settings.confirmBeforeKill}
                      onCheckedChange={(confirmBeforeKill) => props.onChange({ confirmBeforeKill })} />
                  </SettingsRow>
                  <SettingsRow label="Default kill signal" description="TERM asks politely; KILL stops immediately." for="settings-signal">
                    <Select id="settings-signal" size="md" class="w-48" value={props.settings.defaultKillSignal} options={[
                      { value: "TERM", label: "TERM" }, { value: "KILL", label: "KILL" },
                    ]} onChange={(defaultKillSignal) => props.onChange({ defaultKillSignal: defaultKillSignal as VitalsSettings["defaultKillSignal"] })} />
                  </SettingsRow>
                </SettingsSection>
              </Show>

              <Show when={section() === "connections"}>
                <SettingsSection title="Sessions">
                  <SettingsRow label="Confirm before closing a session" description="Ask before closing a connected tab.">
                    <Switch aria-label="Confirm before closing a session" checked={props.settings.confirmBeforeCloseSession}
                      onCheckedChange={(confirmBeforeCloseSession) => props.onChange({ confirmBeforeCloseSession })} />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Reconnect">
                  <SettingsRow label="Auto-reconnect" description="Retry when an SSH session drops.">
                    <Switch aria-label="Auto-reconnect" checked={props.settings.autoReconnect}
                      onCheckedChange={(autoReconnect) => props.onChange({ autoReconnect })} />
                  </SettingsRow>
                  <SettingsRow label="Reconnect delay" description="Seconds to wait, between 1 and 300." for="settings-delay">
                    <Input id="settings-delay" size="md" class="w-24" type="number" min="1" max="300" step="1"
                      value={props.settings.reconnectDelaySeconds} disabled={!props.settings.autoReconnect}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value) && value >= 1 && value <= 300) props.onChange({ reconnectDelaySeconds: value });
                        else event.currentTarget.value = String(props.settings.reconnectDelaySeconds);
                      }} />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Known hosts" description="Removing a host asks you to verify its key on the next connection.">
                  <Show when={hostsError()}>
                    <p role="alert" class="m-0 text-[12px] text-[var(--color-danger)]">{hostsError()}</p>
                  </Show>
                  <DataTable.Root rows={hosts()} getRowId={(row: KnownHost) => row.key}>
                    <Show when={hostsLoading() && hosts().length === 0}>
                      <p role="status" class="m-0 text-[12px] text-[var(--color-text-muted)]">Loading known hosts…</p>
                    </Show>
                    <DataTable.Table aria-label="Known hosts">
                      <DataTable.Header>
                        <DataTable.ColumnHeader<KnownHost> id="host">Host</DataTable.ColumnHeader>
                        <DataTable.ColumnHeader<KnownHost> id="fingerprint">Fingerprint</DataTable.ColumnHeader>
                        <DataTable.ColumnHeader<KnownHost> id="actions" sortable={false} resizable={false}><span class="sr-only">Actions</span></DataTable.ColumnHeader>
                      </DataTable.Header>
                      <DataTable.Empty>No known hosts yet.</DataTable.Empty>
                      <DataTable.Body<KnownHost>>{(row) => (
                        <DataTable.Row row={row}>
                          <DataTable.Cell>{row.key}</DataTable.Cell>
                          <DataTable.Cell><span class="font-mono text-[11.5px] break-all text-[var(--color-text-secondary)]">{row.fingerprint}</span></DataTable.Cell>
                          <DataTable.Cell>
                            <ControlButton tone="danger" class="vitals-kill" aria-label={`Remove ${row.key}`} onClick={() => void removeHost(row.key)}>Remove</ControlButton>
                          </DataTable.Cell>
                        </DataTable.Row>
                      )}</DataTable.Body>
                    </DataTable.Table>
                  </DataTable.Root>
                </SettingsSection>
              </Show>

              <Show when={section() === "advanced"}>
                <SettingsSection title="Layout">
                  <SettingsRow label="Reset card layout" description="Restore the default order and positions of dashboard cards.">
                    <ControlButton onClick={() => { props.onResetLayout(); pushToast("Card layout reset.", "success"); }}>Reset</ControlButton>
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="History">
                  <SettingsRow label="Clear recent hosts" description="Saved servers are kept.">
                    <ControlButton onClick={() => { props.onClearRecents(); pushToast("Recent hosts cleared.", "success"); }}>Clear</ControlButton>
                  </SettingsRow>
                </SettingsSection>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </A11yDialog>
  );
}
