import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  A11yDialog, Button, CalendarClock, Clock, FileText, Folder, Inbox, MapPin, Play, Plus, Search, Settings, StatusChip, StickyNote, X, Zap,
} from "@polterware/frontend-design-system";
import type { ShellBridge } from "./bridge";
import type { CommandDef, CommandSourceDef } from "./feature";
import { createQuickNote, parseQuickAdd } from "./quick-add";
import { findCommands } from "./route";
import { plainSnippet } from "./snippet";
import "./commander.css";

type CommanderHit = { id: string; label: string; snippet: string; run: () => void | Promise<void> };
type Icon = Component<{ size?: number; class?: string }>;

const routeIcons: Record<string, Icon> = {
  "/inbox": Inbox,
  "/today": CalendarClock,
  "/calendar": CalendarClock,
  "/spaces": Folder,
  "/map": MapPin,
  "/focus": Clock,
  "/search": Search,
};
const commandIcons: Record<string, Icon> = {
  "quick-add": Plus,
  settings: Settings,
  "notes.create": FileText,
  "focus.start": Play,
  "search.open": Search,
  "calendar.open": CalendarClock,
  "map.open": MapPin,
};

function iconFor(command: CommandDef): Icon {
  if (command.id.startsWith("navigate:")) return routeIcons[command.id.slice("navigate:".length)] ?? Folder;
  return commandIcons[command.id] ?? Zap;
}

export function Commander(props: {
  open: boolean; mode: "commands" | "quick-add" | "search"; bridge?: ShellBridge;
  commands: CommandDef[]; commandSources?: CommandSourceDef[]; live: boolean; onClose: () => void; onNote: (id: string) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [hits, setHits] = createSignal<CommanderHit[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [searched, setSearched] = createSignal(false);
  let generation = 0;
  let input: HTMLInputElement | undefined;
  let dialogBody: HTMLDivElement | undefined;
  const commands = createMemo(() => findCommands(props.commands, query()));
  const navigation = createMemo(() => commands().filter(command => command.id.startsWith("navigate:")));
  const actions = createMemo(() => commands().filter(command => !command.id.startsWith("navigate:")));
  const sources = () => props.commandSources ?? [];
  const preview = createMemo(() => {
    try { return { parsed: parseQuickAdd(query()), error: "" }; }
    catch (error) { return { parsed: undefined, error: error instanceof Error ? error.message : String(error) }; }
  });
  createEffect(() => {
    if (props.open) { props.mode; setQuery(""); setError(""); }
  });
  createEffect(() => {
    const text = query().trim();
    const current = ++generation;
    const registered = sources();
    setHits([]); setNotice(""); setSearching(false); setSearched(false);
    if (!props.open || props.mode === "quick-add" || !text) return;
    const timer = setTimeout(() => {
      setSearching(true);
      const finish = (next: CommanderHit[], status = "") => {
        if (generation !== current) return;
        setHits(next); setNotice(status); setSearched(true); setSearching(false);
      };
      const fail = (caught: unknown) => {
        if (generation !== current) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setSearching(false);
      };
      if (registered.length) {
        void Promise.all(registered.map(source => source.search(text))).then(pages => {
          finish(pages.flatMap(page => (page.hits ?? []).map(hit => ({
            id: hit.id, label: hit.label, snippet: plainSnippet(hit.snippet), run: hit.run,
          }))));
        }).catch(fail);
        return;
      }
      if (!props.live || !props.bridge) { setSearching(false); return; }
      void props.bridge.search.search({ query: text, limit: 20 }).then(result => {
        finish((result.hits ?? []).map(hit => ({
          id: hit.noteId ?? hit.title ?? text,
          label: hit.title ?? "Note",
          snippet: plainSnippet(hit.snippet),
          run: () => { if (hit.noteId) { props.onClose(); props.onNote(hit.noteId); } },
        })), result.notice ?? "");
      }).catch(fail);
    }, 180);
    onCleanup(() => { clearTimeout(timer); if (generation === current) generation++; });
  });
  async function execute(command: CommandDef) {
    if (busy()) return;
    setBusy(true); setError("");
    try { const mode = props.mode; await command.run(); if (props.mode === mode) props.onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function activate(hit: CommanderHit) {
    if (busy()) return;
    setBusy(true); setError("");
    try { await hit.run(); props.onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function add() {
    if (busy() || !props.live || !props.bridge) return;
    setBusy(true); setError("");
    try {
      const note = await createQuickNote(props.bridge, parseQuickAdd(query()));
      props.onClose(); props.onNote(note.id!);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const buttons = Array.from(dialogBody?.querySelectorAll<HTMLButtonElement>('button[data-command]:not(:disabled)') ?? []);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? index + 1 : index < 0 ? buttons.length - 1 : index - 1;
      if (next < 0) input?.focus(); else buttons[next % buttons.length]?.focus();
    } else if (event.key === "Enter" && event.target === input && props.mode !== "quick-add") {
      event.preventDefault(); buttons[0]?.click();
    }
  }
  return (
    <A11yDialog open={props.open} title="Commander" chrome="flush" showCloseButton={false} class="notes-commander" bodyClass="notes-commander__body" onClose={props.onClose}>
      <div ref={dialogBody} class="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <div class="notes-commander__search">
          <Search size={16} class="notes-commander__icon" />
          <input
            id="notes-command-input"
            ref={input}
            class="notes-commander__input"
            type="text"
            role="searchbox"
            placeholder={props.mode === "quick-add" ? "Buy milk tomorrow 9am #errands @Home" : "Search notes or commands…"}
            aria-label={props.mode === "quick-add" ? "Note" : "Search or command"}
            value={query()}
            autofocus
            autocomplete="off"
            spellcheck={false}
            disabled={busy()}
            onInput={event => { setQuery(event.currentTarget.value); setError(""); }}
          />
          <button type="button" class="notes-commander__close" aria-label="Close" onClick={() => props.onClose()}>
            <X size={16} />
          </button>
        </div>
        <div class="notes-commander__results">
          <Show when={error()}><p role="alert" class="notes-commander__status notes-commander__status--danger">{error()}</p></Show>
          <Show when={props.mode === "quick-add"}>
            <form class="flex flex-col gap-3 px-2" onSubmit={event => { event.preventDefault(); void add(); }}>
              <p aria-live="polite">{preview().parsed ? `Title: ${preview().parsed!.title}${preview().parsed!.dueAt ? ` · Due: ${new Date(preview().parsed!.dueAt!).toLocaleString()}` : ""}` : preview().error}</p>
              <Show when={!props.live}><StatusChip tone="down" label="Core offline — creation unavailable" /></Show>
              <Button type="submit" disabled={busy() || !props.live || !preview().parsed}>{busy() ? "Creating…" : "Create note"}</Button>
            </form>
          </Show>
          <Show when={props.mode !== "quick-add"}>
            <Show when={navigation().length}>
              <div class="notes-commander__group" role="group" aria-label="Navigation">
                <p class="notes-commander__heading">Navigation</p>
                <For each={navigation()}>{command => <CommandRow command={command} disabled={busy()} onClick={() => void execute(command)} />}</For>
              </div>
            </Show>
            <Show when={actions().length}>
              <div class="notes-commander__group" role="group" aria-label="Actions">
                <p class="notes-commander__heading">Actions</p>
                <For each={actions()}>{command => <CommandRow command={command} disabled={busy()} onClick={() => void execute(command)} />}</For>
              </div>
            </Show>
            <Show when={hits().length}>
              <div class="notes-commander__group" role="group" aria-label="Notes">
                <p class="notes-commander__heading">Notes</p>
                <For each={hits()}>{hit => (
                  <button type="button" class="notes-commander__row" data-command disabled={busy()} onClick={() => void activate(hit)}>
                    <StickyNote size={16} class="notes-commander__icon" />
                    <span class="flex min-w-0 flex-1 flex-col text-start"><span class="truncate">{hit.label}</span><Show when={hit.snippet}><span class="line-clamp-2 text-xs text-[var(--color-text-muted)]">{hit.snippet}</span></Show></span>
                  </button>
                )}</For>
              </div>
            </Show>
            <Show when={searching()}><p class="notes-commander__status" role="status">Searching notes…</p></Show>
            <Show when={!commands().length && !hits().length && searched() && !searching()}><p class="notes-commander__status" role="status">No matches</p></Show>
            <Show when={!props.live}><div class="px-2 pt-2"><StatusChip tone="down" label="Core offline — note search unavailable" /></div></Show>
            <Show when={notice()}><p class="notes-commander__status" role="status">{notice()}</p></Show>
          </Show>
        </div>
      </div>
    </A11yDialog>
  );
}

function CommandRow(props: { command: CommandDef; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" class="notes-commander__row" data-command disabled={props.disabled} onClick={() => props.onClick()}>
      <Dynamic component={iconFor(props.command)} size={16} class="notes-commander__icon" />
      <span class="min-w-0 flex-1 truncate">{props.command.label}</span>
    </button>
  );
}
