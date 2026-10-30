import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  Index,
  on,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import {
  Activity,
  Terminal,
  Box,
  Briefcase06Icon,
  centerItemInView,
  ChartRelationshipIcon,
  createFluidHover,
  FluidHoverHighlight,
  Gauge,
  History,
  IconTile,
  Inbox,
  Keyboard,
  Layers,
  ListOrdered,
  Play,
  Plug,
  Plus,
  Pencil,
  PropertyPills,
  Route,
  Search,
  Settings,
  ShieldCheck,
  type ComposerProperty,
  type FluidHover,
  type IconTileTone,
} from "@polterware/frontend-design-system";
import {
  capabilityEnabled,
  type PlatformContext,
} from "@polterware/frontend-platform";
import { SHORTCUT_SEQUENCES, formatSequence, formatShortcut } from "@polterware/frontend-state";
import { DEFAULT_PALETTE_ITEMS, type PaletteItem } from "./palette-items";
import "./commander.css";

const PALETTE_TILES: Record<string, { tone: IconTileTone; icon: () => JSX.Element }> = {
  "nav.inbox": { tone: "knowledge", icon: () => <Inbox size={12} /> },
  "nav.canvas": { tone: "neutral", icon: () => <Pencil size={12} /> },
  "nav.structure": { tone: "architecture", icon: () => <ChartRelationshipIcon size={12} /> },
  "nav.milestones": { tone: "execution", icon: () => <Briefcase06Icon size={12} /> },
  "nav.truth": { tone: "knowledge", icon: () => <Layers size={12} /> },
  "nav.dispatch": { tone: "execution", icon: () => <Route size={12} /> },
  "nav.dispatch-routing": { tone: "execution", icon: () => <ListOrdered size={12} /> },
  "nav.dispatch-usage": { tone: "execution", icon: () => <Gauge size={12} /> },
  "nav.activity": { tone: "neutral", icon: () => <History size={12} /> },
  "nav.platforms": { tone: "integration", icon: () => <ShieldCheck size={12} /> },
  "nav.cli-reference": { tone: "identity", icon: () => <Terminal size={12} /> },
  "nav.settings": { tone: "neutral", icon: () => <Settings size={12} /> },
  "nav.app-settings": { tone: "neutral", icon: () => <Settings size={12} /> },
  "action.start-run": { tone: "execution", icon: () => <Play size={12} /> },
  "action.open-sync": { tone: "execution", icon: () => <Activity size={12} /> },
  "action.create-node": { tone: "architecture", icon: () => <Plus size={12} /> },
  "action.connect-integration": { tone: "integration", icon: () => <Plug size={12} /> },
  "action.show-shortcuts": { tone: "neutral", icon: () => <Keyboard size={12} /> },
};

function paletteTile(id: string): { tone: IconTileTone; seed: string; icon: JSX.Element } {
  const known = PALETTE_TILES[id];
  if (known) return { tone: known.tone, seed: id, icon: known.icon() };
  return { tone: "architecture", seed: id, icon: <Box size={12} /> };
}

function PaletteItemTile(props: { id: string }) {
  const tile = () => paletteTile(props.id);
  return (
    <IconTile size={20} tone={tile().tone} seed={tile().seed} class="shrink-0">
      {tile().icon}
    </IconTile>
  );
}

export type PaletteBodyProps = {
  items?: PaletteItem[];
  platform?: PlatformContext;
  onCommand?: (id: string) => void;
  onConsumed?: () => void;
  /** Extra class on the search row (e.g. dialog flush cancel). */
  searchRowClass?: string;
  searchInputRef?: (el: HTMLInputElement) => void;
  /** Fires whenever the search query changes (including clear). */
  onQueryChange?: (query: string) => void;
  /** Content below search, outside the results scroll (e.g. drill-down). */
  belowSearch?: JSX.Element;
  /** Content at the top of the results scroll (e.g. overview cards). */
  scrollLeading?: JSX.Element;
  /** Optional actions after the search input (Open Desktop, Close). */
  trailing?: JSX.Element;
  /** When true, hide the command results list (detail view). */
  hideResults?: boolean;
  /**
   * Leads the results with Run an agent: the query becomes the prompt. Enter runs it when no
   * command matches, Cmd+Enter always; it selects `action.run-agent:<query>`.
   */
  runAgent?: boolean;
  /** Pills under the search that set how Run an agent runs, such as its route and card. */
  runProperties?: readonly ComposerProperty[];
};

/** The command id Run an agent selects; the prompt follows the colon. */
export const RUN_AGENT_PREFIX = "action.run-agent:";

export function usePaletteFilter(
  items: Accessor<PaletteItem[]>,
  onQueryChange?: (query: string) => void,
): {
  q: Accessor<string>;
  setQ: (value: string) => void;
  filtered: Accessor<PaletteItem[]>;
  groups: Accessor<[string, PaletteItem[]][]>;
} {
  const [q, setQState] = createSignal("");
  const setQ = (value: string) => {
    setQState(value);
    onQueryChange?.(value);
  };
  const filtered = () => {
    const query = q().toLowerCase().trim();
    if (!query) return items();
    return items().filter((c) => c.label.toLowerCase().includes(query));
  };
  const groups = () => {
    const map = new Map<string, PaletteItem[]>();
    for (const it of filtered()) {
      if (!map.has(it.group)) map.set(it.group, []);
      const arr = map.get(it.group);
      if (arr) arr.push(it);
    }
    return [...map.entries()];
  };
  return { q, setQ, filtered, groups };
}

/** Returns true when it handled the key (the caller prevents the default). */
type ResultsKeyHandler = (event: KeyboardEvent) => boolean;

/** Shared search + results list for in-app palette and global Commander window. */
export function PaletteBody(props: PaletteBodyProps) {
  const items = () =>
    (props.items ?? DEFAULT_PALETTE_ITEMS).filter((item) =>
      capabilityEnabled(props.platform, item.requiredCapability),
    );
  const { q, setQ, groups } = usePaletteFilter(items, props.onQueryChange);
  const listId = createUniqueId();
  const [activeRowId, setActiveRowId] = createSignal<string>();
  let searchInput: HTMLInputElement | undefined;
  let handleResultsKey: ResultsKeyHandler | undefined;

  function select(id: string) {
    props.onCommand?.(id);
    setQ("");
    props.onConsumed?.();
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class={[
          "commander-search-row flex shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] px-5",
          props.searchRowClass ?? "",
        ].join(" ")}
      >
        <Search size={16} class="commander-search-row__icon shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <input
          ref={(element) => { searchInput = element; props.searchInputRef?.(element); }}
          class="commander-search-input min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]"
          type="text"
          role="searchbox"
          placeholder={props.runAgent ? "Run an agent or search…" : "Search projects, resources, commands…"}
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(event) => {
            if (handleResultsKey?.(event)) event.preventDefault();
          }}
          aria-controls={props.hideResults ? undefined : listId}
          aria-activedescendant={props.hideResults ? undefined : activeRowId()}
          autofocus
          autocomplete="off"
          spellcheck={false}
        />
        <Show when={props.trailing}>
          <div class="commander-search-row__trailing flex shrink-0 items-center gap-1">
            {props.trailing}
          </div>
        </Show>
      </div>
      <Show when={props.runAgent && (props.runProperties?.length ?? 0) > 0}>
        <PropertyPills
          class="commander-run-pills"
          properties={props.runProperties ?? []}
          // The search field keeps the keys: a pick hands focus back to it.
          onPickerClose={() => requestAnimationFrame(() => searchInput?.focus())}
        />
      </Show>
      {props.belowSearch}
      <Show when={!props.hideResults}>
        <PaletteResults
          listId={listId}
          query={q()}
          groups={groups()}
          leading={props.scrollLeading}
          runAgent={props.runAgent}
          onSelect={select}
          onActiveRowId={setActiveRowId}
          bindKeys={(handler) => {
            handleResultsKey = handler;
            onCleanup(() => {
              if (handleResultsKey === handler) handleResultsKey = undefined;
              setActiveRowId(undefined);
            });
          }}
        />
      </Show>
    </div>
  );
}

/**
 * The results list, after fluid-functionalism's CommandMenu: the search field keeps DOM
 * focus and points at the lit row through `aria-activedescendant`. The highlight is the
 * fluid hover fill and nothing else; the pointer moves it, ↑/↓ move it (wrapping), and
 * Enter runs what it sits on. A new row set re-lights the first row, so Enter always has
 * a target, and the pointer leaving keeps the highlight where it was.
 */
function PaletteResults(props: {
  listId: string;
  query: string;
  groups: [string, PaletteItem[]][];
  leading?: JSX.Element;
  runAgent?: boolean;
  onSelect: (id: string) => void;
  onActiveRowId: (id: string | undefined) => void;
  bindKeys: (handler: ResultsKeyHandler) => void;
}) {
  let scroller: HTMLDivElement | undefined;
  const hover = createFluidHover(() => scroller, {
    keepOnLeave: true,
    // Group headings sit between rows; a click there only runs a row it nearly touches.
    gapClick: { maxDistance: 8 },
  });
  const commands = createMemo(() => props.groups.flatMap(([, list]) => list));
  // Run an agent is row 0 when shown, so the commands start after it.
  const lead = () => (props.runAgent ? 1 : 0);
  const groupOffsets = createMemo(() => {
    let offset = lead();
    return props.groups.map(([, list]) => {
      const start = offset;
      offset += list.length;
      return start;
    });
  });
  const showSearchAll = () => props.query.trim().length > 0;
  const rowCount = () => lead() + commands().length + (showSearchAll() ? 1 : 0);
  const searchAllIndex = () => lead() + commands().length;
  const runAgent = () => {
    const prompt = props.query.trim();
    if (prompt) props.onSelect(`${RUN_AGENT_PREFIX}${prompt}`);
  };
  const rowElementId = (index: number) => `${props.listId}-row-${index}`;

  const runRow = (index: number) => {
    if (props.runAgent && index === 0) return runAgent();
    const command = commands()[index - lead()];
    if (command) props.onSelect(command.id);
    else if (index === searchAllIndex() && showSearchAll()) {
      props.onSelect(`action.search-all:${props.query}`);
    }
  };

  const moveTo = (index: number) => {
    hover.releasePointer();
    hover.setActiveIndex(index);
    const rect = hover.rects()[index];
    if (scroller && rect) centerItemInView(scroller, rect, { toTop: index === 0 });
  };

  // A changed row set re-lights the first row and returns to the top.
  const rowSetKey = createMemo(() =>
    [lead() ? "\0run-agent" : "", ...commands().map((command) => command.id), showSearchAll() ? "\0search-all" : ""].join("\0"),
  );
  createEffect(
    on(rowSetKey, () => {
      // A typed query that matches a command lights it; otherwise Run an agent (or the first row).
      const firstCommand = props.query.trim() && commands().length > 0 ? lead() : 0;
      hover.setActiveIndex(rowCount() > 0 ? firstCommand : null);
      if (scroller) scroller.scrollTop = 0;
    }),
  );

  createEffect(() => {
    const index = hover.activeIndex();
    props.onActiveRowId(index === null ? undefined : rowElementId(index));
  });

  onMount(() => {
    props.bindKeys((event) => {
      // IME composition and modified arrows keep their editing meaning.
      if (event.isComposing || event.keyCode === 229) return false;
      // Cmd+Enter (Ctrl+Enter off macOS) always runs the query as an agent prompt.
      if (props.runAgent && event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        runAgent();
        return true;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
      const count = rowCount();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (count === 0) return false;
        const current = hover.activeIndex();
        const step = event.key === "ArrowDown" ? 1 : -1;
        moveTo(current === null ? (step > 0 ? 0 : count - 1) : (current + step + count) % count);
        return true;
      }
      if (event.key === "Enter") {
        const current = hover.activeIndex();
        if (current === null) return false;
        runRow(current);
        return true;
      }
      return false;
    });
  });

  const rowClass =
    "relative flex w-full items-center justify-between rounded-[var(--radius-item)] px-2 py-1.5 text-left text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] data-[fluid-hover-active]:text-[var(--color-text-primary)]";

  return (
    <div
      ref={scroller}
      class="commander-results-scroll relative min-h-0 flex-1 overflow-y-auto pt-2 pb-1"
      {...hover.handlers}
    >
      <FluidHoverHighlight hover={hover} class="commander-result-highlight" />
      {props.leading}
      {/* Mousedown anywhere in the list keeps focus in the search field. */}
      <div id={props.listId} role="listbox" aria-label="Commands" onMouseDown={(event) => event.preventDefault()}>
        <Show when={props.runAgent}>
          <PaletteRow
            hover={hover}
            index={0}
            id={rowElementId(0)}
            class={`${rowClass} mb-2 text-[13px]`}
            onRun={() => runRow(0)}
          >
            <span class="flex min-w-0 items-center gap-2">
              <PaletteItemTile id="action.start-run" />
              <span class="min-w-0 truncate">
                <Show when={props.query.trim()} fallback="Run an agent">
                  Run an agent: <span class="text-[var(--color-text-primary)]">“{props.query.trim()}”</span>
                </Show>
              </span>
            </span>
            <span class="shrink-0 text-[11px] text-[var(--color-text-disabled)]">{formatRunAgentKeys()}</span>
          </PaletteRow>
        </Show>
        <Index each={props.groups}>
          {(group, groupIndex) => {
            const headingId = `${props.listId}-group-${groupIndex}`;
            return (
              <div class="mb-2 last:mb-0" role="group" aria-labelledby={headingId}>
                <p
                  id={headingId}
                  class="relative m-0 px-2 py-1 text-[10px] font-medium tracking-wide text-[var(--color-text-disabled)] uppercase"
                >
                  {group()[0]}
                </p>
                <Index each={group()[1]}>
                  {(command, index) => {
                    const rowIndex = () => (groupOffsets()[groupIndex] ?? 0) + index;
                    const hint = () => {
                      if (command().shortcutId) return formatShortcut(command().shortcutId!);
                      const sequence = SHORTCUT_SEQUENCES.find((item) => item.id === command().sequenceId);
                      return sequence ? formatSequence(sequence.keys) : "";
                    };
                    return (
                      <PaletteRow
                        hover={hover}
                        index={rowIndex()}
                        id={rowElementId(rowIndex())}
                        class={`${rowClass} text-[13px]`}
                        onRun={() => runRow(rowIndex())}
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <PaletteItemTile id={command().id} />
                          <span class="min-w-0 truncate">{command().label}</span>
                        </span>
                        <Show when={hint()}>
                          <span class="shrink-0 text-[11px] text-[var(--color-text-disabled)]">{hint()}</span>
                        </Show>
                      </PaletteRow>
                    );
                  }}
                </Index>
              </div>
            );
          }}
        </Index>
        <Show when={commands().length === 0 && !props.runAgent}>
          <p role="presentation" class="px-2 py-4 text-center text-[12px] text-[var(--color-text-muted)]">
            No matches
          </p>
        </Show>
        <Show when={showSearchAll()}>
          <PaletteRow
            hover={hover}
            index={searchAllIndex()}
            id={rowElementId(searchAllIndex())}
            class={`${rowClass} mt-2 text-[12px]`}
            onRun={() => runRow(searchAllIndex())}
          >
            <span class="flex min-w-0 items-center gap-2">
              <IconTile size={20} tone="neutral" seed="commander-search" class="shrink-0">
                <Search size={12} />
              </IconTile>
              <span class="min-w-0 truncate">Show all results for “{props.query}”</span>
            </span>
          </PaletteRow>
        </Show>
      </div>
    </div>
  );
}

/** Cmd+Enter, in the platform's own notation. */
function formatRunAgentKeys() {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘↵" : "Ctrl+↵";
}

function PaletteRow(props: {
  hover: FluidHover;
  index: number;
  id: string;
  class: string;
  onRun: () => void;
  children: JSX.Element;
}) {
  let element: HTMLButtonElement | undefined;
  onMount(() => {
    const row = element;
    if (!row) return;
    // Re-joins at its new position when filtering moves it.
    createEffect(() => onCleanup(props.hover.registerItem(props.index, row)));
  });
  return (
    <button
      ref={element}
      type="button"
      role="option"
      tabIndex={-1}
      id={props.id}
      aria-selected={props.hover.activeIndex() === props.index}
      class={props.class}
      onClick={() => props.onRun()}
    >
      {props.children}
    </button>
  );
}
