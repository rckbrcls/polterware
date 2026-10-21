import {
  Activity,
  Button,
  Cog,
  DataTable,
  Hammer,
  Input,
  Plug,
  Select,
  SettingsDialog as SharedSettingsDialog,
  SettingsRow,
  SettingsSection,
  Switch,
  pushToast,
  type SettingsSearchEntry,
} from "@polterware/frontend-design-system";
import { Show, createEffect, createSignal, type Component } from "solid-js";
import type { KnownHost } from "../../shared/bridge";
import type { VitalsSettings } from "../../shared/settings";

type SectionId = "general" | "monitoring" | "connections" | "advanced";

const SECTIONS: { id: SectionId; label: string; icon: Component<{ size?: number; "aria-hidden"?: boolean }> }[] = [
  { id: "general", label: "General", icon: Cog },
  { id: "monitoring", label: "Monitoring", icon: Activity },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "advanced", label: "Advanced", icon: Hammer },
];

const SEARCH_ENTRIES: SettingsSearchEntry[] = [
  { item: "general", section: "Appearance", label: "Reduce transparency", description: "Solid window chrome instead of the frosted glass.", keywords: "glass vibrancy blur translucent opaque" },
  { item: "general", section: "Units", label: "Network unit", description: "Bytes or bits per second.", keywords: "bandwidth rate bits bytes" },
  { item: "monitoring", section: "Charts", label: "History window", description: "How much history the charts keep.", keywords: "samples minutes graph" },
  { item: "monitoring", section: "Processes", label: "Confirm before kill", keywords: "process signal prompt" },
  { item: "monitoring", section: "Processes", label: "Default kill signal", description: "TERM or KILL.", keywords: "sigterm sigkill process" },
  { item: "connections", section: "Sessions", label: "Confirm before closing a session", keywords: "tab close disconnect prompt" },
  { item: "connections", section: "Reconnect", label: "Auto-reconnect", keywords: "ssh drop retry" },
  { item: "connections", section: "Reconnect", label: "Reconnect delay", keywords: "seconds retry wait" },
  { item: "connections", section: "Known hosts", label: "Known hosts", description: "Trusted host key fingerprints.", keywords: "ssh fingerprint key trust remove" },
  { item: "advanced", section: "Layout", label: "Reset card layout", keywords: "cards order dashboard default" },
  { item: "advanced", section: "History", label: "Clear recent hosts", keywords: "recents history" },
];

export function SettingsDialog(props: {
  open: boolean;
  settings: VitalsSettings;
  onClose: () => void;
  onChange: (patch: Partial<VitalsSettings>) => void;
  onResetLayout: () => void;
  onClearRecents: () => void;
}) {
  const [section, setSection] = createSignal<SectionId>("general");
  const [hosts, setHosts] = createSignal<KnownHost[]>([]);
  const [hostsLoading, setHostsLoading] = createSignal(false);
  const [hostsError, setHostsError] = createSignal("");

  const refreshHosts = async () => {
    setHostsLoading(true);
    setHostsError("");
    try { setHosts(await window.vitals.listKnownHosts()); }
    catch { setHostsError("Failed to load known hosts."); }
    finally { setHostsLoading(false); }
  };
  createEffect(() => {
    if (!props.open) return;
    void refreshHosts();
  });
  const removeHost = async (key: string) => {
    try { await window.vitals.removeKnownHost(key); await refreshHosts(); }
    catch { pushToast("Failed to remove known host.", "danger"); }
  };

  return (
    <SharedSettingsDialog open={props.open} onClose={props.onClose} items={SECTIONS} active={section()}
      onSelect={(id) => setSection(id as SectionId)} searchEntries={SEARCH_ENTRIES}>
      <Show when={section() === "general"}>
        <SettingsSection title="Appearance">
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
                    <Button variant="danger" class="vitals-kill" aria-label={`Remove ${row.key}`} onClick={() => void removeHost(row.key)}>Remove</Button>
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
            <Button onClick={() => { props.onResetLayout(); pushToast("Card layout reset.", "success"); }}>Reset</Button>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="History">
          <SettingsRow label="Clear recent hosts" description="Saved servers are kept.">
            <Button onClick={() => { props.onClearRecents(); pushToast("Recent hosts cleared.", "success"); }}>Clear</Button>
          </SettingsRow>
        </SettingsSection>
      </Show>
    </SharedSettingsDialog>
  );
}
