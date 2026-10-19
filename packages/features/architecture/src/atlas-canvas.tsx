import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack } from "solid-js";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  animateCollapse,
  Button,
  Check,
  ChevronRight,
  CollapseIcon,
  DetailPanel,
  IconTile,
  ExpandIcon,
  GitCompare,
  Hammer,
  History,
  ListChecks,
  PageContent,
  PageEmpty,
  PageLoading,
  PageToolbar,
  Pencil,
  RefreshCw,
  SchemeIcon,
  Select,
  Tooltip,
  type SelectOption,
  Tabs,
  type CollapseControls,
  type IconTileTone,
} from "@polterware/frontend-design-system";
import { detailPanelStore, createDetailPanelSelector } from "@polterware/frontend-state";
import "./atlas-tree.css";
import {
  buildTree,
  entityIdOf,
  expandableKeys,
  visibleItems,
  type TreeItem,
} from "./atlas-tree";
import { ARCHITECTURE_TAB_ITEMS, normalizeArchitectureTab, type ArchitectureTabId } from "./tab";

const SCOPE = "atlas:hierarchy";

export type AtlasCanvasNode = {
  id: string;
  parentId: string;
  level: "system" | "domain" | "component";
  slug: string;
  path: string;
  title: string;
  intent: string;
  decisions: string[];
  invariants: { id: string; text: string }[];
  status: "proposed" | "in_progress" | "delivered" | "drift";
  childCount: number;
  featureCount: number;
  openQuestions: number;
  repo: string;
  folder: string;
  migrationFrom: string;
  migrationTo: string;
  /** Node paths this node depends on; the map draws them as edges. */
  uses?: string[];
};

export type AtlasCanvasCard = {
  slug: string;
  title: string;
  intent: string;
  stage: string;
  kind: "feature" | "architecture";
  under: string;
  decisions: string[];
  tasks: { title: string; state: string }[];
  questions: { text: string; blocking: boolean; state: string }[];
  invariants: { text: string }[];
};

const STATUS_LABEL: Record<AtlasCanvasNode["status"], string> = {
  proposed: "Proposed",
  in_progress: "In progress",
  delivered: "Delivered",
  drift: "Drift",
};

const STATUS_MARK: Record<AtlasCanvasNode["status"], { icon: typeof Check; tone: IconTileTone }> = {
  proposed: { icon: Pencil, tone: "knowledge" },
  in_progress: { icon: Hammer, tone: "infrastructure" },
  delivered: { icon: Check, tone: "data" },
  drift: { icon: GitCompare, tone: "security" },
};

/** A node that is moving between designs; separate from the derived status. */
function migrationLabel(node: AtlasCanvasNode): string {
  return node.migrationFrom || node.migrationTo ? `Migrating: ${node.migrationFrom} → ${node.migrationTo}` : "";
}

function cardStatus(card: AtlasCanvasCard, driftSlugs: readonly string[]): AtlasCanvasNode["status"] {
  if (driftSlugs.includes(card.slug)) return "drift";
  if (card.stage === "delivered") return "delivered";
  return "in_progress";
}

function statusTooltip(status: AtlasCanvasNode["status"], note?: string): string {
  const label = STATUS_LABEL[status];
  return note ? `${label} · ${note}` : label;
}

function nodeTarget(id: string) {
  return { scopeId: SCOPE, entityId: `node:${id}`, entityKind: "atlas-node" };
}

function cardTarget(slug: string) {
  return { scopeId: SCOPE, entityId: `card:${slug}`, entityKind: "atlas-card" };
}

export function AtlasCanvas(props: {
  nodes: AtlasCanvasNode[];
  driftSlugs: string[];
  cards: AtlasCanvasCard[];
  loading?: boolean;
  tab: string;
  onTabChange: (tab: ArchitectureTabId) => void;
  /** True for a replayed past graph: status marks are hidden and the page is read-only. */
  historical?: boolean;
  /** Timeline choices ("Now" first); omitted when there is no history to pick from. */
  timeline?: { value: string; options: readonly SelectOption[]; onChange: (value: string) => void };
}) {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);

  const byId = createMemo(() => new Map(props.nodes.map((node) => [node.id, node])));

  const tree = createMemo(() => buildTree(props.nodes, props.cards));
  const expandable = createMemo(() => expandableKeys(tree()));

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const panelId = () =>
    activeTarget()?.scopeId === SCOPE ? activeTarget()?.entityId ?? "" : "";

  const selectedNode = createMemo(() => {
    const id = panelId();
    return id.startsWith("node:") ? byId().get(id.slice(5)) : undefined;
  });

  const selectedCard = createMemo(() => {
    const id = panelId();
    if (!id.startsWith("card:")) return undefined;
    return props.cards.find((card) => card.slug === id.slice(5));
  });

  const [bulk, setBulk] = createSignal(false);
  function setAll(next: ReadonlySet<string>) {
    setBulk(true);
    setCollapsed(next);
    requestAnimationFrame(() => requestAnimationFrame(() => setBulk(false)));
  }

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: SCOPE,
      status: props.loading ? "loading" : "ready",
      targets: visibleItems(tree(), collapsed()).map((item) =>
        item.kind === "node" ? nodeTarget(item.node.id) : cardTarget(item.card.slug),
      ),
    });
  });

  onCleanup(() => {
    detailPanelStore.getState().unregisterCollection(SCOPE);
  });

  function select(item: TreeItem) {
    detailPanelStore
      .getState()
      .activateTarget(item.kind === "node" ? nodeTarget(item.node.id) : cardTarget(item.card.slug));
  }

  const tab = () => normalizeArchitectureTab(props.tab);

  return (
    <EntityDetailHost>
      <div class="flex h-full min-h-0 flex-col">
        <PageToolbar.Root>
          <PageToolbar.Tabs>
            <Tabs
              items={ARCHITECTURE_TAB_ITEMS}
              value={tab()}
              onChange={(id) => props.onTabChange(normalizeArchitectureTab(id))}
              aria-label="Atlas"
            />
          </PageToolbar.Tabs>
          <PageToolbar.Actions>
            <Button
              size="sm"
              disabled={props.nodes.length === 0}
              onClick={() => setAll(new Set())}
            >
              <ExpandIcon size={14} aria-hidden />
              Expand all
            </Button>
            <Button
              size="sm"
              disabled={props.nodes.length === 0}
              onClick={() => setAll(new Set(expandable()))}
            >
              <CollapseIcon size={14} aria-hidden />
              Collapse all
            </Button>
            <Show when={props.timeline}>
              {(timeline) => (
                <Select
                  size="sm"
                  aria-label="Atlas timeline"
                  class="w-56"
                  icon={<History size={14} aria-hidden />}
                  value={timeline().value}
                  options={timeline().options}
                  onChange={timeline().onChange}
                />
              )}
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>
        <PageContent class="flex min-h-0 flex-1 flex-col overflow-auto">
          <Show
            when={!props.loading}
            fallback={<PageLoading layout="page" label="Loading Atlas…" />}
          >
            <Show
              when={props.nodes.length > 0}
              fallback={
                <PageEmpty
                  title="No Atlas nodes yet"
                  description="Write system, domain, and component nodes with polterware apply. Feature cards stay on the Work board."
                />
              }
            >
              <Show when={props.historical}>
                <p class="m-0 px-4 pt-3 text-[12.5px] text-[var(--color-text-muted)]" role="status">
                  Read-only past view. Structure, contract, decisions, and migration state are replayed; status,
                  features, and drift are live only.
                </p>
              </Show>

              <ul class="atlas-tree-list" role="tree" aria-label="Atlas hierarchy" data-bulk={String(bulk())}>
                <For each={tree()}>
                  {(item, index) => (
                    <TreeNode
                      item={item}
                      index={index()}
                      depth={0}
                      collapsed={collapsed}
                      bulk={bulk}
                      selectedId={panelId}
                      historical={props.historical ?? false}
                      driftSlugs={props.driftSlugs}
                      onToggle={toggle}
                      onDetails={select}
                    />
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </PageContent>
      </div>
      <AtlasPanel
        node={selectedNode()}
        card={selectedCard()}
        driftSlugs={props.driftSlugs}
        cards={props.cards}
        historical={props.historical ?? false}
      />
    </EntityDetailHost>
  );
}

type TreeContext = {
  collapsed: () => ReadonlySet<string>;
  bulk: () => boolean;
  selectedId: () => string;
  historical: boolean;
  driftSlugs: string[];
  onToggle: (key: string) => void;
  onDetails: (item: TreeItem) => void;
};

/** A node and, below it, its group of child rows. The group springs to its measured height (`animateCollapse`). */
function TreeNode(props: TreeContext & { item: TreeItem; index: number; depth: number }) {
  const open = () => props.item.hasChildren && !props.collapsed().has(props.item.key);
  let group: HTMLDivElement | undefined;
  let running: CollapseControls | undefined;

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  createEffect(
    on(
      open,
      (isOpen) => {
        if (!group) return;
        running = animateCollapse(group, isOpen, {
          previous: running,
          instant: props.bulk() || reducedMotion(),
        });
      },
      { defer: true },
    ),
  );

  return (
    <li
      role="treeitem"
      aria-level={props.depth + 1}
      aria-expanded={props.item.hasChildren ? open() : undefined}
      aria-selected={props.selectedId() === entityIdOf(props.item)}
      style={{ "--i": Math.min(props.index, 5) }}
    >
      <TreeRow
        item={props.item}
        historical={props.historical}
        driftSlugs={props.driftSlugs}
        expanded={open()}
        selected={props.selectedId() === entityIdOf(props.item)}
        onToggle={() => props.onToggle(props.item.key)}
        onDetails={() => props.onDetails(props.item)}
      />
      <Show when={props.item.hasChildren}>
        <div
          class="atlas-tree-group"
          ref={(el) => {
            group = el;
            const initiallyOpen = untrack(open);
            el.hidden = !initiallyOpen;
            el.inert = !initiallyOpen;
            el.dataset.state = initiallyOpen ? "open" : "closed";
          }}
        >
          <ul role="group">
            <For each={props.item.children}>
              {(child, index) => <TreeNode {...props} item={child} index={index()} depth={props.depth + 1} />}
            </For>
          </ul>
        </div>
      </Show>
    </li>
  );
}

/** Flat row: chevron expands in place, the rest opens details. Status is an icon tile with a tooltip. */
function TreeRow(props: {
  item: TreeItem;
  historical: boolean;
  driftSlugs: string[];
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onDetails: () => void;
}) {
  const status = () =>
    props.item.kind === "node" ? props.item.node.status : cardStatus(props.item.card, props.driftSlugs);
  const title = () => (props.item.kind === "node" ? props.item.node.title : props.item.card.title);
  const subtitle = () =>
    props.item.kind === "node"
      ? `${props.item.node.level} · ${props.item.node.path}`
      : `${props.item.card.kind === "architecture" ? "architecture change" : "feature"} · ${props.item.card.slug}`;
  const migration = () => (props.item.kind === "node" ? migrationLabel(props.item.node) : "");
  return (
    <div class="atlas-tree-row" data-selected={props.selected ? "true" : undefined}>
      <Show when={props.item.hasChildren} fallback={<span class="atlas-tree-chevron__spacer" aria-hidden="true" />}>
        <button
          type="button"
          class="atlas-tree-chevron"
          aria-label={`${props.expanded ? "Collapse" : "Expand"} ${title()}`}
          onClick={props.onToggle}
        >
          <ChevronRight
            size={14}
            aria-hidden
            class="transition-transform duration-[var(--duration-control)] ease-[var(--ease-enter)] motion-reduce:transition-none"
            classList={{ "rotate-90": props.expanded }}
          />
        </button>
      </Show>
      <button
        type="button"
        class="atlas-tree-row__main"
        aria-current={props.selected ? "true" : undefined}
        data-detail-opener
        data-detail-target-id={props.item.kind === "node" ? props.item.node.id : props.item.card.slug}
        onClick={props.onDetails}
      >
        <Show when={!(props.historical && props.item.kind === "node")}>
          <AtlasStatusMark status={status()} />
        </Show>
        <span class="atlas-tree-row__body">
          <span class="atlas-tree-row__title">{title()}</span>
          <span class="atlas-tree-row__meta">{subtitle()}</span>
        </span>
        <Show when={migration()}>
          <MigrationMark label={migration()} />
        </Show>
      </button>
    </div>
  );
}

export function AtlasStatusMark(props: { status: AtlasCanvasNode["status"]; note?: string }) {
  const label = () => statusTooltip(props.status, props.note);
  const tone = () => STATUS_MARK[props.status].tone;
  return (
    <Tooltip.Root openDelay={400}>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span {...triggerProps({ class: "atlas-tree-row__status", role: "img", "aria-label": label() })}>
            <IconTile size={28} tone={tone()}>
              {(() => {
                const Icon = STATUS_MARK[props.status].icon;
                return <Icon size={14} aria-hidden />;
              })()}
            </IconTile>
          </span>
        )}
      />
      <Tooltip.Content>{label()}</Tooltip.Content>
    </Tooltip.Root>
  );
}

function MigrationMark(props: { label: string }) {
  return (
    <Tooltip.Root openDelay={400}>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span {...triggerProps({ class: "atlas-tree-row__status", role: "img", "aria-label": props.label })}>
            <IconTile size={28} tone="knowledge">
              <RefreshCw size={14} aria-hidden />
            </IconTile>
          </span>
        )}
      />
      <Tooltip.Content>{props.label}</Tooltip.Content>
    </Tooltip.Root>
  );
}

/** Side panel for an Atlas node: intent, contract, decisions, and the work cards under it. */
export function AtlasRecordDetail(props: {
  node: AtlasCanvasNode | undefined;
  cards: readonly AtlasCanvasCard[];
  historical?: boolean;
}) {
  return (
    <DetailPanel.Content>
      <Show when={props.node}>
        {(node) => (
          <NodePanel node={node()} cards={props.cards} historical={props.historical ?? false} />
        )}
      </Show>
    </DetailPanel.Content>
  );
}

function AtlasPanel(props: {
  node: AtlasCanvasNode | undefined;
  card: AtlasCanvasCard | undefined;
  driftSlugs: string[];
  cards: AtlasCanvasCard[];
  historical: boolean;
}) {
  return (
    <DetailPanel.Content>
      <Show
        when={props.card}
        fallback={
          <Show when={props.node}>
            {(node) => <NodePanel node={node()} cards={props.cards} historical={props.historical} />}
          </Show>
        }
      >
        {(card) => <CardPanel card={card()} driftSlugs={props.driftSlugs} />}
      </Show>
    </DetailPanel.Content>
  );
}

function NodePanel(props: { node: AtlasCanvasNode; cards: readonly AtlasCanvasCard[]; historical: boolean }) {
  const work = createMemo(() =>
    props.cards.filter((card) => card.under === props.node.path),
  );
  const migration = () => migrationLabel(props.node);
  return (
    <>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<SchemeIcon size={16} />}
            title={props.node.title}
            meta={
              <div class="atlas-panel-status">
                <Show when={!props.historical}>
                  <AtlasStatusMark status={props.node.status} />
                </Show>
                <Show when={migration()}>
                  <MigrationMark label={migration()} />
                </Show>
              </div>
            }
          />
          <DetailPanel.Section title="Intent">
            <Show
              when={props.node.intent}
              fallback={<p class="pw-detail-panel__text" data-empty>No intent yet.</p>}
            >
              <p class="pw-detail-panel__text whitespace-pre-wrap">{props.node.intent}</p>
            </Show>
          </DetailPanel.Section>
          <DetailPanel.Section title="Contract">
            <TextList items={props.node.invariants.map((item) => item.text)} empty="No invariants yet." />
            <Show when={migration()}>
              <p class="pw-detail-panel__text">
                In transition from {props.node.migrationFrom} to {props.node.migrationTo}. The invariants above say what
                applies where.
              </p>
            </Show>
          </DetailPanel.Section>
          <DetailPanel.Section title="Decisions">
            <TextList items={props.node.decisions} empty="No decisions yet." />
          </DetailPanel.Section>
          <DetailPanel.Section title="Reality">
            <p class="pw-detail-panel__text">
              {props.node.featureCount} features · {props.node.openQuestions} open questions
            </p>
            <Show when={props.node.repo || props.node.folder}>
              <p class="pw-detail-panel__text">
                Checkout {props.node.repo || "project root"}
                <Show when={props.node.folder}> · {props.node.folder}</Show>
              </p>
            </Show>
          </DetailPanel.Section>
          <DetailPanel.Section title="Work">
            <TextList
              items={work().map((card) => `${card.title} (${card.stage})`)}
              empty="No feature cards under this node."
            />
          </DetailPanel.Section>
        </DetailPanel.Main>
      </DetailPanel.Body>
    </>
  );
}

function CardPanel(props: { card: AtlasCanvasCard; driftSlugs: string[] }) {
  const status = () => cardStatus(props.card, props.driftSlugs);
  const openTasks = createMemo(() => props.card.tasks.filter((task) => task.state === "open"));
  const note = () => (props.card.kind === "architecture" ? "Architecture change" : undefined);
  return (
    <>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<ListChecks size={16} />}
            title={props.card.title}
            meta={
              <div class="atlas-panel-status">
                <AtlasStatusMark status={status()} note={note()} />
              </div>
            }
          />
          <DetailPanel.Section title="Intent">
            <Show
              when={props.card.intent}
              fallback={<p class="pw-detail-panel__text" data-empty>No intent yet.</p>}
            >
              <p class="pw-detail-panel__text whitespace-pre-wrap">{props.card.intent}</p>
            </Show>
          </DetailPanel.Section>
          <DetailPanel.Section title="Contract">
            <TextList items={props.card.invariants.map((item) => item.text)} empty="No invariants yet." />
          </DetailPanel.Section>
          <DetailPanel.Section title="Decisions">
            <TextList items={props.card.decisions} empty="No decisions yet." />
          </DetailPanel.Section>
          <DetailPanel.Section title="Reality">
            <p class="pw-detail-panel__text">Stage {props.card.stage}</p>
          </DetailPanel.Section>
          <DetailPanel.Section title="Work">
            <TextList
              items={openTasks().map((task) => task.title)}
              empty="No open tasks."
            />
          </DetailPanel.Section>
        </DetailPanel.Main>
      </DetailPanel.Body>
    </>
  );
}

function TextList(props: { items: string[]; empty: string }) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={<p class="pw-detail-panel__text" data-empty>{props.empty}</p>}
    >
      <ul class="m-0 grid list-none gap-1 p-0">
        <For each={props.items}>
          {(item) => <li class="pw-detail-panel__text">{item}</li>}
        </For>
      </ul>
    </Show>
  );
}
