import { createMemo, createSignal, For, Show, type Component, type JSX } from "solid-js";
import { Button } from "./button";
import { A11yDialog } from "./dialog";
import { X } from "./hugeicons";
import { Input } from "./input";
import { PageLoading } from "./feedback";
import { Card } from "./card";
import "./settings-dialog.css";

export type SettingsNavItem = {
  id: string;
  label: string;
  /** Items that share a group are listed under one quiet heading, in order. */
  group?: string;
  icon?: Component<{ size?: number; "aria-hidden"?: boolean }>;
};

export type SettingsSearchEntry = {
  id?: string;
  /** Nav item the result opens. */
  item: string;
  /** Section title inside that item; also the scroll target (see `settingsSectionId`). */
  section?: string;
  label: string;
  description?: string;
  keywords?: string;
};

/** DOM id of a `SettingsSection`, so a search result can scroll to it. */
export function settingsSectionId(section: string): string {
  return `settings-section-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Entries whose label, description, section, or keywords contain every term of the query. */
export function searchSettings<T extends Omit<SettingsSearchEntry, "item">>(entries: readonly T[], query: string): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return entries.filter((entry) => {
    const haystack = [entry.label, entry.description, entry.section, entry.keywords]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible dialog title. */
  title?: string;
  items: readonly SettingsNavItem[];
  active: string;
  onSelect: (id: string) => void;
  /** Searchable settings. Nav items are always searchable by label and group. */
  searchEntries?: readonly SettingsSearchEntry[];
  /** Page heading; defaults to the active item's label. */
  heading?: JSX.Element;
  /** Controls beside the heading (for example an Add button). */
  actions?: JSX.Element;
  loading?: boolean;
  children: JSX.Element;
};

/**
 * The settings dialog every app shares: a rail with search and grouped sections on the left,
 * the active section on an opaque panel on the right. Search results open their section and
 * scroll to the `SettingsSection` they name.
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const [query, setQuery] = createSignal("");
  const searching = () => query().trim().length > 0;
  const itemById = (id: string) => props.items.find((item) => item.id === id);
  const activeItem = () => itemById(props.active);

  const results = createMemo(() => {
    const entries: SettingsSearchEntry[] = [
      ...props.items.map((item) => ({ item: item.id, label: item.label, keywords: item.group })),
      ...(props.searchEntries ?? []).map((entry) => ({
        ...entry,
        keywords: [entry.keywords, itemById(entry.item)?.label].filter(Boolean).join(" "),
      })),
    ];
    return searchSettings(entries, query());
  });

  const resultPath = (entry: SettingsSearchEntry) => {
    const item = itemById(entry.item);
    const path = entry.section ? `${item?.label ?? ""} · ${entry.section}` : (item?.group ?? item?.label ?? "");
    return entry.description ? `${path} — ${entry.description}` : path;
  };

  const select = (id: string) => {
    setQuery("");
    props.onSelect(id);
  };

  const openResult = (entry: SettingsSearchEntry) => {
    select(entry.item);
    const section = entry.section;
    if (!section) return;
    // Wait for the section to mount before scrolling to it.
    requestAnimationFrame(() => document.getElementById(settingsSectionId(section))?.scrollIntoView({ block: "start" }));
  };

  return (
    <A11yDialog
      open={props.open}
      title={props.title ?? "Settings"}
      size="xl"
      chrome="flush"
      bodyClass="p-0"
      showCloseButton={false}
      autoFocusField={false}
      class="!rounded-[var(--radius-dialog)] !bg-[var(--color-app-background)]"
      onClose={() => {
        setQuery("");
        props.onClose();
      }}
    >
      <div class="pw-settings">
        <nav aria-label="Settings sections" class="pw-settings__nav">
          <Input
            size="sm"
            type="search"
            class="mb-2 !rounded-full"
            placeholder="Search settings"
            aria-label="Search settings"
            autocomplete="off"
            spellcheck={false}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query()) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
          />
          <For each={props.items}>
            {(item, index) => {
              const active = () => !searching() && item.id === props.active;
              const startsGroup = () => Boolean(item.group) && (index() === 0 || props.items[index() - 1]?.group !== item.group);
              return (
                <>
                  <Show when={startsGroup()}>
                    <span class="px-2.5 pb-0.5 text-[11px] font-medium text-[var(--color-text-muted)]" classList={{ "pt-3": index() > 0 }}>
                      {item.group}
                    </span>
                  </Show>
                  <button
                    type="button"
                    aria-current={active() ? "page" : undefined}
                    class="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-0 px-2.5 text-left text-[12.5px]"
                    classList={{
                      "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]": active(),
                      "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]": !active(),
                    }}
                    onClick={() => select(item.id)}
                  >
                    <Show when={item.icon}>{(icon) => icon()({ size: 14, "aria-hidden": true })}</Show>
                    {item.label}
                  </button>
                </>
              );
            }}
          </For>
        </nav>

        <section aria-label="Selected settings section" class="pw-settings__panel surface-panel">
          <Button variant="icon" aria-label="Close settings" class="!absolute top-5 right-5 z-10" onClick={props.onClose}>
            <X size={16} aria-hidden />
          </Button>
          <div class="pw-settings__content">
            <div class="mb-6 flex items-center justify-between gap-3 pr-10">
              <h2 class="m-0 text-[16px] font-semibold text-[var(--color-text-primary)]">
                {searching() ? "Search results" : (props.heading ?? activeItem()?.label)}
              </h2>
              <Show when={!searching() && !props.loading && props.actions}>{props.actions}</Show>
            </div>
            <Show when={!props.loading} fallback={<PageLoading layout="page" label="Loading settings…" />}>
              <Show when={searching()}>
                <Show
                  when={results().length > 0}
                  fallback={<p class="m-0 px-1 text-[12.5px] text-[var(--color-text-muted)]">No settings match “{query().trim()}”.</p>}
                >
                  <ul class="m-0 flex list-none flex-col gap-1 p-0">
                    <For each={results()}>
                      {(entry) => (
                        <li>
                          <button
                            type="button"
                            class="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius-control)] border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--color-surface-hover)]"
                            onClick={() => openResult(entry)}
                          >
                            <span class="text-[12.5px] text-[var(--color-text-primary)]">{entry.label}</span>
                            <span class="text-[11.5px] text-[var(--color-text-muted)]">{resultPath(entry)}</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
              <div class="flex flex-col gap-6" classList={{ hidden: searching() }}>
                {props.children}
              </div>
            </Show>
          </div>
        </section>
      </div>
    </A11yDialog>
  );
}

/**
 * Titled group of settings. `card` puts the rows on one card; `stack` gives each row its own
 * card, for sections whose rows are independent.
 */
export function SettingsSection(props: {
  title: string;
  description?: string;
  variant?: "card" | "stack";
  children: JSX.Element;
}) {
  return (
    <section id={settingsSectionId(props.title)} class="flex scroll-mt-2 flex-col gap-2">
      <div class="px-1">
        <h3 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">{props.title}</h3>
        <Show when={props.description}>
          <p class="m-0 mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{props.description}</p>
        </Show>
      </div>
      <Show when={props.variant === "stack"} fallback={<Card class="flex flex-col gap-4 !p-4">{props.children}</Card>}>
        <div class="pw-settings-stack">{props.children}</div>
      </Show>
    </section>
  );
}

/** One setting: label and optional hint on the left, controls on the right; wraps when narrow. */
export function SettingsRow(props: { label: JSX.Element; description?: JSX.Element; for?: string; children?: JSX.Element }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="min-w-40 flex-1">
        <label for={props.for} class="block text-[12.5px] text-[var(--color-text-primary)]">
          {props.label}
        </label>
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
