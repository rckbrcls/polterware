import { Show, type JSX } from "solid-js";
import { PageError, PageLoading, PageOffline, StatusChip } from "@polterware/frontend-design-system";
import type { Honesty } from "./model";

export function SettingsSection(props: { title: string; description?: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <div class="px-1">
        <h3 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">{props.title}</h3>
        <Show when={props.description}>
          <p class="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{props.description}</p>
        </Show>
      </div>
      <div class="notes-settings-stack">{props.children}</div>
    </section>
  );
}

export function SettingsRow(props: { label: JSX.Element; description?: JSX.Element; for?: string; children?: JSX.Element }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-40 flex-1">
        <label for={props.for} class="block text-[12.5px] text-[var(--color-text-primary)]">{props.label}</label>
        <Show when={props.description}>
          <p class="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{props.description}</p>
        </Show>
      </div>
      <Show when={props.children}>
        <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">{props.children}</div>
      </Show>
    </div>
  );
}

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
