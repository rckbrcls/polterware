import { For, Show } from "solid-js";
import {
  Activity, FolderKanban, Inbox, LibraryBig, Network, Settings, StatusChip, type StatusTone,
} from "@polterware/frontend-design-system";

/** Illustrative data: a code-built picture of Polterware, not a live app. */
const inbox: Array<{ kind: string; tone: StatusTone; title: string; meta: string }> = [
  { kind: "Decision", tone: "syncing", title: "Keep the session token in the OS keychain?", meta: "Card · Token rotation · asked by codex" },
  { kind: "Drift", tone: "warn", title: "auth middleware no longer matches Verdict-012", meta: "src/middleware/auth.ts · 2 files changed" },
  { kind: "Verify", tone: "muted", title: "“Every write goes through the local core”", meta: "Fact · declared · no evidence yet" },
  { kind: "Drift", tone: "danger", title: "Cache layer contradicts “no shared state”", meta: "Conflict · Principle · 1 component" },
  { kind: "Decision", tone: "syncing", title: "Split the importer by source kind?", meta: "Card · Import pipeline · asked by claude" },
];

const stages: Array<{ name: string; cards: string[] }> = [
  { name: "Shape", cards: ["Offline-first sync", "Atlas zoom levels"] },
  { name: "Plan", cards: ["Token rotation"] },
  { name: "Build", cards: ["Import pipeline", "Drift on rename"] },
  { name: "Verify", cards: ["MCP write audit"] },
  { name: "Delivered", cards: ["Inbox counts"] },
];

const nav = [
  { label: "Inbox", icon: Inbox, count: 5 },
  { label: "Work", icon: FolderKanban },
  { label: "Atlas", icon: Network },
  { label: "Truth", icon: LibraryBig },
  { label: "Activity", icon: Activity },
];

export function PolterwareAppMockup(props: { view?: "inbox" | "board"; compact?: boolean }) {
  const view = () => props.view ?? "inbox";
  const active = () => (view() === "inbox" ? "Inbox" : "Work");
  return (
    <div class="mk-window" classList={{ "mk-compact": props.compact }} role="img" aria-label={`Polterware desktop app showing the ${view() === "inbox" ? "Inbox" : "Work board"}`}>
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">polterware · main</span></div>
      <div class="mk-body">
        <aside class="mk-sidebar">
          <For each={nav}>{(item) => (
            <span class="mk-nav" classList={{ "mk-nav-active": item.label === active() }}>
              <item.icon size={14} />{item.label}
              <Show when={item.count}><span class="mk-count">{item.count}</span></Show>
            </span>
          )}</For>
          <span class="mk-nav mk-nav-footer"><Settings size={14} />Settings</span>
        </aside>
        <section class="mk-main">
          <Show when={view() === "inbox"} fallback={
            <>
              <header class="mk-main-head"><strong>Board</strong><span>Work cards by stage</span></header>
              <div class="mk-board">
                <For each={compactStages(props.compact)}>{(stage) => (
                  <div class="mk-column">
                    <span class="mk-column-name">{stage.name}<em>{stage.cards.length}</em></span>
                    <For each={stage.cards}>{(card) => <span class="mk-card">{card}</span>}</For>
                  </div>
                )}</For>
              </div>
            </>
          }>
            <header class="mk-main-head"><strong>Inbox</strong><span>5 items need a person</span></header>
            <div class="mk-rows">
              <For each={props.compact ? inbox.slice(0, 4) : inbox}>{(item) => (
                <div class="mk-row">
                  <StatusChip tone={item.tone}>{item.kind}</StatusChip>
                  <div class="mk-row-copy"><strong>{item.title}</strong><span>{item.meta}</span></div>
                </div>
              )}</For>
            </div>
          </Show>
        </section>
      </div>
    </div>
  );
}

function compactStages(compact?: boolean) {
  return compact ? stages.slice(0, 3) : stages;
}
