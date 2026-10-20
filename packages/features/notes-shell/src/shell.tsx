import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, For, on, onCleanup, onMount, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  A11yDialog, ResizableSidebar, Activity, Badge, ChevronLeft, ChevronRight, Bell, Bot, Button, CalendarClock, Cog, Cpu, Database, Hammer, Input, Layers, Clock, DesignSystemProvider,
  Dialog, IconTile, Folder, HelpCircle, Inbox, MapPin, MenuItem, MenuList, PageEmpty, PageError,
  PageHeader, PageLoading, PageOffline, Popover, Search, Settings, StatusChip, X, ToastRegion, TreeView, pushToast, type TreeViewNode,
} from "@polterware/frontend-design-system";
import { MainFrame, MainSurfaceFrame, ShellRoot, SidebarItem } from "@polterware/frontend-shell";
import type { MessageShape } from "@bufbuild/protobuf";
import type { SpaceSchema } from "@polterware/notes-contracts";
import type { ShellBridge } from "./bridge";
import type { NotesFeature } from "./feature";
import { ShellContext, type NoteDetailRenderer } from "./context";
import { NoteDetailHost } from "./note-detail-host";
import { Commander } from "./commander";
import { createCoreConnection, independentQueryKey, reminderLabel } from "./connection";
import { DEFAULT_PATH, deepLinkPath, normalizePath, pushRoute, resolveRoute, SHELL_ROUTES, sidebarItems, type RouteHistory } from "./route";
import { isCollectionTarget, isEditing, noteShortcut, shellShortcut, type NoteShortcut } from "./shortcuts";
import "./shell.css";

const icons: Record<string, Component<{ size?: number }>> = { CalendarClock, Clock, Folder, Inbox, MapPin, Search, Settings };
const titlebarIconClass = "control-field control-field-sm inline-flex w-[var(--control-height-sm)] shrink-0 cursor-pointer items-center justify-center !rounded-full !p-0 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)] focus-visible:outline-none";
export function spaceTree(spaces: MessageShape<typeof SpaceSchema>[], parentId = "", ancestors = new Set<string>()): TreeViewNode[] {
  return spaces.filter(space => (space.parentId ?? "") === parentId && space.id && !ancestors.has(space.id)).map(space => ({
    id: space.id!, label: space.name ?? "Untitled Space", children: spaceTree(spaces, space.id!, new Set([...ancestors, space.id!])),
  }));
}

/** Placeholder title for a note created from the page; the core requires a non-empty title. */
const FRESH_TITLE = "Untitled";

export function NotesShell(props: { features: readonly NotesFeature[]; bridge?: ShellBridge; onReady?: () => void }) {
  const core = createCoreConnection(props.bridge);
  createEffect(() => { if (core.state() !== "loading") props.onReady?.(); });
  const [history, setHistory] = createSignal<RouteHistory>({ entries: [DEFAULT_PATH], index: 0 });
  const path = () => history().entries[history().index] ?? DEFAULT_PATH;
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [settingsPanel, setSettingsPanel] = createSignal("");
  const [palette, setPalette] = createSignal<"commands" | "quick-add" | "search" | null>(null);
  const [selectedNoteId, setSelectedNoteId] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal(false);
  const [propertiesOpen, setPropertiesOpenSignal] = createSignal((() => {
    try { return localStorage.getItem("pwnotes.notes.properties.open") !== "false"; } catch { return true; }
  })());
  const setPropertiesOpen = (open: boolean) => {
    setPropertiesOpenSignal(open);
    try { localStorage.setItem("pwnotes.notes.properties.open", String(open)); } catch { /* Session-only. */ }
  };
  const [detailRenderer, setDetailRenderer] = createSignal<NoteDetailRenderer>();
  const [onboardingOpen, setOnboardingOpen] = createSignal((() => {
    try { return localStorage.getItem("pwnotes.shell.onboarding") !== "complete"; }
    catch { return true; }
  })());
  const [onboardingStep, setOnboardingStep] = createSignal(0);
  const [authorizationBusy, setAuthorizationBusy] = createSignal(false);
  const [authorizationError, setAuthorizationError] = createSignal<string | null>(null);
  const [deepLink, setDeepLink] = createSignal<URL | null>(null);
  let collectionShortcuts: ((action: NoteShortcut) => void) | undefined;
  const [helpMenuOpen, setHelpMenuOpen] = createSignal(false);
  let helpAnchor: HTMLButtonElement | undefined;
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [dataRevision, setDataRevision] = createSignal(0);
  const [expandedSpaces, setExpandedSpaces] = createSignal<string[]>([]);
  let main: HTMLElement | undefined;
  let restoredFocus: HTMLElement | undefined;
  const route = createMemo(() => resolveRoute(props.features, path()));
  const hasFeatureRoute = createMemo(() => props.features.some(feature => feature.id !== "shell" && feature.routes.some(item => item === route()?.route)));
  const items = createMemo(() => sidebarItems(props.features));
  const settingsPanels = createMemo(() => props.features.flatMap(feature => feature.settingsPanels ?? []));
  const settingsGroups = createMemo(() => [...new Set(settingsPanels().map(panel => panel.group))]);
  const [settingsQuery, setSettingsQuery] = createSignal("");
  const settingsSearching = () => settingsQuery().trim().length > 0;
  const settingsResults = createMemo(() => {
    const terms = settingsQuery().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return settingsPanels().filter(panel => terms.every(term => `${panel.label} ${panel.group} ${panel.id}`.toLowerCase().includes(term)));
  });
  const settingsIcons: Record<string, Component<{ size?: number; "aria-hidden"?: boolean }>> = {
    general: Cog, notifications: Bell, focus: Clock, calendar: CalendarClock, "settings-map": MapPin, "map-tiles": MapPin,
    search: Search, "agents-access": Bot, "agents-activity": Activity, data: Database, shortcuts: Layers, advanced: Hammer,
  };
  const activeSettings = createMemo(() => settingsPanels().find(panel => panel.id === settingsPanel()) ?? settingsPanels()[0]);
  const detailSections = createMemo(() => props.features.flatMap(feature => feature.detailSections ?? []).sort((a, b) => a.order - b.order));
  const noteDetail = createMemo(() => props.features.find(feature => feature.noteDetail)?.noteDetail);
  const noteAttachments = createMemo(() => props.features.find(feature => feature.noteAttachments)?.noteAttachments);
  const noteCollection = createMemo(() => props.features.find(feature => feature.noteCollection)?.noteCollection);
  const sidebarTree = createMemo(() => props.features.find(feature => feature.sidebarTree)?.sidebarTree);
  const canRequestNotifications = () => typeof props.bridge?.app.requestNotificationAuthorization === "function";
  const notificationGranted = () => ["authorized", "provisional", "ephemeral"].includes(core.status()?.permission ?? "");
  const queryKey = () => independentQueryKey(core.state(), dataRevision(), props.bridge);
  const [spaces] = createResource(() => sidebarTree() ? false : queryKey(), async () => (await props.bridge!.spaces.list({})).spaces ?? []);
  const [inboxCount] = createResource(queryKey, async () => (await props.bridge!.notes.list({ inboxOnly: true, status: "active", limit: 1 })).total);
  const tree = createMemo(() => spaceTree(spaces.error ? [] : spaces() ?? []));
  const params = createMemo(() => route()?.params ?? {});
  const searchParams = createMemo(() => new URLSearchParams(path().split("?")[1] ?? ""));
  const [note] = createResource(() => core.state() === "live" && selectedNoteId() ? `${selectedNoteId()}:${dataRevision()}` : false,
    async () => (await props.bridge!.notes.get({ id: selectedNoteId()!, include: { content: true } })).note);
  /** The note whose page is open; section contributions (schedule, place, attachments, focus) read it. */
  const openNoteId = createMemo(() => {
    const match = /^\/note\/([^/?]+)/.exec(normalizePath(path()));
    return match ? decodeURIComponent(match[1]!) : null;
  });
  const detailRoute = createMemo(() => selectedNoteId() ? resolveRoute(props.features, `/note/${selectedNoteId()}`) : undefined);
  function closeDetail() {
    setSelectedNoteId(null); setExpanded(false);
    if (restoredFocus?.isConnected) restoredFocus.focus();
  }
  function openNote(id: string) { navigate(`/note/${encodeURIComponent(id)}`); }
  /** Notes created through `newNote` that nobody has written to yet; discarded when the page is left. */
  const fresh = new Set<string>();
  async function newNote(options: { spaceId?: string } = {}) {
    if (core.state() !== "live" || !props.bridge) return;
    setPalette(null);
    try {
      const { note } = await props.bridge.notes.create({ title: FRESH_TITLE, ...(options.spaceId ? { spaceId: options.spaceId } : {}) });
      if (!note?.id) return;
      fresh.add(note.id);
      openNote(note.id);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>("[data-note-title]");
        input?.focus(); input?.select();
      }, 50);
    } catch { /* The notes list surfaces core errors; nothing to open. */ }
  }
  async function discardIfUntouched(id: string) {
    if (!fresh.delete(id) || !props.bridge) return;
    try {
      const { note } = await props.bridge.notes.get({ id, include: { content: true, checklist: true } });
      if (note?.title === FRESH_TITLE && !note.content && !note.checklist?.length) await props.bridge.notes.delete({ id, expectedRev: String(note.rev ?? 0) });
    } catch { /* Keep the note when it cannot be verified as empty. */ }
  }
  /** Explicit cancel of a note made by `newNote`: leave the page, then delete it whatever was typed. */
  function isFreshNote(id: string) { return fresh.has(id); }
  async function cancelNewNote(id: string) {
    if (!fresh.delete(id) || !props.bridge) return;
    if (history().index > 0) moveHistory(-1); else navigate(DEFAULT_PATH);
    try {
      const { note } = await props.bridge.notes.get({ id, include: { content: true } });
      if (note) await props.bridge.notes.delete({ id, expectedRev: String(note.rev ?? 0) });
    } catch { /* The note stays listed when it cannot be deleted. */ }
  }
  createEffect(on(openNoteId, (_current, previous) => { if (previous) void discardIfUntouched(previous); }, { defer: true }));
  function navigate(raw: string) {
    const normalized = normalizePath(raw);
    if (normalized === "/settings") { setSettingsOpen(true); return; }
    closeDetail();
    const next = resolveRoute(props.features, normalized) || SHELL_ROUTES.some(route => route.path === normalized) || /^\/space\/[^/]+$/.test(normalized) ? raw : DEFAULT_PATH;
    // Keep query parameters for feature search/calendar state.
    setHistory(current => pushRoute(current, next));
    queueMicrotask(() => main?.focus());
  }
  function moveHistory(delta: number) {
    const index = history().index + delta;
    if (index < 0 || index >= history().entries.length) return;
    closeDetail(); setHistory(current => ({ ...current, index }));
    queueMicrotask(() => main?.focus());
  }
  function finishOnboarding() {
    try { localStorage.setItem("pwnotes.shell.onboarding", "complete"); } catch { /* Session-only when storage is unavailable. */ }
    setOnboardingOpen(false);
  }
  async function enableNotifications() {
    if (!canRequestNotifications() || authorizationBusy()) return;
    setAuthorizationBusy(true);
    setAuthorizationError(null);
    try {
      await props.bridge!.app.requestNotificationAuthorization();
      await core.refresh();
    } catch (error) {
      setAuthorizationError(error instanceof Error ? error.message : "Notification authorization failed.");
    } finally { setAuthorizationBusy(false); }
  }
  const commands = createMemo(() => [
    ...SHELL_ROUTES.map(item => ({ id: `navigate:${item.path}`, label: `Go to ${item.title}`, keywords: ["navigate"], run: () => navigate(item.path) })),
    ...props.features.flatMap(feature => feature.routes).filter(item => !SHELL_ROUTES.some(defaultRoute => defaultRoute.path === item.path) && !item.path.includes(":"))
      .map(item => ({ id: `navigate:${item.path}`, label: `Go to ${item.title}`, run: () => navigate(item.path) })),
    { id: "quick-add", label: "New note", keywords: ["add", "create"], run: () => { void newNote(); } },
    { id: "settings", label: "Open Settings", run: () => setSettingsOpen(true) },
    ...props.features.flatMap(feature => feature.commands ?? []),
  ]);
  const commandSources = createMemo(() => props.features.flatMap(feature => feature.commandSources ?? []));
  const context = {
    features: props.features, path, params, searchParams, navigate, selectedNoteId: openNoteId, openNote, newNote, isFreshNote, cancelNewNote, propertiesOpen, setPropertiesOpen, expanded, setExpanded, noteAttachments, closeDetail, detailSections, settingsPanels, deepLink,
    registerCollectionShortcuts: (handler: (action: NoteShortcut) => void) => {
      collectionShortcuts = handler;
      return () => { if (collectionShortcuts === handler) collectionShortcuts = undefined; };
    },
    registerNoteDetail: (component: NoteDetailRenderer) => {
      setDetailRenderer(() => component);
      return () => { if (detailRenderer() === component) setDetailRenderer(undefined); };
    },
  };
  async function routeLink(link: { url: string; route: string }) {
    let url: URL;
    try { url = new URL(link.url); } catch { return; }
    if (url.protocol !== "pwnotes:") return;
    setDeepLink(url);
    let handled = false;
    for (const feature of props.features) {
      if (feature.onDeepLink?.(url)) { handled = true; break; }
    }
    if (url.hostname === "note" && url.searchParams.get("action") === "focus") {
      const id = url.pathname.replace(/^\//, "");
      navigate("/focus");
      if (id) openNote(id);
      return;
    }
    if (handled) return;
    const target = deepLinkPath(link.url);
    if (target) navigate(`${target}${url.search}`);
  }
  onMount(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("pwnotes.shell.spaces.expanded") ?? "[]");
      if (Array.isArray(saved) && saved.every(value => typeof value === "string")) setExpandedSpaces(saved);
    } catch { setOnboardingOpen(true); }
    void core.refresh();
    const timer = setInterval(() => void core.refresh(), 5000);
    const offChange = props.bridge?.onChange(() => { setDataRevision(value => value + 1); void core.refresh(); });
    const offLink = props.bridge?.app.onDeepLink(link => { void routeLink(link); });
    void props.bridge?.app.getDeepLink().then(link => { if (link) void routeLink(link); }).catch(() => {});
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const shortcut = shellShortcut(event, isEditing(event.target));
      if (settingsOpen() || onboardingOpen() || helpOpen()) return;
      if (!shortcut) {
        if (palette() !== null) return;
        const action = noteShortcut(event, isEditing(event.target));
        if (action && collectionShortcuts && isCollectionTarget(event.target)) { event.preventDefault(); collectionShortcuts(action); }
        return;
      }
      if (palette() !== null && !["commander", "quick-add"].includes(shortcut)) return;
      event.preventDefault();
      switch (shortcut) {
        case "commander": setPalette(current => current === "commands" ? null : "commands"); break;
        case "quick-add": void newNote(); break;
        case "settings": setSettingsOpen(true); break;
        case "back": moveHistory(-1); break;
        case "forward": moveHistory(1); break;
        case "close-detail": closeDetail(); break;
        case "search": {
          const search = main?.querySelector<HTMLInputElement>('input[type="search"], input[data-list-search]');
          if (search) search.focus(); else setPalette("search");
          break;
        }
        default: {
          const target = ["/inbox", "/today", "/calendar", "/map", "/focus"][Number(shortcut.slice(-1)) - 1];
          if (target) navigate(target);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => { clearInterval(timer); offChange?.(); offLink?.(); document.removeEventListener("keydown", onKey); });
  });
  createEffect(() => { if (core.state() === "offline") closeDetail(); });
  let reminderToast = "";
  createEffect(() => {
    if (onboardingOpen() || core.state() !== "live") return;
    const message = reminderLabel(core.status());
    const problem = message === "Reminders unavailable" || message.startsWith("Reminders: permission") || message === "Reminders: refresh pending";
    if (!problem) { reminderToast = ""; return; }
    if (message === reminderToast) return;
    reminderToast = message;
    pushToast(message);
  });
  const title = () => route()?.route.title ?? SHELL_ROUTES.find(item => item.path === normalizePath(path()))?.title ?? "Space";
  const boundary = (error: Error, reset: () => void) => <PageError title="This feature failed" message={error.message} onRetry={reset} />;
  return <ShellContext.Provider value={context}>
    <DesignSystemProvider storagePrefix="pwnotes" expandDetail={() => { if (selectedNoteId()) setExpanded(true); }}
      matchesShortcut={(id, event) => id === "shell.toggle_detail" && shellShortcut(event, false) === "close-detail"}
      createShortcutLabel={id => () => id === "shell.toggle_detail" ? "⌘J" : ""}>
      <ShellRoot glass={false} class="notes-shell">
        <div class="notes-workspace">
          <ResizableSidebar class="pw-shell-sidebar" defaultWidth={232} minWidth={184} maxWidth={320} collapseThreshold={112}
            storageKey="pwnotes.shell.sidebar.sizes" ariaLabel="Sidebar" sidebar={<div class="notes-sidebar">
            <div class="notes-history-nav">
              <button type="button" aria-label="Go back" disabled={history().index <= 0} onClick={() => moveHistory(-1)}><ChevronLeft size={14} /></button>
              <button type="button" aria-label="Go forward" disabled={history().index >= history().entries.length - 1} onClick={() => moveHistory(1)}><ChevronRight size={14} /></button>
            </div>
            <div class="pw-sidebar-group">
              <SidebarItem aria-label="Open Commander" icon={<Search size={14} />} onClick={() => setPalette("commands")}>Search</SidebarItem>
            </div>
            <nav aria-label="Main navigation" class="pw-sidebar-group">
              <For each={items()}>{item => {
                const Icon = icons[item.icon ?? ""] ?? Folder;
                const count = () => item.path === "/inbox" ? (!inboxCount.error ? inboxCount() : undefined) : item.badge;
                return <SidebarItem aria-label={item.label} active={normalizePath(path()) === normalizePath(item.path)} icon={<Icon size={14} />}
                  onClick={() => navigate(item.path)}
                  trailing={<Show when={count() !== undefined && count() !== 0}><Badge class="pw-sidebar-item-count" tone="muted" aria-label={item.path === "/inbox" ? "Active Inbox notes" : undefined}>{count()}</Badge></Show>}>
                  {item.label}
                </SidebarItem>;
              }}</For>
            </nav>
            <Show when={sidebarTree()} fallback={
              <Show when={core.state() === "live"}>
                <Show when={!spaces.error} fallback={<p role="status">Spaces unavailable</p>}>
                  <Show when={tree().length}><TreeView fluidHover label="Spaces" nodes={tree()} expandedValue={expandedSpaces()} selectedValue={params().id ? [params().id!] : []}
                    onExpandedChange={details => { setExpandedSpaces(details.expandedValue); try { localStorage.setItem("pwnotes.shell.spaces.expanded", JSON.stringify(details.expandedValue)); } catch { /* Session-only. */ } }}
                    onSelectionChange={details => { const id = details.selectedValue[0]; if (id) navigate(`/space/${encodeURIComponent(id)}`); }} /></Show>
                </Show>
              </Show>
            }>{treeDef => <Dynamic component={treeDef().component} />}</Show>
            <div class="notes-sidebar-footer">
              <SidebarItem footer icon={<Settings size={14} />} onClick={() => setSettingsOpen(true)}>Settings</SidebarItem>
              <button type="button" ref={helpAnchor} class={titlebarIconClass} aria-label="Help" aria-expanded={helpMenuOpen()} aria-haspopup="dialog" onClick={() => setHelpMenuOpen(open => !open)}><HelpCircle size={14} /></button>
              <Popover open={helpMenuOpen()} onClose={() => setHelpMenuOpen(false)} title="Help" anchorRef={() => helpAnchor} placement="top-end" width={240}>
                <MenuList>
                  <MenuItem onClick={() => { setHelpMenuOpen(false); setHelpOpen(true); }}>Keyboard shortcuts</MenuItem>
                  <MenuItem onClick={() => { setHelpMenuOpen(false); setOnboardingStep(0); setOnboardingOpen(true); }}>Show onboarding</MenuItem>
                </MenuList>
              </Popover>
            </div>
          </div>}>
          <MainFrame as="main" glass={false} class="notes-main" ref={main} tabIndex={-1} aria-label={title()}>
            <MainSurfaceFrame as="div">
              <Show when={core.state() !== "loading"} fallback={<PageLoading label="Starting Polterware Notes…" />}>
                <Show when={core.state() === "live"} fallback={<PageOffline title="Core offline" message="Polterware Notes cannot reach the local core. Retry to reconnect." onRetry={() => void core.refresh()} />}>
                  <Show keyed when={path()}>{(_path) => <ErrorBoundary fallback={boundary}>
                    <Show when={!hasFeatureRoute() && /^\/space\/[^/]+$/.test(normalizePath(path())) && noteCollection()} fallback={
                      <Show when={route()} fallback={<><PageHeader title={title()} subtitle={<StatusChip tone="muted" label="Unavailable" />} /><PageEmpty title={`${title()} is unavailable`} description="This feature has not registered a route yet." /></>}>
                        {resolved => <Dynamic component={resolved().route.component} />}
                      </Show>
                    }>{collection => <NoteDetailHost><Dynamic component={collection()} spaceId={decodeURIComponent(normalizePath(path()).split("/")[2] ?? "")} /></NoteDetailHost>}</Show>
                  </ErrorBoundary>}</Show>
                </Show>
              </Show>
            </MainSurfaceFrame>
          </MainFrame>
          </ResizableSidebar>
        </div>
      </ShellRoot>
      <ToastRegion />
      <Commander open={palette() !== null} mode={palette() ?? "commands"} bridge={props.bridge} commands={commands()} commandSources={commandSources()} live={core.state() === "live"} onClose={() => setPalette(null)} onNote={openNote} />
      <A11yDialog open={settingsOpen()} title="Settings" size="xl" chrome="flush" bodyClass="p-0" showCloseButton={false} autoFocusField={false}
        class="!rounded-[var(--radius-dialog)] !bg-[var(--color-app-background)]" onClose={() => setSettingsOpen(false)}>
        <div class="notes-settings-layout">
          <nav aria-label="Settings panels" class="flex flex-col gap-1 p-2">
            <Input size="sm" type="search" class="mb-2 !rounded-full" placeholder="Search settings" aria-label="Search settings"
              autocomplete="off" spellcheck={false} value={settingsQuery()}
              onInput={event => setSettingsQuery(event.currentTarget.value)}
              onKeyDown={event => { if (event.key === "Escape" && settingsQuery()) { event.preventDefault(); event.stopPropagation(); setSettingsQuery(""); } }} />
            <For each={settingsGroups()}>{(group, index) => <>
              <p class="m-0 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
                classList={{ "mt-4": index() > 0, "mt-1": index() === 0 }}>{group}</p>
              <For each={settingsPanels().filter(panel => panel.group === group)}>{panel => {
                const active = () => !settingsSearching() && panel.id === activeSettings()?.id;
                const Icon = settingsIcons[panel.id] ?? Cog;
                return <button type="button" aria-current={active() ? "page" : undefined}
                  class="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-0 px-2.5 text-left text-[12.5px]"
                  classList={{
                    "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]": active(),
                    "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]": !active(),
                  }}
                  onClick={() => { setSettingsQuery(""); setSettingsPanel(panel.id); }}><Icon size={14} aria-hidden />{panel.label}</button>;
              }}</For>
            </>}</For>
          </nav>
          <section aria-label="Selected settings panel" class="surface-panel relative">
            <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}
              class="absolute top-5 right-5 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
              <X size={16} aria-hidden />
            </button>
            <div class="notes-settings-content text-[13px] text-[var(--color-text-secondary)]">
              <h2 class="m-0 mb-6 pr-10 text-[16px] font-semibold text-[var(--color-text-primary)]">{settingsSearching() ? "Search results" : activeSettings()?.label}</h2>
              <Show when={settingsSearching()}>
                <Show when={settingsResults().length > 0} fallback={<p class="m-0 px-1 text-[12.5px] text-[var(--color-text-muted)]">No settings match “{settingsQuery().trim()}”.</p>}>
                  <ul class="m-0 flex list-none flex-col gap-1 p-0">
                    <For each={settingsResults()}>{panel => <li>
                      <button type="button" onClick={() => { setSettingsQuery(""); setSettingsPanel(panel.id); }}
                        class="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius-control)] border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--color-surface-hover)]">
                        <span class="text-[12.5px] text-[var(--color-text-primary)]">{panel.label}</span>
                        <span class="text-[11.5px] text-[var(--color-text-muted)]">{panel.group}</span>
                      </button></li>}</For>
                  </ul>
                </Show>
              </Show>
              <Show when={!settingsSearching()}><Show when={activeSettings()} fallback={<PageEmpty title="Settings unavailable" description="Settings panels have not been registered yet." />}>
                {panel => <Show keyed when={panel().id}>{(_id) => <ErrorBoundary fallback={boundary}><Dynamic component={panel().component} /></ErrorBoundary>}</Show>}
              </Show></Show>
            </div>
          </section>
        </div>
      </A11yDialog>
      <Dialog open={onboardingOpen()} title={["Welcome to Polterware Notes", "Notifications", "Connect an agent"][onboardingStep()]!} onClose={finishOnboarding}
        footer={<><Button variant="ghost" onClick={finishOnboarding}>Skip onboarding</Button><Show when={onboardingStep() > 0}><Button onClick={() => setOnboardingStep(step => step - 1)}>Back</Button></Show>
          <Button onClick={() => onboardingStep() === 2 ? finishOnboarding() : setOnboardingStep(step => step + 1)}>{onboardingStep() === 2 ? "Get started" : "Continue"}</Button></>}>
        <Show when={onboardingStep() === 0}><IconTile><Inbox size={24} /></IconTile><p>Keep notes, plans, and Spaces together on your Mac. Your data stays in the local core.</p></Show>
        <Show when={onboardingStep() === 1}><p>macOS delivers armed reminders even after Polterware Notes closes. Reminders are refreshed when Polterware Notes runs.</p>
          <StatusChip label={reminderLabel(core.status())} />
          <Show when={canRequestNotifications()} fallback={<p>Notification authorization is unavailable in this build. No reminder is armed by this step.</p>}>
            <Button disabled={authorizationBusy() || notificationGranted()} onClick={() => void enableNotifications()}>Enable notifications</Button>
            <Show when={authorizationError()}><p role="alert">{authorizationError()}</p></Show>
            <p>Enabling notifications does not arm a reminder. Armed reminders appear only after a live schedule.</p>
          </Show>
        </Show>
        <Show when={onboardingStep() === 2}><p>Connecting an AI coding agent is optional. Configure local MCP access in Settings → Agents → Access.</p>
          <Button onClick={() => { finishOnboarding(); const agents = settingsPanels().find(panel => panel.group.toLowerCase() === "agents"); if (agents) setSettingsPanel(agents.id); setSettingsOpen(true); }}>Open agent settings</Button>
        </Show>
      </Dialog>
      <Dialog open={helpOpen()} title="Polterware Notes shortcuts" onClose={() => setHelpOpen(false)}>
        <p>⌘K Commander · ⌘N New note · ⌘, Settings · ⌘[ Back · ⌘] Forward · ⌘J Close details</p>
        <p>⌘1 Inbox · ⌘2 Today · ⌘3 Calendar · ⌘4 Map · ⌘5 Focus · / Search</p>
        <p>In note lists: Enter opens the selection, Space toggles completion, E edits the title, P pins, and ⌘⌫ asks to delete.</p>
      </Dialog>
    </DesignSystemProvider>
  </ShellContext.Provider>;
}
