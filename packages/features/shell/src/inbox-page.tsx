import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  Button,
  ActiveFilterBar,
  Dialog,
  DataTable,
  EntityContextMenu,
  EntityMenuButton,
  Field,
  FilterPopover,
  Input,
  PageContent,
  PageEmpty,
  PageLoading,
  PageToolbar,
  RefreshCw,
  Select,
  SearchBar,
  StatusDot,
  Bot,
  Check,
  Clock,
  Eye,
  GitCompare,
  Hammer,
  Pencil,
  ShieldCheck,
  StatusChip,
  Scale,
  ThumbsDownIcon,
  matchClauses,
  type FilterField,
  createEntityContextMenu,
  type EntityAction,
} from "@polterware/frontend-design-system";
import { createDetailPanelSelector, detailPanelStore } from "@polterware/frontend-state";
import { EntityDetailHost } from "./entity-detail-host";
import { createPageFilters } from "./page-filters";
import type { EnvironmentItem, ScopeNodeItem } from "./types";
import type { ScopeFilterToken } from "./scope-filter";
import { openDetail } from "./detail-expansion";
import { InboxItemDetail } from "./inbox-item-detail";
import type {
  WorkspaceInbox,
  WorkspaceInboxAction,
  WorkspaceInboxItem,
  WorkspaceInboxKind,
} from "./workspace-mocks";
import "./inbox-page.css";

const INBOX_SCOPE = "inbox:items";

const TYPE_FILTERS: { id: WorkspaceInboxKind; label: string }[] = [
  { id: "decision", label: "Decisions" },
  { id: "drift", label: "Drift" },
  { id: "verify", label: "Verify" },
];

const KIND_LABEL: Record<WorkspaceInboxKind, string> = {
  decision: "Decision",
  drift: "Drift",
  verify: "Verify",
};

const ACTION_LABEL: Record<WorkspaceInboxAction, string> = {
  decide: "Decide",
  delegate: "Delegate",
  defer: "Defer",
  fix_code: "Fix code",
  update_intent: "Update intent",
  ignore: "Ignore",
  verify: "Mark verified",
  reject: "Reject",
};

const ACTION_ICON = {
  decide: Check,
  delegate: Bot,
  defer: Clock,
  fix_code: Hammer,
  update_intent: Pencil,
  ignore: Eye,
  verify: ShieldCheck,
  reject: ThumbsDownIcon,
} as const;

const KIND_ICON = { decision: Scale, drift: GitCompare, verify: ShieldCheck } as const;

function statusLabel(item: WorkspaceInboxItem): string {
  const kind = KIND_LABEL[item.kind];
  if (item.state === "deferred") return `Deferred ${kind.toLowerCase()}`;
  return item.blocking ? `Blocking ${kind.toLowerCase()}` : kind;
}

/** Inbox — a table of Decision, Drift, and Verify items derived from project data. */
export function InboxPage(props: {
  inbox?: WorkspaceInbox;
  loading?: boolean;
  onResolve?: (item: WorkspaceInboxItem, action: WorkspaceInboxAction, answer?: string) => Promise<void>;
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
  const [deciding, setDeciding] = createSignal<WorkspaceInboxItem | null>(null);
  const [answer, setAnswer] = createSignal("");
  const [query, setQuery] = createSignal("");

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
        { id: "deferred", label: "Deferred", tone: "muted" as const },
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

  createEffect(() => {
    detailPanelStore.getState().registerCollection({
      scopeId: INBOX_SCOPE,
      status: props.loading ? "loading" : "ready",
      targets: rows().map((item) => ({ scopeId: INBOX_SCOPE, entityId: item.id, entityKind: "inbox-item" })),
      selectFirst: false,
    });
  });
  onCleanup(() => detailPanelStore.getState().unregisterCollection(INBOX_SCOPE));

  async function run(item: WorkspaceInboxItem, action: WorkspaceInboxAction, value?: string) {
    if (action === "decide" && value === undefined) {
      setAnswer(item.options[0] ?? "");
      setDeciding(item);
      return;
    }
    setPending(item.id);
    try {
      await props.onResolve?.(item, action, value);
      if (action === "decide") setDeciding(null);
    } catch {
      // The host reports the failure; the dialog stays open to retry.
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
          onSelect: () => void run(item, action),
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
        class={[item().state === "deferred" ? "pw-inbox-row--deferred" : "", selectedItem()?.id === item().id ? "pw-data-table-row--active" : ""].filter(Boolean).join(" ") || undefined}
        onActivate={() => openDetail({ scopeId: INBOX_SCOPE, entityId: item().id, entityKind: "inbox-item" })}
      >
        <DataTable.PrimaryCell
          icon={(() => {
            const Icon = KIND_ICON[item().kind];
            return <Icon size={14} aria-hidden />;
          })()}
          iconTone={item().blocking && item().state === "open" ? "security" : "neutral"}
          iconSeed={item().id}
          title={item().title}
        />
        <DataTable.Cell>{KIND_LABEL[item().kind]}</DataTable.Cell>
        <DataTable.Cell>
          <StatusChip tone={item().state === "deferred" ? "muted" : item().blocking ? "danger" : "muted"}>
            {item().state === "deferred" ? "Deferred" : item().blocking ? "Blocking" : "Open"}
          </StatusChip>
        </DataTable.Cell>
        <DataTable.Cell class="pw-inbox-context">{item().where || "—"}</DataTable.Cell>
        <DataTable.Cell class="pw-inbox-source">{item().source || "—"}</DataTable.Cell>
        <DataTable.Cell align="right" class="pw-inbox-actions">
          <EntityMenuButton label={`Actions for ${item().title}`} actions={itemActions(item())} />
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
            <Button variant="texture" size="icon" aria-label={checking() ? "Checking drift…" : "Check drift"} disabled={checking()} onClick={() => void checkDrift()}>
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
          <DataTable.Root rows={rows()} getRowId={(item) => item.id} columnWidthsKey="inbox" class="pw-inbox-table">
            <DataTable.Table aria-label="Inbox items">
              <DataTable.Header>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="title" width="38%">Item</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="kind" sortBy={(item) => KIND_LABEL[item.kind]}>Type</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="status" sortBy={statusLabel}>Status</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="where">Context</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="source">Source</DataTable.ColumnHeader>
                <DataTable.ColumnHeader<WorkspaceInboxItem> id="actions" width="44px" align="right" sortable={false} resizable={false}><span class="sr-only">Actions</span></DataTable.ColumnHeader>
              </DataTable.Header>
              <DataTable.Body<WorkspaceInboxItem>>
                {(item) => <Row item={item} />}
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
          <EntityContextMenu menu={rowMenu} />
        </Show>
      </PageContent>

      <Show when={selectedItem()}>
        {(item) => (
          <InboxItemDetail
            item={item()}
            disabled={pending() !== "" || !props.onResolve}
            onAction={(action) => void run(item(), action)}
          />
        )}
      </Show>

      <Dialog
        open={deciding() !== null}
        title="Decide"
        description={deciding()?.title}
        size="sm"
        onClose={() => setDeciding(null)}
        footer={
          <>
            <Button variant="texture" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={answer().trim() === "" || pending() !== ""}
              onClick={() => {
                const item = deciding();
                if (item) void run(item, "decide", answer().trim());
              }}
            >
              {pending() !== "" ? "Saving…" : "Record decision"}
            </Button>
          </>
        }
      >
        <Show
          when={(deciding()?.options.length ?? 0) > 0}
          fallback={
            <Field label="Answer">
              <Input value={answer()} onInput={(event) => setAnswer(event.currentTarget.value)} />
            </Field>
          }
        >
          <Field label="Answer">
            <Select
              aria-label="Answer"
              value={answer()}
              onChange={setAnswer}
              options={(deciding()?.options ?? []).map((option) => ({ value: option, label: option }))}
            />
          </Field>
        </Show>
      </Dialog>
    </EntityDetailHost>
  );
}
