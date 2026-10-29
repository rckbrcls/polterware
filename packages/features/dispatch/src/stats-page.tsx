import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import {
  AiBrain01Icon,
  CalendarClock,
  Card,
  Clock,
  Cloud,
  DataTable,
  Gauge,
  GridTableIcon,
  IconTile,
  type DataTableSortState,
  PageContent,
  PageEmpty,
  ProgressBar,
  SparkChart,
  ThumbsDownIcon,
  pushToast,
  type IconTileTone,
} from "@polterware/frontend-design-system";
import { dispatchBridge, mapDispatchStats } from "./dispatch-bridge";
import type { DispatchStatRankView, DispatchStatsRowView, DispatchStatsView } from "./dispatch-types";

/** Re-measure frozen table columns only when the container crosses a layout breakpoint. */
export function DispatchTable<T>(props: {
  rows: readonly T[];
  getRowId: (row: T) => string;
  virtualized?: boolean;
  children: (compact: boolean) => JSX.Element;
}) {
  const [compact, setCompact] = createSignal(false);
  const [sort, setSort] = createSignal<DataTableSortState>(null);
  let container!: HTMLDivElement;
  onMount(() => {
    const measure = () => {
      // Read the viewport, never the table's intrinsic or frozen column width.
      const width = container.querySelector<HTMLDivElement>(".pw-data-table-scroll")?.clientWidth;
      if (width !== undefined && width > 0) setCompact(width < 560);
    };
    measure();
    const observer = new ResizeObserver(measure);
    // The wrapper survives the table remount when the column set changes.
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div ref={container} class="h-full w-full min-w-0 max-w-full">
      <For each={[compact()]}>
        {(narrow) => (
          <DataTable.Root
            class={narrow ? "min-w-0 [&_.pw-data-table]:!min-w-0 [&_.pw-data-table]:table-fixed [&_.pw-data-table-cell-content]:whitespace-normal [&_.pw-data-table-cell-content]:[overflow-wrap:anywhere]" : "min-w-0"}
            rows={props.rows}
            getRowId={props.getRowId}
            virtualized={props.virtualized}
            sort={sort()}
            onSortChange={setSort}
          >
            {props.children(narrow)}
          </DataTable.Root>
        )}
      </For>
    </div>
  );
}

export const DISPATCH_STATS_BY_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "model", label: "Model" },
  { value: "agent", label: "Agent" },
  { value: "provider", label: "Provider" },
  { value: "tier", label: "Tier" },
];

export const DISPATCH_STATS_SINCE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const CHART_TOKENS = [
  "--color-chart-cyan",
  "--color-chart-blue",
  "--color-chart-green",
  "--color-chart-amber",
  "--color-chart-red",
  "--color-chart-violet",
] as const;

function emptyRank(): DispatchStatRankView {
  return { key: "", runs: 0, samples: 0, reason: "No runs in range" };
}

function emptyStats(): DispatchStatsView {
  return {
    by: "day",
    since: "7d",
    inFlight: 0,
    rows: [],
    rankings: {
      mostUsedModel: emptyRank(),
      mostUsedProvider: emptyRank(),
      slowestModel: emptyRank(),
      mostFailedModel: emptyRank(),
    },
  };
}

export function formatDurationMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return "unknown";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function displayKey(key: string): string {
  if (!key || key === "desconhecido") return "Unknown";
  return key;
}

function RankingCard(props: {
  title: string;
  icon: JSX.Element;
  tone: IconTileTone;
  rank: DispatchStatRankView;
  detail: (rank: DispatchStatRankView) => string;
}) {
  const hasReason = () => Boolean(props.rank.reason.trim()) || !props.rank.key || props.rank.key === "desconhecido";
  return (
    <Card class="flex h-full min-w-0 items-start gap-3 p-3.5">
      <IconTile size={28} tone={props.tone} seed={props.title} class="shrink-0">{props.icon}</IconTile>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-[11.5px] font-medium text-[var(--color-text-muted)]">{props.title}</span>
        <span class="truncate font-mono text-[14px] font-semibold text-[var(--color-text-primary)]">
          {hasReason() ? "Unknown" : displayKey(props.rank.key)}
        </span>
      </div>
      <span class="max-w-[45%] self-center text-right text-[12px] leading-5 text-[var(--color-text-secondary)]">
        {props.rank.reason.trim() ? props.rank.reason : props.detail(props.rank)}
      </span>
    </Card>
  );
}

export function DispatchStatsPage(props: {
  projectId: string;
  by: string;
  since: string;
  onInFlight?: (count: number) => void;
}) {
  const [stats, setStats] = createSignal<DispatchStatsView>(emptyStats());

  const load = async () => {
    const bridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if (!bridge || !projectId) {
      setStats(emptyStats());
      props.onInFlight?.(0);
      return;
    }
    try {
      const raw = await bridge.stats({ projectId, by: props.by, since: props.since });
      const next = mapDispatchStats(raw);
      setStats(next);
      props.onInFlight?.(next.inFlight);
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load dispatch stats.", "danger");
    }
  };

  onMount(() => void load());

  createEffect(
    on(
      () => [props.projectId, props.by, props.since] as const,
      () => {
        void load();
      },
      { defer: true },
    ),
  );

  const isTimeSeries = () => props.by === "day" || props.by === "week";
  const seriesValues = createMemo(() => stats().rows.map((row) => row.runs));
  const maxRuns = createMemo(() =>
    Math.max(1, ...stats().rows.map((row) => row.runs)),
  );

  return (
    <PageContent class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <Show when={stats().rows.length > 0}>
        <div class="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RankingCard
            title="Most used model"
            icon={<AiBrain01Icon size={14} aria-hidden />}
            tone="execution"
            rank={stats().rankings.mostUsedModel}
            detail={(r) => `${r.runs} run(s)`}
          />
          <RankingCard
            title="Most used provider"
            icon={<Cloud size={14} aria-hidden />}
            tone="integration"
            rank={stats().rankings.mostUsedProvider}
            detail={(r) => `${r.runs} run(s)`}
          />
          <RankingCard
            title="Slowest model"
            icon={<Clock size={14} aria-hidden />}
            tone="observability"
            rank={stats().rankings.slowestModel}
            detail={(r) => `p50 ${formatDurationMs(r.p50Ms)} (${r.samples} samples)`}
          />
          <RankingCard
            title="Most failed model"
            icon={<ThumbsDownIcon size={14} aria-hidden />}
            tone="security"
            rank={stats().rankings.mostFailedModel}
            detail={(r) =>
              r.successPct !== undefined
                ? `${r.successPct.toFixed(1)}% success (${r.runs} runs)`
                : `${r.runs} run(s)`
            }
          />
        </div>
        </Show>

        <Show when={stats().rows.length > 0}>
          <Show
            when={isTimeSeries()}
            fallback={
              <Card class="flex flex-col gap-2.5 p-4">
                <div class="flex items-center gap-2 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                  <IconTile size={24} tone="execution" seed="dispatch-runs-by-group" class="shrink-0"><Gauge size={12} aria-hidden /></IconTile>
                  Runs by {props.by}
                </div>
                <div class="flex flex-col gap-2">
                  <For each={stats().rows}>
                    {(row, index) => {
                      const token = () => CHART_TOKENS[index() % CHART_TOKENS.length] ?? "--color-chart-cyan";
                      const pct = () => Math.min(100, Math.max(2, (row.runs / maxRuns()) * 100));
                      return (
                        <div class="flex flex-col gap-1">
                          <div class="flex items-center justify-between gap-2 text-[12px]">
                            <span class="truncate font-mono text-[var(--color-text-primary)]">
                              {displayKey(row.key)}
                            </span>
                            <span class="tabular-nums text-[var(--color-text-secondary)]">
                              {row.runs} run(s)
                            </span>
                          </div>
                          <ProgressBar
                            label={`${displayKey(row.key)} runs`}
                            value={pct()}
                            aria-valuetext={`${row.runs} runs`}
                            class="w-full"
                            style={{ "--progress-bar-color": `var(${token()})` }}
                          />
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Card>
            }
          >
            <Card class="flex min-w-0 flex-col gap-3 p-4 pb-5">
              <div class="flex items-center gap-2 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
                <IconTile size={24} tone="observability" seed="dispatch-runs-over-time" class="shrink-0"><CalendarClock size={12} aria-hidden /></IconTile>
                Runs over time ({props.by})
              </div>
              <SparkChart
                series={seriesValues()}
                label={`Runs by ${props.by}`}
                strokeToken="--color-chart-cyan"
                height={128}
                padding={[8, 12, 20, 8]}
              />
            </Card>
          </Show>
        </Show>

      <Card class="flex min-w-0 flex-col gap-3 p-4">
        <div class="flex items-center gap-2 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
          <IconTile size={24} tone="data" seed="dispatch-stats-breakdown" class="shrink-0"><GridTableIcon size={12} aria-hidden /></IconTile>
          Breakdown by {props.by}
        </div>
        <DispatchTable rows={stats().rows} getRowId={(row) => row.key}>
          {(compact) => (
            <DataTable.Table aria-label="Dispatch statistics">
              <DataTable.Header>
                <DataTable.ColumnHeader<DispatchStatsRowView> id="key" sortBy={(row) => row.key}>
                  Group
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader<DispatchStatsRowView>
                  id="runs"
                  align="right"
                  width="4.25rem"
                  minWidth={56}
                  sortBy={(row) => row.runs}
                >
                  Runs
                </DataTable.ColumnHeader>
                <DataTable.ColumnHeader<DispatchStatsRowView>
                  id="success"
                  align="right"
                  width="5.25rem"
                  minWidth={84}
                  sortBy={(row) => row.successPct}
                >
                  Success
                </DataTable.ColumnHeader>
                <Show when={!compact}>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="firstTry"
                    align="right"
                    width="5.25rem"
                    minWidth={84}
                    sortBy={(row) => row.firstTryPct}
                  >
                    First try
                  </DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="p50"
                    align="right"
                    width="6rem"
                    minWidth={96}
                    sortBy={(row) => row.p50Ms ?? -1}
                  >
                    p50
                  </DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="p90"
                    align="right"
                    width="6rem"
                    minWidth={96}
                    sortBy={(row) => row.p90Ms ?? -1}
                  >
                    p90
                  </DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="fallbacks"
                    align="right"
                    width="5.5rem"
                    minWidth={88}
                    sortBy={(row) => row.fallbacks}
                  >
                    Fallbacks
                  </DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="rateLimits"
                    align="right"
                    width="6rem"
                    minWidth={96}
                    sortBy={(row) => row.rateLimits}
                  >
                    Rate limits
                  </DataTable.ColumnHeader>
                  <DataTable.ColumnHeader<DispatchStatsRowView>
                    id="orphans"
                    align="right"
                    width="5rem"
                    minWidth={80}
                    sortBy={(row) => row.orphans}
                  >
                    Orphans
                  </DataTable.ColumnHeader>
                </Show>
              </DataTable.Header>
              <DataTable.Body<DispatchStatsRowView>>
                {(row) => (
                  <DataTable.Row row={row} rowId={row.key}>
                    <DataTable.Cell wrap>
                      <div class="min-w-0 [overflow-wrap:anywhere]">
                        <span class="font-mono text-[12px]">{displayKey(row.key)}</span>
                        <Show when={compact}>
                          <div class="mt-1 text-[11px] leading-4 text-[var(--color-text-muted)]">
                            First try {row.firstTryPct.toFixed(1)}% · p50 {formatDurationMs(row.p50Ms)} · p90 {formatDurationMs(row.p90Ms)}
                            <br />
                            {row.fallbacks} fallbacks · {row.rateLimits} rate limits · {row.orphans} orphans
                          </div>
                        </Show>
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell align="right">
                      <span class="tabular-nums">{row.runs}</span>
                    </DataTable.Cell>
                    <DataTable.Cell align="right">
                      <span class="tabular-nums">{row.successPct.toFixed(1)}%</span>
                    </DataTable.Cell>
                    <Show when={!compact}>
                      <DataTable.Cell align="right">
                        <span class="tabular-nums">{row.firstTryPct.toFixed(1)}%</span>
                      </DataTable.Cell>
                      <DataTable.Cell align="right" class="whitespace-nowrap">
                        <span class="font-mono text-[12px] tabular-nums">{formatDurationMs(row.p50Ms)}</span>
                      </DataTable.Cell>
                      <DataTable.Cell align="right" class="whitespace-nowrap">
                        <span class="font-mono text-[12px] tabular-nums">{formatDurationMs(row.p90Ms)}</span>
                      </DataTable.Cell>
                      <DataTable.Cell align="right">
                        <span class="tabular-nums">{row.fallbacks}</span>
                      </DataTable.Cell>
                      <DataTable.Cell align="right">
                        <span class="tabular-nums">{row.rateLimits}</span>
                      </DataTable.Cell>
                      <DataTable.Cell align="right">
                        <span class="tabular-nums">{row.orphans}</span>
                      </DataTable.Cell>
                    </Show>
                  </DataTable.Row>
                )}
              </DataTable.Body>
              <DataTable.Empty>
                <PageEmpty
                  title="No stats yet"
                  mood="sleeping"
                />
              </DataTable.Empty>
            </DataTable.Table>
          )}
        </DispatchTable>
      </Card>
      </PageContent>
  );
}
