import {
  Index,
  Show,
  createMemo,
  createSignal,
  type JSX,
} from "solid-js";
import {
  CountBadge,
  Briefcase06Icon,
  ChartRelationshipIcon,
  createFluidHover,
  FluidHoverHighlight,
  Gauge,
  History,
  Inbox,
  Layers,
  Pencil,
  ListOrdered,
  Route,
  Settings,
  spring,
  type FluidHover,
} from "@polterware/frontend-design-system";
import {
  capabilityEnabled,
  type PlatformContext,
} from "@polterware/frontend-platform";
import { readRemembered, writeRemembered } from "@polterware/frontend-state";
import { SidebarItem, SidebarNavFrame, SidebarSection } from "@polterware/frontend-shell";
import type { NavItem, NavSectionId } from "./route";
import { HelpMenu } from "./help-menu";
import { HelpTopicDialog } from "./help-topic-dialog";
import type { HelpTopicId } from "./help-topics";

/**
 * Sidebar glyphs — Hugeicons outline set tuned for operator IA.
 * Sidebar glyphs stay within the curated Hugeicons set.
 */
const icons: Record<string, (p: { size?: number; class?: string }) => JSX.Element> = {
  inbox: (p) => <Inbox size={p.size ?? 14} class={p.class} />,
  structure: (p) => <ChartRelationshipIcon size={p.size ?? 14} class={p.class} />,
  canvas: (p) => <Pencil size={p.size ?? 14} class={p.class} />,
  milestones: (p) => <Briefcase06Icon size={p.size ?? 14} class={p.class} />,
  truth: (p) => <Layers size={p.size ?? 14} class={p.class} />,
  dispatch: (p) => <Route size={p.size ?? 14} class={p.class} />,
  runs: (p) => <Route size={p.size ?? 14} class={p.class} />,
  routing: (p) => <ListOrdered size={p.size ?? 14} class={p.class} />,
  usage: (p) => <Gauge size={p.size ?? 14} class={p.class} />,
  activity: (p) => <History size={p.size ?? 14} class={p.class} />,
  settings: (p) => <Settings size={p.size ?? 14} class={p.class} />,
};

/** Remembered on this computer: the sidebar groups someone collapsed, by label. */
const COLLAPSED_GROUPS_KEY = "shell.sidebar.collapsed";

/** A count shown after a sidebar label; hidden at zero. */
export type SidebarCount = { count: number; tone?: "danger" | "muted"; label?: string };

export function SidebarNav(props: {
  items: NavItem[];
  activeId: string;
  onSelect: (section: NavSectionId, tab?: string) => void;
  platform?: PlatformContext;
  counts?: Partial<Record<string, SidebarCount>>;
}) {
  let nav: HTMLElement | undefined;
  // Group labels sit between rows; a click there only lands on a row it nearly touches.
  const hover = createFluidHover(() => nav, { gapClick: { maxDistance: 8 } });
  const [collapsedGroups, setCollapsedGroups] = createSignal<readonly string[]>(
    readRemembered<string[]>(COLLAPSED_GROUPS_KEY, []),
  );
  const collapsed = (group: string) => collapsedGroups().includes(group);
  function toggleGroup(group: string) {
    const next = collapsed(group)
      ? collapsedGroups().filter((label) => label !== group)
      : [...collapsedGroups(), group];
    setCollapsedGroups(next);
    writeRemembered(COLLAPSED_GROUPS_KEY, next.length ? next : undefined);
  }

  const groups = createMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of props.items.filter((candidate) =>
      capabilityEnabled(props.platform, candidate.requiredCapability),
    )) {
      const g = item.group ?? "GENERAL";
      if (!map.has(g)) map.set(g, []);
      const arr = map.get(g);
      if (arr) arr.push(item);
    }
    return [...map.entries()];
  });
  const groupOffsets = createMemo(() => {
    let offset = 0;
    return groups().map(([, items]) => {
      const start = offset;
      offset += items.length;
      return start;
    });
  });
  // Settings lives in the footer, outside this list: the marker fades out rather than travel.
  const activeRect = () => {
    const index = groups()
      .flatMap(([, items]) => items)
      .findIndex((item) => item.id === props.activeId);
    return index < 0 ? null : (hover.rects()[index] ?? null);
  };

  return (
    <SidebarNavFrame ref={nav} aria-label="Primary" {...hover.handlers}>
      {/* The active marker glides between destinations; the hover pill rides above it and a
          fresh entry grows from the active route. */}
      <FluidHoverHighlight
        class="pw-sidebar-active"
        rect={activeRect()}
        targetKey={props.activeId}
        transition={spring.moderate}
      />
      <FluidHoverHighlight hover={hover} class="pw-sidebar-hover" from={activeRect()} />
      <Index each={groups()}>
        {(group, groupIndex) => (
          <SidebarSection
            label={group()[0]}
            collapsed={collapsed(group()[0])}
            onToggle={() => toggleGroup(group()[0])}
          >
            <Index each={group()[1]}>
              {(item, index) => (
                // A collapsed group keeps its active row, so the current place stays in view.
                <Show when={!collapsed(group()[0]) || props.activeId === item().id}>
                  <SidebarNavItem
                    item={item()}
                    hover={hover}
                    index={(groupOffsets()[groupIndex] ?? 0) + index}
                    active={props.activeId === item().id}
                    count={props.counts?.[item().id]}
                    onSelect={() => props.onSelect(item().section, item().tab)}
                  />
                </Show>
              )}
            </Index>
          </SidebarSection>
        )}
      </Index>
    </SidebarNavFrame>
  );
}

function SidebarNavItem(props: {
  item: NavItem;
  hover: FluidHover;
  index: number;
  active: boolean;
  count?: SidebarCount;
  onSelect: () => void;
}) {
  const renderIcon = () =>
    (props.item.icon ? icons[props.item.icon] : undefined)
    ?? icons[props.item.section]
    ?? icons.structure!;
  return (
    <SidebarItem
      nav
      active={props.active}
      hover={props.hover}
      index={props.index}
      onClick={() => props.onSelect()}
      icon={renderIcon()({ size: 14 })}
      trailing={
        <Show when={props.count?.count}>
          {(count) => (
            <CountBadge
              count={count()}
              class="pw-sidebar-item-count"
              tone={props.count?.tone === "danger" ? "danger" : "neutral"}
              ariaLabel={props.count?.label ?? `${count()} items`}
            />
          )}
        </Show>
      }
    >
      {props.item.label}
    </SidebarItem>
  );
}

/** Fixed Project settings and Help controls for the project sidebar. */
export function SidebarSettingsItem(props: {
  active?: boolean;
  onSelect: () => void;
}) {
  const [activeTopicId, setActiveTopicId] = createSignal<HelpTopicId | null>(null);
  return (
    <>
      <div class="flex items-center gap-1">
        <SidebarItem
          footer
          active={Boolean(props.active)}
          onClick={() => props.onSelect()}
          icon={icons.settings!({ size: 14 })}
        >
          Project settings
        </SidebarItem>
        <HelpMenu onSelectTopic={setActiveTopicId} />
      </div>
      <HelpTopicDialog topicId={activeTopicId()} onClose={() => setActiveTopicId(null)} />
    </>
  );
}
