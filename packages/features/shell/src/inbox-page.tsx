import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  Button,
  ActiveFilterBar,
  DataTable,
  EntityContextMenu,
  FilterPopover,
  PageContent,
  PageEmpty,
  PageLoading,
  PageToolbar,
  RefreshCw,
  SearchBar,
  StatusDot,
  Bot,
  Check,
  Clock,
  Eye,
  GitCompare,
  Link,
  Undo2,
  ShieldCheck,
  StatusChip,
  Scale,
  matchClauses,
  type FilterField,
  createEntityContextMenu,
  type EntityAction,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore, isTypingTarget, matchesShortcut } from "@polterware/frontend-state";
import { EntityDetailHost } from "./entity-detail-host";
import { createPageFilters } from "./page-filters";
import type { EnvironmentItem, ScopeNodeItem } from "./types";
import type { ScopeFilterToken } from "./scope-filter";
import { InboxItemDetail, type InboxActionRequest } from "./inbox-item-detail";
import { keyActionTargets, sharedInboxActions } from "./inbox-actions";
import type {
  WorkspaceInbox,
  WorkspaceInboxAction,
  WorkspaceInboxItem,
  WorkspaceInboxKind,
} from "./workspace-mocks";
import "./inbox-page.css";

const INBOX_SCOPE = "inbox:items";

const TYPE_FILTERS: { id: WorkspaceInboxKind; label: string }[] = [
  { id: "decision", label: "Questions" },
  { id: "drift", label: "Commits" },
  { id: "setup", label: "Setup" },
];

const KIND_LABEL: Record<WorkspaceInboxKind, string> = {
  decision: "Question",
  drift: "Commit",
  setup: "Setup",
};

const ACTION_LABEL: Record<WorkspaceInboxAction, string> = {
  decide: "Decide",
  delegate: "Delegate",
  defer: "Later",
  link: "Link",
  reopen: "Reopen",
  ignore: "Dismiss",
};

const ACTION_ICON = {
  decide: Check,
  delegate: Bot,
  defer: Clock,
  link: Link,
  reopen: Undo2,
  ignore: Eye,
} as const;

const KIND_ICON = { decision: Scale, drift: GitCompare, setup: ShieldCheck } as const;

function statusLabel(item: WorkspaceInboxItem): string {
  const kind = KIND_LABEL[item.kind];
  if (item.state === "deferred") return `${kind} for later`;
  return item.blocking ? `Blocking ${kind.toLowerCase()}` : kind;
}

/** The Inbox's sections, in triage order. */
const KIND_GROUPS = TYPE_FILTERS.map((option) => {
  const Icon = KIND_ICON[option.id];
  return { id: option.id, label: option.label, icon: <Icon size={14} aria-hidden /> };
});

/**
 * Inbox — master/detail, as in Linear: Question, Commit, and Setup items grouped by kind on
 * the left, the active item's detail on the right (it closes, and a row opens it again). H defers and D dismisses the active
 * item (or the selection), and the next item takes its place.
 */
export function InboxPage(props: {
  inbox?: WorkspaceInbox;
  loading?: boolean;
  onResolve?: (item: WorkspaceInboxItem, action: WorkspaceInboxAction, answer?: string) => Promise<void>;
  /** One action on every selected item; the host refreshes once. */
  onResolveMany?: (items: WorkspaceInboxItem[], action: WorkspaceInboxAction) => Promise<void>;
  scopeTokens?: readonly ScopeFilterToken[];
  scopeNodes?: readonly ScopeNodeItem[];
  scopeEnvironments?: readonly EnvironmentItem[];
  onScopeTokensChange?: (tokens: ScopeFilterToken[]) => void;
  /** Re-reads the checkout so Drift items reflect files changed outside Polterware. */
  onCheckDrift?: () => Promise<void>;
}) {
  const [pending, setPending] = createSignal("");
  const [checking, setChecking] = createSignal(false);
  async function checkDrift() {
    if (!props.onCheckDrift || checking()) return;
    setChecking(true);
    try {
      await props.onCheckDrift();
    } finally {
      setChecking(false);
    }
  }
  // The row menu opens an action's confirm in the detail instead of running it.
  const [request, setRequest] = createSignal<InboxActionRequest | null>(null);
  let requests = 0;
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  async function runMany(selection: readonly WorkspaceInboxItem[], action: WorkspaceInboxAction, clear: () => void) {
    if (!props.onResolveMany || pending()) return;
    setPending("bulk");
    try {
      await props.onResolveMany([...selection], action);
      clear();
    } catch {
      // The host reports the failure; the selection stays to retry.
    } finally {
      setPending("");
    }
  }

  const items = () => props.inbox?.items ?? [];
  const countOf = (kind: WorkspaceInboxKind) =>
    items().filter((item) => item.state === "open" && item.kind === kind).length;
  const itemStatus = (item: WorkspaceInboxItem) =>
    item.state === "deferred" ? "deferred" : item.blocking ? "blocking" : "open";
  const fields = (): FilterField[] => [
    {
      id: "type",
      label: "Type",
      kind: "multi",
      icon: () => <Scale size={14} aria-hidden />,
      options: TYPE_FILTERS.map((option) => {
        const Icon = KIND_ICON[option.id];
        return {
          id: option.id,
          label: option.label,
          trailing: String(countOf(option.id)),
          icon: () => <Icon size={14} aria-hidden />,
        };
      }),
    },
    {
      id: "status",
      label: "Status",
      pluralLabel: "statuses",
      kind: "multi",
      icon: () => <StatusDot tone="ok" showLabel={false} />,
      options: [
        { id: "blocking", label: "Blocking", tone: "danger" as const },
        { id: "open", label: "Open", tone: "ok" as const },
        { id: "deferred", label: "Later", tone: "muted" as const },
      ].map((option) => ({
        id: option.id,
        label: option.label,
        icon: () => <StatusDot tone={option.tone} showLabel={false} />,
      })),
    },
  ];
  const filters = createPageFilters({
    surface: "inbox",
    fields,
    scope: {
      tokens: () => props.scopeTokens ?? [],
      nodes: () => props.scopeNodes ?? [],
      environments: () => props.scopeEnvironments ?? [],
      allowEnv: false,
      onTokensChange: (tokens) => props.onScopeTokensChange?.(tokens),
    },
  });
  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return items().filter(
      (item) =>
        matchClauses(item, filters.pageClauses(), { type: (entry) => entry.kind, status: itemStatus }) &&
        (!needle || [item.title, item.where, item.source].some((value) => (value ?? "").toLowerCase().includes(needle))),
    );
  });
  const open = () => visible().filter((item) => item.state === "open");
  const deferred = () => visible().filter((item) => item.state === "deferred");
  const rows = createMemo(() => [...open(), ...deferred()]);

  const activeTarget = createDetailPanelSelector((state) => state.activeTarget);
  const selectedItem = createMemo(() => {
    const target = activeTarget();
    return target?.scopeId === INBOX_SCOPE ? rows().find((item) => item.id === target.entityId) : undefined;
  });

  /** Rows in display order: grouped by kind, open before deferred within each group. */
  const ordered = createMemo(() => KIND_GROUPS.flatMap((group) => rows().filter((item) => item.kind === group.id)));
  const markActive = (id: string) =>
    detailPanelStore.getState().activateTarget({ scopeId: INBOX_SCOPE, entityId: id, entityKind: "inbox-item" });

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: INBOX_SCOPE,
      status: props.loading ? "loading" : "ready",
      targets: ordered().map((item) => ({ scopeId: INBOX_SCOPE, entityId: item.id, entityKind: "inbox-item" })),
      selectFirst: true,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(INBOX_SCOPE));

  // Like Activity, the detail stays closed until a row is opened (click, Enter, or J/K after one is open).

  // When the active item leaves (resolved, deferred out of a filter), the one now at its place takes over.
  let activeIndex = 0;
  createEffect(() => {
    const list = ordered();
    const target = activeTarget();
    const index = target?.scopeId === INBOX_SCOPE ? list.findIndex((item) => item.id === target.entityId) : -1;
    if (index >= 0) {
      activeIndex = index;
      return;
    }
    if (props.loading || list.length === 0) return;
    markActive(list[Math.min(activeIndex, list.length - 1)]!.id);
  });

  // H moves to Later and D dismisses the selection, or the active item, when they offer it.
  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || isTypingTarget(event.target) || pending()) return;
    const action: WorkspaceInboxAction | null = matchesShortcut("inbox.defer", event)
      ? "defer"
      : matchesShortcut("inbox.dismiss", event) ? "ignore" : null;
    if (!action || !props.onResolve) return;
    const selection = ordered().filter((item) => selected().has(item.id));
    const targets = keyActionTargets(selection, selectedItem(), action);
    if (targets.length === 0) return;
    event.preventDefault();
    // The item after the last one acted on takes over, even when a deferred item stays listed.
    const list = ordered();
    const done = new Set(targets.map((item) => item.id));
    const last = Math.max(...targets.map((item) => list.indexOf(item)));
    const next = list.slice(last + 1).find((item) => !done.has(item.id)) ?? list.find((item) => !done.has(item.id));
    const write = selection.length > 0
      ? runMany(targets, action, () => setSelected(new Set<string>()))
      : run(targets[0]!, action);
    void write.then(() => {
      if (next && ordered().some((item) => item.id === next.id)) markActive(next.id);
    }, () => undefined);
  }
  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  /** Runs one action; it rejects when the write fails (the host reports it), so a confirm can stay open. */
  async function run(item: WorkspaceInboxItem, action: WorkspaceInboxAction, value?: string) {
    setPending(item.id);
    try {
      await props.onResolve?.(item, action, value);
    } finally {
      setPending("");
    }
  }

  const rowMenu = createEntityContextMenu();
  const itemActions = (item: WorkspaceInboxItem): EntityAction[] =>
    props.onResolve
      ? item.actions.map((action) => ({
          id: action,
          label: ACTION_LABEL[action],
          icon: ACTION_ICON[action],
          disabled: pending() !== "",
          onSelect: () => {
            markActive(item.id);
            setRequest({ itemId: item.id, action, nonce: ++requests });
          },
        }))
      : [];

  function Row(rowProps: { item: WorkspaceInboxItem }) {
    const item = () => rowProps.item;
    return (
      <DataTable.Row
        onContextMenu={(event) => rowMenu.open(event, itemActions(item()))}
        row={item()}
        rowId={item().id}
        aria-label={statusLabel(item())}
        class={item().state === "deferred" ? "pw-inbox-row--deferred" : undefined}
      >
        <Show when={props.onResolveMany}>
          <DataTable.SelectionCell rowId={item().id} label={`Select ${item().title}`} />
        </Show>
        <DataTable.PrimaryCell
          icon={(() => {
            const Icon = KIND_ICON[item().kind];
            return <Icon size={14} aria-hidden />;
          })()}
          iconTone={item().blocking && item().state === "open" ? "security" : "neutral"}
          iconSeed={item().id}
          title={item().title}
        />
        <DataTable.Cell>
          <StatusChip tone={item().state === "deferred" ? "muted" : item().blocking ? "danger" : "muted"}>
            {item().state === "deferred" ? "Later" : item().blocking ? "Blocking" : "Open"}
          </StatusChip>
        </DataTable.Cell>
      </DataTable.Row>
    );
  }

  return (
    <EntityDetailHost>
      <PageToolbar.Root>
        <PageToolbar.Leading>{null}</PageToolbar.Leading>
        <PageToolbar.Actions>
          <SearchBar placeholder="Search inbox" value={query()} onInput={setQuery} aria-label="Search inbox" />
          <FilterPopover
            ariaLabel="Inbox filters"
            title="Filter inbox"
            shortcut
            fields={filters.fields()}
            clauses={filters.clauses()}
            onClausesChange={filters.onClausesChange}
            saved={filters.saved()}
          />
          <Show when={props.onCheckDrift}>
            <Button variant="texture" size="icon" aria-label={checking() ? "Checking commits…" : "Check commits"} disabled={checking()} onClick={() => void checkDrift()}>
              <RefreshCw size={14} />
            </Button>
          </Show>
        </PageToolbar.Actions>
      </PageToolbar.Root>
      <ActiveFilterBar
        fields={filters.fields()}
        clauses={filters.clauses()}
        onClausesChange={filters.onClausesChange}
        saved={filters.saved()}
      />
      <PageContent class="p-0">
        <Show
          when={visible().length > 0}
          fallback={
            <Show
              when={!props.loading}
              fallback={<PageLoading layout="table" label="Loading the Inbox…" />}
            >
              <div class="flex h-full min-h-[200px] w-full items-center justify-center p-8">
                <PageEmpty
                  title="All quiet"
                  mood="sleeping"
                />
              </div>
            </Show>
          }
        >
          <DataTable.Root
            rows={ordered()}
            getRowId={(item) => item.id}
            columnWidthsKey="inbox"
            class="pw-inbox-table"
            density="list"
            grouping={{ by: (item) => item.kind, groups: KIND_GROUPS, showEmpty: false }}
            activeRowId={selectedItem()?.id ?? null}
            onActiveRowChange={(id) => { if (id) markActive(id); }}
            followFocus
            selectionMode={props.onResolveMany ? "multiple" : "none"}
            selectedRowIds={selected()}
            onSelectionChange={setSelected}
          >
            <DataTable.Table aria-label="Inbox items">
              <DataTable.Header>
                <Show when={props.onResolveMany}><DataTable.SelectionCell /></Show>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="title">Item</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="status" width="112px" sortBy={statusLabel}>Status</DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<WorkspaceInboxItem>>
                {(item) => <Row item={item} />}
              </DataTable.Body>
            </DataTable.Table>
            <Show when={props.onResolveMany}>
              <DataTable.SelectionToolbar<WorkspaceInboxItem>
                hasActions={(selection) => sharedInboxActions(selection.selectedRows()).length > 0}
                emptyActionsLabel="No action fits every selected item"
              >
                {(selection) => (
                  <For each={sharedInboxActions(selection.selectedRows())}>
                    {(action) => {
                      const Icon = ACTION_ICON[action];
                      return (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending() !== ""}
                          onClick={() => void runMany(selection.selectedRows(), action, selection.clearSelection)}
                        >
                          <Icon size={14} />
                          {ACTION_LABEL[action]}
                        </Button>
                      );
                    }}
                  </For>
                )}
              </DataTable.SelectionToolbar>
            </Show>
          </DataTable.Root>
          <EntityContextMenu menu={rowMenu} />
        </Show>
      </PageContent>

      <Show when={selectedItem()}>
        {(item) => (
          <InboxItemDetail
            item={item()}
            disabled={pending() !== "" || !props.onResolve}
            onAction={(action, answer) => run(item(), action, answer)}
            request={request()}
          />
        )}
      </Show>
    </EntityDetailHost>
  );
}
