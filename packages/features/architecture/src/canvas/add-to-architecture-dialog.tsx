import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import {
  A11yDialog,
  Button,
  Eye,
  Package,
  Search,
  Tabs,
  type TabItem,
} from "@polterware/frontend-design-system";
import {
  CATEGORY_LABELS,
  type ComponentCategory,
  type ComponentTypeDefinition,
  getComponentType,
  listCatalogTypes,
  searchCatalogTypes,
} from "../domain/registry";
import type { LinkableResource } from "../domain/place-link";
import type { TypePrefsPort } from "../domain/type-prefs";
import { ArchitectureNodeIcon } from "./architecture-node-icon";
import "./add-to-architecture-dialog.css";

const VISION_CATEGORY_ORDER: ComponentCategory[] = [
  "applications",
  "data",
  "infrastructure",
  "development",
  "external",
  "structure",
];

function isVisionType(t: ComponentTypeDefinition): boolean {
  return t.placeable && t.placementKind === "node" && t.category !== "connected";
}

function listVisionTypes(): ComponentTypeDefinition[] {
  return listCatalogTypes().filter(isVisionType);
}

function searchVisionTypes(query: string): ComponentTypeDefinition[] {
  return searchCatalogTypes(query).filter(isVisionType);
}

const MODE_TABS: TabItem[] = [
  {
    id: "vision",
    label: "Vision",
    tooltip: {
      title: "Vision",
      description:
        "Declared model of what the system should be. Placed as Planned until you link a resource.",
      icon: Eye,
    },
  },
  {
    id: "resources",
    label: "Synced",
    tooltip: {
      title: "Synced resources",
      description:
        "Provider resources synced from your integrations. Placing one links it to a component on the map.",
      icon: Package,
    },
  },
];

/**
 * Add-to-architecture dialog — Vision (declared types) | Synced (integration resources).
 * Flush chrome; search + two mode tabs; size lg.
 */
export function AddToArchitectureDialog(props: {
  open: boolean;
  prefs: TypePrefsPort;
  resources: readonly LinkableResource[];
  onClose: () => void;
  onSelect: (def: ComponentTypeDefinition) => void;
  onSelectResource: (resource: LinkableResource) => void;
  onUnavailableAction?: (def: ComponentTypeDefinition) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [activeTab, setActiveTab] = createSignal<"vision" | "resources">("vision");
  const [focusIdx, setFocusIdx] = createSignal(0);
  let searchRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open) {
      setQuery("");
      setFocusIdx(0);
      setActiveTab("vision");
      queueMicrotask(() => searchRef?.focus());
    }
  });

  const searching = () => query().trim().length > 0;

  const visionList = createMemo((): ComponentTypeDefinition[] => {
    if (searching()) return searchVisionTypes(query());
    return listVisionTypes();
  });

  const resourceList = createMemo((): LinkableResource[] => {
    const q = query().trim().toLowerCase();
    if (!q) return [...props.resources];
    return props.resources.filter(
      (r) =>
        r.name.toLowerCase().includes(q)
        || r.type.toLowerCase().includes(q)
        || (r.environmentLabel ?? r.environmentId).toLowerCase().includes(q),
    );
  });

  const recents = createMemo(() =>
    props.prefs
      .getRecents()
      .map((id) => getComponentType(id))
      .filter((x): x is ComponentTypeDefinition => x != null && isVisionType(x)),
  );

  function pickType(def: ComponentTypeDefinition) {
    if (!def.placeable || def.placementKind === "action") {
      props.onUnavailableAction?.(def);
      return;
    }
    props.prefs.pushRecent(def.id);
    props.onSelect(def);
  }

  function pickResource(resource: LinkableResource) {
    props.onSelectResource(resource);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (activeTab() === "resources") {
      const list = resourceList();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(list.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = list[focusIdx()];
        if (item) pickResource(item);
      }
      return;
    }
    const list = visionList();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(list.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[focusIdx()];
      if (item) pickType(item);
    }
  }

  return (
    <A11yDialog
      open={props.open}
      title="Add to architecture"
      chrome="flush"
      onClose={() => props.onClose()}
      size="lg"
    >
      <div class="-mb-3 flex min-h-0 w-full flex-1 flex-col" onKeyDown={onKeyDown}>
        <div class="-mx-5 flex shrink-0 items-center gap-2.5 border-b border-[var(--color-border-subtle)] px-5 pb-3 pr-10">
          <Search size={16} class="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <input
            type="text"
            class="architecture-catalog-search min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]"
            ref={searchRef}
            role="searchbox"
            placeholder={
              activeTab() === "resources"
                ? "Search synced resources…"
                : "Search vision types (postgres, next, cron…)"
            }
            value={query()}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setFocusIdx(0);
            }}
          />
        </div>

        <div class="relative -mx-5 flex min-h-0 flex-1 flex-col">
          <div class="architecture-catalog-tabs-bar">
            <Tabs
              items={MODE_TABS}
              value={activeTab()}
              onChange={(id) => {
                setActiveTab(id === "resources" ? "resources" : "vision");
                setFocusIdx(0);
                setQuery("");
              }}
              aria-label="Add mode"
              class="architecture-catalog-tabs pw-tabs--flush shrink-0"
            />
          </div>

          <Show when={searching()}>
            <p class="m-0 shrink-0 px-5 py-2 text-[11px] text-[var(--color-text-muted)]">
              Search results ·{" "}
              {activeTab() === "resources" ? resourceList().length : visionList().length} match
              {(activeTab() === "resources" ? resourceList().length : visionList().length) === 1
                ? ""
                : "es"}
            </p>
          </Show>

          <div class="architecture-catalog-list flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5">
            <Show when={activeTab() === "vision"}>
              <Show when={!searching()}>
                <Show when={recents().length > 0}>
                  <Section title="Recent">
                    <For each={recents()}>
                      {(t) => (
                        <TypeRow def={t} onPick={() => pickType(t)} />
                      )}
                    </For>
                  </Section>
                </Show>
                <For each={VISION_CATEGORY_ORDER}>
                  {(cat) => {
                    const items = () => listVisionTypes().filter((t) => t.category === cat);
                    return (
                      <Show when={items().length > 0}>
                        <Section title={CATEGORY_LABELS[cat]}>
                          <For each={items()}>
                            {(t) => (
                              <TypeRow def={t} onPick={() => pickType(t)} />
                            )}
                          </For>
                        </Section>
                      </Show>
                    );
                  }}
                </For>
              </Show>

              <Show when={searching()}>
                <div class="flex flex-col gap-0.5">
                  <For each={visionList()}>
                    {(t, i) => (
                      <TypeRow
                        def={t}
                        focused={focusIdx() === i()}
                        onPick={() => pickType(t)}
                      />
                    )}
                  </For>
                </div>
                <Show when={visionList().length === 0}>
                  <p class="px-2 py-8 text-center text-[12px] text-[var(--color-text-muted)]">
                    No types match.
                  </p>
                </Show>
              </Show>
            </Show>

            <Show when={activeTab() === "resources"}>
              <Show
                when={resourceList().length > 0}
                fallback={
                  <div class="flex flex-col items-center gap-3 px-2 py-10 text-center">
                    <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
                      No synced resources yet. Connect an integration in Settings and sync it.
                    </p>
                  </div>
                }
              >
                <div class="flex flex-col gap-0.5">
                  <For each={resourceList()}>
                    {(r, i) => (
                      <ResourceRow
                        resource={r}
                        focused={focusIdx() === i()}
                        onPick={() => pickResource(r)}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </A11yDialog>
  );
}

function Section(props: { title: string; children: import("solid-js").JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <h3 class="m-0 px-1 text-[10px] font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
        {props.title}
      </h3>
      <div class="flex flex-col gap-0.5">{props.children}</div>
    </section>
  );
}

function TypeRow(props: {
  def: ComponentTypeDefinition;
  focused?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      class="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-left data-[disabled=true]:text-[var(--color-text-disabled)]"
      data-disabled={!props.def.placeable ? "true" : undefined}
      classList={{
        "bg-[var(--color-surface-selected)]": props.focused,
        "hover:bg-[var(--color-surface-hover)]": !props.focused,
      }}
      disabled={!props.def.placeable}
      onClick={() => props.onPick()}
    >
      <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center">
        <ArchitectureNodeIcon
          name={props.def.icon}
          subtype={props.def.subtype}
          provider={props.def.provider}
          compact={false}
          seed={props.def.id}
          dimmed={!props.def.placeable}
        />
      </span>
      <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">
        {props.def.label}
      </span>
    </button>
  );
}

function ResourceRow(props: {
  resource: LinkableResource;
  focused?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      class="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-left"
      classList={{
        "bg-[var(--color-surface-selected)]": props.focused,
        "hover:bg-[var(--color-surface-hover)]": !props.focused,
      }}
      onClick={() => props.onPick()}
    >
      <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
        <Package size={16} class="text-[var(--color-text-muted)]" aria-hidden />
      </span>
      <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">
        {props.resource.name}
      </span>
    </button>
  );
}
