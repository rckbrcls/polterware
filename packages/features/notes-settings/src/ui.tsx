import { Show, type JSX } from "solid-js";
import {
  PageError,
  PageLoading,
  PageOffline,
  SettingsRow,
  SettingsSection as SharedSettingsSection,
  StatusChip,
} from "@polterware/frontend-design-system";
import type { Honesty } from "./model";

/** Notes settings give each row its own card. */
export function SettingsSection(props: { title: string; description?: string; children: JSX.Element }) {
  return <SharedSettingsSection variant="stack" {...props} />;
}

export { SettingsRow };

export function HonestyLine(props: { state: Honesty; error?: string; idle?: string }) {
  const tone = () => props.state === "failed" || props.state === "unavailable" ? "danger" : props.state === "queued" ? "syncing" : "ok";
  const label = () => props.error || (props.state === "queued" ? "Saving…" : props.state === "failed" ? "Save failed" : props.state === "unavailable" ? "Unavailable" : props.idle ?? "Live");
  return <Show when={props.state !== "live" || Boolean(props.error)}><StatusChip tone={tone()} label={label()} /></Show>;
}

export function PanelFrame(props: { state: Honesty; error?: string; onRetry?: () => void; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-6">
      <Show when={props.state === "queued"}><PageLoading label="Loading settings…" /></Show>
      <Show when={props.state === "unavailable"}>
        <PageOffline title="Settings unavailable" message={props.error || "The core did not return settings."} onRetry={props.onRetry} />
      </Show>
      <Show when={props.state === "failed"}>
        <PageError title="Settings failed to load" message={props.error || "Settings failed to load."} onRetry={props.onRetry} />
      </Show>
      <Show when={props.state === "live"}>{props.children}</Show>
    </div>
  );
}
