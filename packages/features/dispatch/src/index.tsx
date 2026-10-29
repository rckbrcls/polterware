import { For, Index, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { BotAvatar, agentMarkFor, botAvatarTypes, type BotAvatarType } from "@polterware/bot-avatars";
import { EntityDetailHost, createPageFilters, type PageFilters } from "@polterware/feature-shell";
import {
  Bot,
  Button,
  Card,
  Cpu,
  DetailPanel,
  Dialog,
  Field,
  FilterPopover,
  FloatingWindow,
  FileDiff,
  FileText,
  Gauge,
  GitBranch,
  Input,
  PageContent,
  PageEmpty,
  PageToolbar,
  SearchBar,
  Tabs,
  MarkdownEditor,
  RailGroup,
  RailPage,
  InformationCircle,
  Play,
  Plus,
  ProgressBar,
  Route,
  RefreshCw,
  Select,
  SegmentDisplay,
  Settings,
  ShieldCheck,
  Skeleton,
  SparkChart,
  StatusChip,
  Stop,
  Textarea,
  ToolbarIconButton,
  pushToast,
  ActiveFilterBar,
  matchClauses,
  type FilterField,
} from "@polterware/frontend-design-system";
import { detailPanelStore } from "@polterware/frontend-state";
import {
  dispatchBridge,
  dispatchStatusTone,
  formatUsedPercent,
  mapCheckTiersProblems,
  mapDispatchAgents,
  mapDispatchCapacity,
  mapDispatchQuotaSnapshots,
  mapDispatchResult,
  mapDispatchRun,
  mapDispatchRuns,
  mapDispatchTiers,
  mapDispatchModels,
  mapDispatchWorktrees,
  worktreeDisplayStatus,
} from "./dispatch-bridge";
import type {
  DispatchAgentView,
  DispatchCapacityView,
  DispatchModelView,
  DispatchQuotaSnapshotView,
  DispatchRunEventView,
  DispatchRunView,
  DispatchTab,
  DispatchTierView,
  DispatchWatchEventView,
  DispatchWorktreeView,
} from "./dispatch-types";
import { runReviewAction } from "./dispatch-bridge";
import { buildTranscript, type TranscriptEntry } from "./run-log";
import { DispatchLearningPage } from "./learning-page";
import { TierBoard, TierModelPalette } from "./tier-board";
import { placeTierCard } from "./tier-board-model";
import { DISPATCH_STATS_BY_OPTIONS, DISPATCH_STATS_SINCE_OPTIONS, DispatchStatsPage } from "./stats-page";

export * from "./dispatch-types";
export * from "./dispatch-bridge";
export { DispatchLearningPage } from "./learning-page";
export { DispatchStatsPage } from "./stats-page";

const DISPATCH_RUNS_SCOPE = "dispatch:runs";

const DEFAULT_TIER_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

function normalizeDispatchTab(tab?: string): DispatchTab {
  if (
    tab === "agents"
    || tab === "tiers"
    || tab === "learning"
    || tab === "stats"
  ) {
    return tab;
  }
  return "runs";
}

function isRunActive(status: string): boolean {
  const s = status.toLowerCase();
  return s === "pending" || s === "running";
}

function parseTime(value: string): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatAgo(value: string, now: number): string {
  const time = parseTime(value);
  if (time === undefined) return "—";
  return `${formatDuration(now - time)} ago`;
}

/** Stored measurement only. Unknown stays unset, including a missing zero. */
function measuredDuration(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return formatDuration(ms);
}

function routeLabel(run: DispatchRunView): string | undefined {
  const parts = [run.tier, run.effort].map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function timingLabel(run: DispatchRunView): string | undefined {
  const parts: string[] = [];
  if (run.queuedMs !== undefined) parts.push(`queue ${formatDuration(run.queuedMs)}`);
  if (run.runMs !== undefined) parts.push(`exec ${formatDuration(run.runMs)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function modelLabel(run: DispatchRunView): string | undefined {
  const text = dotted(run.agent, run.model, run.provider);
  return text === "—" ? undefined : text;
}

type AgentAttemptCard = {
  key: string;
  agent: string;
  title: string;
  status: string;
  error: string;
  durationMs?: number;
  final: boolean;
};

/** Failed attempts in order, then the agent that finished the run. */
function agentAttemptCards(run: DispatchRunView): AgentAttemptCard[] {
  const finalAgent = run.agent.trim() || "agent";
  const cards: AgentAttemptCard[] = run.attempts.map((attempt, index) => {
    const agent = attempt.agent.trim() || "agent";
    const final = index === run.attempts.length - 1 && agent === finalAgent;
    return {
      key: `${run.id}:attempt:${index}`,
      agent,
      title: dotted(agent, attempt.model),
      status: final ? run.status || "unknown" : "failed",
      error: attempt.error.trim() || (final ? run.error.trim() : ""),
      durationMs: attempt.durationMs,
      final,
    };
  });
  const last = cards[cards.length - 1];
  if (!last?.final) {
    cards.push({
      key: `${run.id}:final`,
      agent: finalAgent,
      title: dotted(finalAgent, run.model, run.provider),
      status: run.status || "unknown",
      error: run.error.trim(),
      durationMs: run.runMs,
      final: true,
    });
  }
  return cards;
}


function shortRunId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}


function dotted(...parts: string[]): string {
  const visible = parts.map((part) => part.trim()).filter(Boolean);
  return visible.length > 0 ? visible.join(" · ") : "—";
}

function formatFiles(run: DispatchRunView): string | undefined {
  if (run.filesChanged === undefined && run.insertions === undefined && run.deletions === undefined) return undefined;
  const files = run.filesChanged === undefined ? "" : `${run.filesChanged} file${run.filesChanged === 1 ? "" : "s"}`;
  const insertions = run.insertions === undefined ? "" : `+${run.insertions}`;
  const deletions = run.deletions === undefined ? "" : `−${run.deletions}`;
  return [files, insertions, deletions].filter(Boolean).join("  ");
}

function FileChangeLine(props: { run: DispatchRunView }) {
  const hasChanges = () => props.run.filesChanged !== undefined || props.run.insertions !== undefined || props.run.deletions !== undefined;
  return (
    <Show when={hasChanges()}>
      <span class="inline-flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums text-[var(--color-text-secondary)]">
        <FileDiff size={14} aria-hidden="true" />
        <Show when={props.run.filesChanged !== undefined}>
          <span>{props.run.filesChanged} {props.run.filesChanged === 1 ? "file" : "files"}</span>
        </Show>
        <Show when={props.run.insertions !== undefined}>
          <span class="text-[var(--color-success)]">+{props.run.insertions}</span>
        </Show>
        <Show when={props.run.deletions !== undefined}>
          <span class="text-[var(--color-danger)]">−{props.run.deletions}</span>
        </Show>
      </span>
    </Show>
  );
}

function runLog(stored: string, events: readonly DispatchWatchEventView[]): string {
  const streamed = events.map((event) => {
    if (event.kind === "output" || event.kind === "agent") return event.text;
    const text = event.text.trim();
    return text ? `[${event.kind}] ${text}\n` : "";
  }).join("");
  if (!stored) return streamed;
  if (!streamed) return stored;
  if (streamed.includes(stored) || stored.includes(streamed)) {
    return streamed.length >= stored.length ? streamed : stored;
  }
  const hasOutput = events.some((event) => event.kind === "output" || event.kind === "agent");
  return hasOutput ? streamed : `${stored}\n${streamed}`;
}

function hash32(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function botTypeFor(id: string): BotAvatarType {
  return botAvatarTypes[hash32(id) % botAvatarTypes.length] ?? "clover";
}

function seedFor(id: string) {
  return (hash32(id) % 1000) / 1000;
}

function dispatchBotState(status?: string): "working" | "sleeping" | "default" {
  const value = status?.toLowerCase();
  if (value === "pending" || value === "running") return "working";
  if (value === "failed" || value === "cancelled" || value === "canceled" || value === "timed_out") return "sleeping";
  return "default";
}

function DispatchAgentAvatar(props: { agent?: string; seed?: string; status?: string; size?: number }) {
  const key = () => props.agent?.trim() || "agent";
  const mark = () => agentMarkFor(key());
  const state = () => dispatchBotState(props.status);
  const working = () => state() === "working";
  return (
    <BotAvatar
      type={mark()?.type ?? botTypeFor(key())}
      color={mark()?.color}
      state={state()}
      size={props.size ?? 28}
      seed={seedFor(props.seed || key())}
      shading="fabric"
      furLength={1}
      furDensity={1.6}
      furFuzz={0.9}
      aria-hidden="true"
      {...(working() ? {} : { jumpEvery: 0, turn: 0.35 })}
    />
  );
}

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function knownText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && !["unknown", "desconhecido"].includes(text.toLowerCase()) ? text : undefined;
}

/** Relative clock text. Empty stays unknown; an unparseable value stays as stored. */
function relativeWhen(value: string, now: number): string {
  const text = value.trim();
  if (!text) return "unknown";
  const time = parseTime(text);
  if (time === undefined) return text;
  const delta = time - now;
  const abs = Math.abs(delta);
  if (abs < 1000) return "now";
  const label = formatDuration(abs);
  return delta > 0 ? `in ${label}` : `${label} ago`;
}

type AgentQuotaSeries = {
  agent: string;
  series: number[];
};

/** Linear pace from a sampled point. Missing window or timestamps stay unknown. */
function linearPace(used: number, windowMinutes: number, resetsAt: string, sampledAt: string): number | undefined {
  const reset = Date.parse(resetsAt);
  const at = Date.parse(sampledAt);
  if (!Number.isFinite(used) || windowMinutes <= 0 || Number.isNaN(reset) || Number.isNaN(at)) return undefined;
  const windowMs = windowMinutes * 60_000;
  const remaining = Math.max(0, reset - at);
  const elapsed = Math.max(0, windowMs - remaining);
  return used - (elapsed / windowMs) * 100;
}

function quotaWindow(snap: DispatchQuotaSnapshotView | undefined): string | undefined {
  const name = knownText(snap?.window);
  if (name) return name;
  if (snap && snap.windowMinutes > 0) return `${snap.windowMinutes} min`;
  return undefined;
}

function poolMatchesAgent(key: string, agent: string): boolean {
  if (key === agent) return true;
  return key.split(/[:|]/)[0] === agent;
}

function capacityPaceLabel(pace: string): string {
  switch (pace.trim().toLowerCase()) {
    case "no ritmo":
    case "on pace":
      return "on pace";
    case "adiantado":
      return "ahead";
    case "atrasado":
      return "behind";
    case "desconhecido":
    case "":
      return "unknown";
    default:
      return pace;
  }
}

/** Short summary panel for a dispatch event on Activity (no live output). */
export function DispatchEventSummaryDetail(props: {
  event: DispatchRunEventView;
  run?: DispatchRunView;
}) {
  const status = () => props.run?.status || props.event.kind;
  const tier = () => props.run?.tier || props.event.tier || "—";
  const agent = () => props.run?.agent || props.event.agent || "—";
  const model = () => props.run?.model || "—";
  const card = () => props.run?.cardSlug || "—";
  const verification = () => props.run?.verification || (props.event.kind === "verified" ? "passed" : "—");
  const error = () => props.run?.error || (props.event.kind === "failed" ? props.event.text : "");

  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title
            icon={<Route size={16} />}
            title={props.event.text || `Dispatch ${props.event.kind}`}
          />
          <DetailPanel.Section title="Dispatch summary" icon={<FileText size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Status"
                value={<StatusChip tone={dispatchStatusTone(status())} label={status()} />}
              />
              <DetailPanel.Property label="Tier" value={tier()} />
              <DetailPanel.Property label="Agent" value={agent()} />
              <DetailPanel.Property label="Model" value={model()} mono />
              <DetailPanel.Property label="Card" value={card()} mono />
              <DetailPanel.Property label="Verification" value={verification()} />
              <DetailPanel.Property label="Error" value={error() || "—"} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Main>
        <DetailPanel.Rail>
          <DetailPanel.Section title="Event" icon={<Settings size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property
                label="Kind"
                value={<StatusChip tone={dispatchStatusTone(props.event.kind)} label={props.event.kind} />}
              />
              <DetailPanel.Property label="Run id" value={props.event.runId || "—"} mono />
              <DetailPanel.Property label="When" value={formatWhen(props.event.at)} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Rail>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}

/** Lowercased text match over the fields a list shows. */
function matchesQuery(query: string, values: readonly (string | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((value) => value?.toLowerCase().includes(needle));
}

/** One multi-select filter field over the distinct values a list has. */
function valueFilterField(id: string, label: string, values: readonly string[], icon?: () => JSX.Element): FilterField {
  return {
    id,
    label,
    kind: "multi",
    icon,
    options: [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((value) => ({ id: value, label: value })),
  };
}

const DEFAULT_DISPATCH_TABS = [{ id: "runs", label: "Runs" }];

/** One Dispatch route, with a tab rail only when the route has multiple destinations. */
export function DispatchPage(props: {
  projectId: string;
  tab?: string;
  tabs?: readonly { id: string; label: string }[];
  tabsLabel?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [localTab, setLocalTab] = createSignal<DispatchTab>(normalizeDispatchTab(props.tab));
  const activeTab = () => (props.tab ? normalizeDispatchTab(props.tab) : localTab());

  const [busy, setBusy] = createSignal(false);
  const [runs, setRuns] = createSignal<DispatchRunView[]>([]);
  const [worktrees, setWorktrees] = createSignal<DispatchWorktreeView[]>([]);
  const [quotaSnapshots, setQuotaSnapshots] = createSignal<DispatchQuotaSnapshotView[]>([]);
  const [capacity, setCapacity] = createSignal<DispatchCapacityView>({ since: "", note: "", keys: [] });
  const [tiers, setTiers] = createSignal<DispatchTierView[]>([]);
  const [agents, setAgents] = createSignal<DispatchAgentView[]>([]);
  const [tierProblems, setTierProblems] = createSignal<string[]>([]);

  const [selectedRunId, setSelectedRunId] = createSignal("");
  const [openedRunId, setOpenedRunId] = createSignal("");
  const [selectedRunDetail, setSelectedRunDetail] = createSignal<DispatchRunView | undefined>();
  const [selectedRunResult, setSelectedRunResult] = createSignal("");
  const [liveEvents, setLiveEvents] = createSignal<DispatchWatchEventView[]>([]);

  const [draftTier, setDraftTier] = createSignal("normal");
  const [draftAgent, setDraftAgent] = createSignal("");
  const [draftCard, setDraftCard] = createSignal("");
  const [draftPrompt, setDraftPrompt] = createSignal("");
  const [startOpen, setStartOpen] = createSignal(false);
  const [starting, setStarting] = createSignal(false);
  const [cancellingId, setCancellingId] = createSignal("");
  const [statsBy, setStatsBy] = createSignal("day");
  const [statsSince, setStatsSince] = createSignal("7d");
  const [statsInFlight, setStatsInFlight] = createSignal(0);
  const routeTabs = () => props.tabs ?? DEFAULT_DISPATCH_TABS;

  // Search and filters are kept per tab, so switching tabs does not carry a query across lists.
  const [runQuery, setRunQuery] = createSignal("");
  const [agentQuery, setAgentQuery] = createSignal("");
  const [tierQuery, setTierQuery] = createSignal("");
  const [learningQuery, setLearningQuery] = createSignal("");
  const learningFilters = createPageFilters({
    surface: "dispatch.learning",
    fields: () => [
      valueFilterField("tier", "Tier", ["easy", "normal", "hard"], () => <Gauge size={14} aria-hidden />),
      valueFilterField("state", "State", ["Prior", "Learned"]),
    ],
  });
  const runFilters = createPageFilters({
    surface: "dispatch.runs",
    fields: () => [
      valueFilterField("status", "Status", runs().map((run) => run.status)),
      valueFilterField("agent", "Agent", runs().map((run) => run.agent), () => <Bot size={14} aria-hidden />),
      valueFilterField("tier", "Tier", runs().map((run) => run.tier), () => <Gauge size={14} aria-hidden />),
    ],
  });

  const visibleRuns = createMemo(() => runs().filter((run) =>
    matchClauses(run, runFilters.pageClauses(), { status: (item) => item.status, agent: (item) => item.agent, tier: (item) => item.tier })
    && matchesQuery(runQuery(), [run.prompt, run.agent, run.model, run.tier, run.branch, run.cardSlug, run.id, run.status])));

  // Runs open as a page inside this tab. Drop any leftover side-panel selection for this scope.
  onCleanup(() => detailPanelStore.getState().unregisterCollection(DISPATCH_RUNS_SCOPE));
  onMount(() => {
    detailPanelStore.getState().unregisterCollection(DISPATCH_RUNS_SCOPE);
  });

  const loadRunDetail = async (id: string) => {
    const bridge = dispatchBridge();
    if (!bridge || !id) {
      setSelectedRunDetail(undefined);
      setSelectedRunResult("");
      return;
    }
    try {
      const [rawRun, rawResult] = await Promise.all([
        bridge.getRun({ id }),
        bridge.result({ id, section: "output", offset: 0, limit: 0 }).catch(() => ({})),
      ]);
      const run = mapDispatchRun(rawRun);
      const result = mapDispatchResult(rawResult).content;
      if (openedRunId() !== id) return;
      setSelectedRunDetail(run);
      setSelectedRunResult(result);
    } catch {
      if (openedRunId() !== id) return;
      setSelectedRunDetail(runs().find((item) => item.id === id));
      setSelectedRunResult("");
    }
  };

  // Full log stream for the open run page.
  createEffect(() => {
    if (activeTab() !== "runs") {
      setLiveEvents([]);
      return;
    }
    const runId = openedRunId();
    const bridge = dispatchBridge();
    if (!bridge || !runId) {
      setLiveEvents([]);
      return;
    }
    setLiveEvents([]);
    const unsubscribe = bridge.watchRun({ id: runId, afterSeq: 0 }, (event) => {
      setLiveEvents((prev) => [...prev, event]);
    });
    onCleanup(() => unsubscribe());
  });

  const refresh = async () => {
    const bridge = dispatchBridge();
    const projectId = props.projectId.trim();
    if (!bridge) {
      setRuns([]);
      setWorktrees([]);
      setQuotaSnapshots([]);
      setCapacity({ since: "", note: "", keys: [] });
      setTiers([]);
      setAgents([]);
      setTierProblems([]);
      return;
    }
    setBusy(true);
    try {
      const [rawRuns, rawWorktrees, rawQuota, rawCapacity, rawTiers, rawAgents, rawCheck] = await Promise.all([
        projectId ? bridge.listRuns({ projectId, limit: 50 }) : Promise.resolve({ runs: [] }),
        projectId ? bridge.listWorktrees({ projectId }) : Promise.resolve({ worktrees: [] }),
        bridge.listQuota({ agent: "", since: "" }),
        bridge.capacity({ since: "" }),
        bridge.listTiers({}),
        bridge.listAgents({}),
        bridge.checkTiers({}),
      ]);
      const nextRuns = mapDispatchRuns(rawRuns);
      setRuns(nextRuns);
      setWorktrees(mapDispatchWorktrees(rawWorktrees));
      setQuotaSnapshots(mapDispatchQuotaSnapshots(rawQuota));
      setCapacity(mapDispatchCapacity(rawCapacity));
      setTiers(mapDispatchTiers(rawTiers));
      setAgents(mapDispatchAgents(rawAgents));
      setTierProblems(mapCheckTiersProblems(rawCheck));

      const currentId = openedRunId();
      if (currentId && nextRuns.some((item) => item.id === currentId)) {
        await loadRunDetail(currentId);
      } else if (currentId) {
        setSelectedRunId("");
        setOpenedRunId("");
        setSelectedRunDetail(undefined);
        setSelectedRunResult("");
      }
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not load dispatch data.", "danger");
    } finally {
      setBusy(false);
    }
  };

  createEffect(
    on(
      () => props.projectId,
      () => {
        setRuns([]);
        setWorktrees([]);
        setSelectedRunId("");
        setOpenedRunId("");
        setSelectedRunDetail(undefined);
        setSelectedRunResult("");
        setLiveEvents([]);
        void refresh();
      },
      { defer: true },
    ),
  );

  onMount(() => void refresh());

  const handleStartRun = async () => {
    const bridge = dispatchBridge();
    const projectId = props.projectId.trim();
    const prompt = draftPrompt().trim();
    if (!bridge || !projectId || !prompt) return;
    setStarting(true);
    try {
      const started = mapDispatchRun(
        await bridge.startRun({
          projectId,
          tier: draftTier(),
          prompt,
          ...(draftCard().trim() ? { cardSlug: draftCard().trim() } : {}),
          ...(draftAgent().trim() ? { agent: draftAgent().trim() } : {}),
        }),
      );
      setDraftPrompt("");
      setStartOpen(false);
      if (activeTab() !== "runs") {
        setLocalTab("runs");
        props.onTabChange?.("runs");
      }
      await refresh();
      if (started) openRun(started.id);
      pushToast("Dispatch run started.", "success");
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not start dispatch run.", "danger");
    } finally {
      setStarting(false);
    }
  };

  const handleCancelRun = async (id: string) => {
    const bridge = dispatchBridge();
    if (!bridge || !id) return;
    setCancellingId(id);
    try {
      await bridge.cancelRun({ id });
      await refresh();
      pushToast("Dispatch run cancelled.", "success");
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : "Could not cancel dispatch run.", "danger");
    } finally {
      setCancellingId("");
    }
  };

  // Verify runs the project checks in the run's worktree; Merge lands a verified branch.
  const [reviewing, setReviewing] = createSignal<"" | "verify" | "merge">("");
  const handleReviewRun = async (id: string, action: "verify" | "merge") => {
    const bridge = dispatchBridge();
    const call = action === "verify" ? bridge?.verifyRun : bridge?.mergeRun;
    if (!call || !id || reviewing()) return;
    setReviewing(action);
    try {
      const result = (await call({ id })) as { ok?: boolean } | undefined;
      await refresh();
      if (result?.ok === false) pushToast(action === "verify" ? "Verification failed." : "The merge reported a failure.", "danger");
      else pushToast(action === "verify" ? "Run verified." : "Run merged.", "success");
    } catch (error: unknown) {
      pushToast(error instanceof Error ? error.message : `Could not ${action} the run.`, "danger");
    } finally {
      setReviewing("");
    }
  };

  const selectedRun = createMemo(() => {
    const id = openedRunId();
    if (!id) return undefined;
    return selectedRunDetail() ?? runs().find((item) => item.id === id);
  });

  const [now, setNow] = createSignal(Date.now());
  createEffect(() => {
    if (activeTab() !== "runs") return;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    onCleanup(() => window.clearInterval(timer));
  });

  const childrenByParent = createMemo(() => {
    const map = new Map<string, DispatchRunView[]>();
    for (const run of runs()) {
      const parent = run.parentRunId.trim();
      if (!parent) continue;
      const list = map.get(parent) ?? [];
      list.push(run);
      map.set(parent, list);
    }
    return map;
  });
  const resumedById = createMemo(() => {
    const map = new Map<string, DispatchRunView[]>();
    for (const run of runs()) {
      const previous = run.resumedOf.trim();
      if (!previous) continue;
      const list = map.get(previous) ?? [];
      list.push(run);
      map.set(previous, list);
    }
    return map;
  });
  const worktreeByRunId = createMemo(() => {
    const map = new Map<string, DispatchWorktreeView>();
    for (const worktree of worktrees()) {
      if (worktree.runId && !map.has(worktree.runId)) map.set(worktree.runId, worktree);
    }
    return map;
  });
  const runLogText = createMemo(() => runLog(selectedRunResult(), liveEvents()));

  const [focusRunId, setFocusRunId] = createSignal("");
  const selectRun = (id: string, focus = false) => {
    if (!id) return;
    setSelectedRunId(id);
    if (focus) setFocusRunId(id);
  };
  const openRun = (id: string) => {
    if (!id) return;
    if (activeTab() !== "runs") {
      setLocalTab("runs");
      props.onTabChange?.("runs");
    }
    setSelectedRunId(id);
    setFocusRunId("");
    setOpenedRunId(id);
    void loadRunDetail(id);
  };
  const closeRun = () => {
    const id = openedRunId();
    setOpenedRunId("");
    setSelectedRunDetail(undefined);
    setSelectedRunResult("");
    if (id) setFocusRunId(id);
  };
  createEffect(() => {
    const id = focusRunId();
    if (!id || activeTab() !== "runs" || openedRunId()) return;
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`dispatch-run-${id}`);
      if (!node) return;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
      setFocusRunId("");
    });
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const moveRun = (key: "up" | "down" | "home" | "end") => {
    const items = visibleRuns();
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === selectedRunId());
    const next = key === "home"
      ? 0
      : key === "end"
        ? items.length - 1
        : key === "down"
          ? Math.min(items.length - 1, index < 0 ? 0 : index + 1)
          : Math.max(0, index < 0 ? 0 : index - 1);
    const run = items[next];
    if (run) selectRun(run.id, true);
  };

  const tierSelectOptions = createMemo(() => {
    const dynamic = tiers().map((tier) => ({ value: tier.name, label: `${tier.name} (${tier.agent})` }));
    return dynamic.length > 0 ? dynamic : DEFAULT_TIER_OPTIONS;
  });

  const agentSelectOptions = createMemo(() => [
    { value: "", label: "Auto (from tier)" },
    ...agents().map((agent) => ({ value: agent.name, label: agent.name })),
  ]);

  /** Per-agent usedPercent series ordered by sampledAt, skipping snapshots without usedPercent. */
  const agentQuotaSeries = createMemo((): AgentQuotaSeries[] => {
    const byAgent = new Map<string, { sampledAt: string; usedPercent: number }[]>();
    for (const snap of quotaSnapshots()) {
      if (snap.usedPercent === undefined || !Number.isFinite(snap.usedPercent)) continue;
      const list = byAgent.get(snap.agent) ?? [];
      list.push({ sampledAt: snap.sampledAt, usedPercent: snap.usedPercent });
      byAgent.set(snap.agent, list);
    }
    return [...byAgent.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([agent, items]) => {
        const sorted = items.slice().sort((a, b) => a.sampledAt.localeCompare(b.sampledAt));
        return {
          agent,
          series: sorted.map((item) => item.usedPercent),
        };
      });
  });

  const agentCards = createMemo((): AgentQuotaSeries[] => {
    const entries = new Map(agentQuotaSeries().map((entry) => [entry.agent, entry]));
    for (const agent of agents()) {
      if (!entries.has(agent.name)) entries.set(agent.name, { agent: agent.name, series: [] });
    }
    for (const snap of quotaSnapshots()) {
      if (!entries.has(snap.agent)) entries.set(snap.agent, { agent: snap.agent, series: [] });
    }
    return [...entries.values()].sort((a, b) => a.agent.localeCompare(b.agent));
  });

  const agentProvider = (name: string) =>
    knownText(agents().find((agent) => agent.name === name)?.provider)
    ?? knownText(quotaSnapshots().find((snap) => snap.agent === name)?.provider)
    ?? "";
  const agentFilters = createPageFilters({
    surface: "dispatch.agents",
    fields: () => [valueFilterField("provider", "Provider", agentCards().map((entry) => agentProvider(entry.agent)), () => <Cpu size={14} aria-hidden />)],
  });
  const visibleAgentCards = createMemo(() => agentCards().filter((entry) =>
    matchClauses(entry, agentFilters.pageClauses(), { provider: (item) => agentProvider(item.agent) })
    && matchesQuery(agentQuery(), [entry.agent, agentProvider(entry.agent)])));
  // The board keeps every card in place so drag targets stay stable; search and filters dim the rest instead.
  const tierMatches = (tier: DispatchTierView) => matchesQuery(tierQuery(), [tier.name, tier.agent, tier.provider, tier.model]);
  // Always editable; a desktop or core that predates ReplaceTiers says so when a change is saved.
  const tiersEditable = () => true;
  const [paletteModels, setPaletteModels] = createSignal<DispatchModelView[]>([]);
  const [paletteProblems, setPaletteProblems] = createSignal<string[]>([]);
  const [paletteLoading, setPaletteLoading] = createSignal(false);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  let paletteLoaded = false;
  const loadPaletteModels = async () => {
    const bridge = dispatchBridge();
    if (paletteLoaded) return;
    if (!bridge?.listModels) {
      setPaletteProblems(["This desktop build cannot list models yet. Restart the desktop app and the local core."]);
      return;
    }
    paletteLoaded = true;
    setPaletteLoading(true);
    try {
      const raw = await bridge.listModels({});
      setPaletteModels(mapDispatchModels(raw));
      const problems = (raw as { problems?: unknown }).problems;
      setPaletteProblems(Array.isArray(problems) ? problems.filter((item): item is string => typeof item === "string") : []);
    } catch (error: unknown) {
      paletteLoaded = false;
      pushToast(error instanceof Error ? error.message : "Could not list models.", "danger");
    } finally {
      setPaletteLoading(false);
    }
  };
  // Optimistic: the board moves at once, then the core's validated table replaces it (or the old one comes back).
  const saveTiers = async (next: DispatchTierView[]) => {
    const bridge = dispatchBridge();
    if (!bridge?.replaceTiers) {
      pushToast("This desktop build cannot save tiers yet. Restart the desktop app and the local core.", "danger");
      return;
    }
    const previous = tiers();
    setTiers(next);
    try {
      setTiers(mapDispatchTiers(await bridge.replaceTiers({ tiers: next })));
      setTierProblems(mapCheckTiersProblems(await bridge.checkTiers({})));
    } catch (error: unknown) {
      setTiers(previous);
      pushToast(error instanceof Error ? error.message : "Could not save the tiers.", "danger");
    }
  };

  const toolbarSearch = () => {
    switch (activeTab()) {
      case "runs": return { placeholder: "Search runs…", value: runQuery(), onInput: setRunQuery };
      case "agents": return { placeholder: "Search agents…", value: agentQuery(), onInput: setAgentQuery };
      case "tiers": return { placeholder: "Search tiers…", value: tierQuery(), onInput: setTierQuery };
      case "learning": return { placeholder: "Search features…", value: learningQuery(), onInput: setLearningQuery };
      default: return undefined;
    }
  };
  const toolbarFilters = (): { label: string; filters: PageFilters } | undefined => {
    switch (activeTab()) {
      case "runs": return { label: "Run filters", filters: runFilters };
      case "agents": return { label: "Agent filters", filters: agentFilters };
      case "learning": return { label: "Learning filters", filters: learningFilters };
      default: return undefined;
    }
  };

  const runDetailOpen = () => activeTab() === "runs" && Boolean(selectedRun());

  return (
    <EntityDetailHost>
      <Show when={!runDetailOpen()}>
        <PageToolbar.Root>
          <Show
            when={routeTabs().length > 1}
            fallback={<PageToolbar.Leading>{null}</PageToolbar.Leading>}
          >
            <PageToolbar.Tabs>
              <Tabs
                items={[...routeTabs()]}
                value={activeTab()}
                onChange={(value) => {
                  const next = normalizeDispatchTab(value);
                  setLocalTab(next);
                  props.onTabChange?.(next);
                }}
                aria-label={props.tabsLabel ?? "Dispatch"}
              />
            </PageToolbar.Tabs>
          </Show>
          <PageToolbar.Actions>
            <Show when={toolbarSearch()}>
              {(search) => <SearchBar placeholder={search().placeholder} aria-label={search().placeholder.replace("…", "")} value={search().value} onInput={search().onInput} />}
            </Show>
            <Show when={toolbarFilters()}>
              {(toolbar) => (
                <FilterPopover
                  ariaLabel={toolbar().label}
                  title={toolbar().label}
                  shortcut
                  fields={toolbar().filters.fields()}
                  clauses={toolbar().filters.clauses()}
                  onClausesChange={toolbar().filters.onClausesChange}
                  saved={toolbar().filters.saved()}
                />
              )}
            </Show>
            <Show when={activeTab() === "tiers" && tiersEditable()}>
              <span class="inline-flex" data-floating-window-opener="">
                <ToolbarIconButton
                  label={paletteOpen() ? "Close model palette" : "Add model"}
                  onClick={() => {
                    const next = !paletteOpen();
                    setPaletteOpen(next);
                    if (next) void loadPaletteModels();
                  }}
                >
                  <Plus size={14} />
                </ToolbarIconButton>
              </span>
            </Show>
            <Show when={activeTab() === "runs"}>
              <ToolbarIconButton label="Start run" onClick={() => setStartOpen(true)}>
                <Play size={14} />
              </ToolbarIconButton>
            </Show>
            <Show when={activeTab() === "agents"}>
              <Button
                size="icon"
                variant="texture"
                class="!rounded-full"
                aria-label="Scan for installed agents"
                disabled={busy()}
                onClick={() => void refresh().then(() => pushToast("Scanned for installed agents.", "success"))}
              >
                <RefreshCw size={14} aria-hidden />
              </Button>
            </Show>
            <Show when={activeTab() === "stats"}>
              <div class="w-44">
                <Select
                  size="sm"
                  class="!rounded-full !px-4"
                  aria-label="Group stats by"
                  title="Group by"
                  value={statsBy()}
                  options={DISPATCH_STATS_BY_OPTIONS}
                  onChange={setStatsBy}
                />
              </div>
              <div class="w-44">
                <Select
                  size="sm"
                  class="!rounded-full !px-4"
                  aria-label="Stats since"
                  title="Since"
                  value={statsSince()}
                  options={DISPATCH_STATS_SINCE_OPTIONS}
                  onChange={setStatsSince}
                />
              </div>
              <Show when={statsInFlight() > 0}>
                <StatusChip tone="syncing" label={`${statsInFlight()} in flight`} />
              </Show>
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>
        <Show when={toolbarFilters()}>
          {(toolbar) => (
            <ActiveFilterBar
              fields={toolbar().filters.fields()}
              clauses={toolbar().filters.clauses()}
              onClausesChange={toolbar().filters.onClausesChange}
              saved={toolbar().filters.saved()}
            />
          )}
        </Show>
      </Show>
      <Switch>
        <Match when={activeTab() === "runs" && selectedRun()}>
          {(run) => (
            <DispatchRunDetail
              run={run()}
              childRuns={childrenByParent().get(run().id) ?? []}
              resumedBy={resumedById().get(run().id) ?? []}
              onSelect={(id) => openRun(id)}
              onBack={closeRun}
              worktree={worktreeByRunId().get(run().id)}
              log={runLogText()}
              answer={selectedRunResult()}
              live={isRunActive(run().status)}
              now={now()}
              cancelling={cancellingId() === run().id}
              onCancel={() => void handleCancelRun(run().id)}
              reviewing={reviewing()}
              onVerify={dispatchBridge()?.verifyRun ? () => void handleReviewRun(run().id, "verify") : undefined}
              onMerge={dispatchBridge()?.mergeRun ? () => void handleReviewRun(run().id, "merge") : undefined}
            />
          )}
        </Match>

        <Match when={activeTab() === "runs"}>
          <PageContent class="flex min-h-0 flex-1 flex-col p-0">
            <div class="min-h-0 flex-1 overflow-auto p-3">
              <Show
                when={visibleRuns().length > 0}
                fallback={
                  <Show
                    when={!busy()}
                    fallback={
                      <div class="pw-page-skeleton__rows" role="status" aria-label="Loading…">
                        <For each={[0, 1, 2]}>
                          {() => (
                            <div class="pw-page-skeleton__row">
                              <Skeleton class="h-3 w-[40%]" />
                              <Skeleton class="h-3 w-[16%]" />
                              <Skeleton class="ml-auto h-3 w-[10%]" />
                            </div>
                          )}
                        </For>
                      </div>
                    }
                  >
                    <PageEmpty
                      title={runs().length > 0 ? "No matches" : "No runs yet"}
                      mood={runs().length > 0 ? "lost" : "sleeping"}
                    />
                  </Show>
                }
              >
                <div
                  role="listbox"
                  aria-label="Dispatch runs"
                  class="flex flex-col gap-0.5"
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveRun("down");
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveRun("up");
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      moveRun("home");
                    } else if (event.key === "End") {
                      event.preventDefault();
                      moveRun("end");
                    }
                  }}
                >
                  <Index each={visibleRuns()}>
                    {(run, index) => (
                      <DispatchRunCard
                        run={run()}
                        worktree={worktreeByRunId().get(run().id)}
                        selected={selectedRunId() === run().id}
                        tabStop={selectedRunId() === run().id || (!selectedRunId() && index === 0)}
                        now={now()}
                        cancelling={cancellingId() === run().id}
                        onOpen={() => openRun(run().id)}
                        onMove={moveRun}
                        onCancel={() => void handleCancelRun(run().id)}
                      />
                    )}
                  </Index>
                </div>
              </Show>
            </div>
          </PageContent>
        </Match>

        <Match when={activeTab() === "agents"}>
          <PageContent class="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            <Show
              when={visibleAgentCards().length > 0}
              fallback={<PageEmpty title={agentCards().length > 0 ? "No matches" : "No agents found"} mood={agentCards().length > 0 ? "lost" : "sad"} />}
            >
              <div class="grid auto-rows-fr items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]">
                <For each={visibleAgentCards()}>
                  {(entry) => {
                    const latest = createMemo(() => quotaSnapshots()
                      .filter((snap) => snap.agent === entry.agent)
                      .sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))[0]);
                    const agentView = createMemo(() => agents().find((agent) => agent.name === entry.agent));
                    const pools = createMemo(() => capacity().keys.filter((row) => poolMatchesAgent(row.key, entry.agent)));
                    const used = () => {
                      const value = latest()?.usedPercent ?? agentView()?.usedPercent;
                      return value !== undefined && Number.isFinite(value) ? value : undefined;
                    };
                    const provider = () => knownText(latest()?.provider) || knownText(agentView()?.provider);
                    const pace = createMemo(() => {
                      const reported = pools().map((row) => knownText(capacityPaceLabel(row.pace))).find(Boolean);
                      if (reported) return reported;
                      const snap = latest();
                      if (!snap || snap.usedPercent === undefined) return undefined;
                      const delta = linearPace(snap.usedPercent, snap.windowMinutes, snap.resetsAt, snap.sampledAt);
                      if (delta === undefined) return undefined;
                      return delta > 2 ? "ahead" : delta < -2 ? "behind" : "on pace";
                    });
                    const reset = () => parseTime(latest()?.resetsAt ?? "");
                    // Key-value facts for the card foot: where the quota number comes from and how the windows went.
                    const facts = createMemo(() => {
                      const source = knownText(latest()?.source) || knownText(agentView()?.quotaSource);
                      const confidence = knownText(latest()?.confidence) || knownText(agentView()?.confidence);
                      const items: { label: string; value: string }[] = [
                        { label: "Source", value: source ?? "unknown" },
                        { label: "Confidence", value: confidence ?? "unknown" },
                      ];
                      for (const pool of pools()) {
                        const prefix = pools().length > 1 ? `${pool.key} ` : "";
                        items.push({ label: `${prefix}Windows`, value: String(pool.windows) });
                        items.push({ label: `${prefix}Hit 100%`, value: String(pool.hitFull) });
                        const leftover = pool.leftoverPct !== undefined && Number.isFinite(pool.leftoverPct)
                          ? formatUsedPercent(pool.leftoverPct)
                          : knownText(capacityPaceLabel(pool.leftover));
                        if (leftover) items.push({ label: `${prefix}Leftover`, value: leftover });
                      }
                      return items;
                    });
                    const cooldownUntil = () => agentView()?.cooldownUntil ?? "";
                    const cooldownActive = () => {
                      const time = parseTime(cooldownUntil());
                      return time !== undefined && time > now();
                    };
                    return (
                      <Card class="flex h-full min-w-0 flex-col gap-4 p-3.5">
                        <div class="flex min-w-0 items-center justify-between gap-2">
                          <div class="flex min-w-0 items-center gap-2">
                            <DispatchAgentAvatar agent={entry.agent} seed={entry.agent} />
                            <div class="flex min-w-0 flex-col gap-0.5">
                              <span class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                                {entry.agent}
                              </span>
                              <Show when={provider()}>
                                {(label) => (
                                  <span class="truncate text-[11px] text-[var(--color-text-muted)]" title={label()}>
                                    {label()}
                                  </span>
                                )}
                              </Show>
                            </div>
                          </div>
                          <StatusChip
                            tone={pace() === "ahead" ? "warn" : pace() ? "ok" : "unknown"}
                            label={pace() ?? "unknown"}
                          />
                        </div>
                        <div class="flex flex-col gap-2.5">
                          <div class="flex items-end justify-between gap-3">
                            <div class="flex items-baseline gap-2 text-[var(--color-text-primary)]">
                              <SegmentDisplay
                                value={used() === undefined ? "--" : formatUsedPercent(used())}
                                size={28}
                                aria-label={`${entry.agent} quota usage: ${formatUsedPercent(used())}`}
                              />
                              <Show when={used() === undefined}><span class="text-[11px] text-[var(--color-text-muted)]">unknown</span></Show>
                            </div>
                            <div class="flex min-w-0 flex-col items-end gap-0.5 text-right text-[11px] tabular-nums">
                              <Show when={quotaWindow(latest())}>
                                {(window) => <span class="text-[var(--color-text-secondary)]">of {window()} window</span>}
                              </Show>
                              <Show when={reset() !== undefined}>
                                <span class="text-[var(--color-text-muted)]" title={formatWhen(latest()!.resetsAt)}>
                                  Resets {relativeWhen(latest()!.resetsAt, now())}
                                </span>
                              </Show>
                            </div>
                          </div>
                          <ProgressBar
                            label={`${entry.agent} quota usage`}
                            value={used() ?? null}
                            aria-valuetext={formatUsedPercent(used())}
                            tone="blue"
                          />
                        </div>
                        <Show when={entry.series.length >= 3}>
                          {/* Clip the shared chart's value-axis gutter only in cards. */}
                          <div class="overflow-hidden">
                            <div class="-ml-10 w-[calc(100%+2.5rem)]">
                              <SparkChart
                                series={entry.series}
                                label={`${entry.agent} quota usage history`}
                                strokeToken="--color-chart-blue"
                                height={48}
                                padding={[4, 4, 4, 0]}
                              />
                            </div>
                          </div>
                        </Show>
                        <dl class="m-0 mt-auto grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-[var(--color-border-subtle)] pt-3 text-[11px] leading-5 tabular-nums">
                          <div class="flex min-w-0 items-center justify-between gap-2">
                            <dt class="text-[var(--color-text-muted)]">Binary</dt>
                            <dd class="m-0 truncate font-mono text-[var(--color-text-secondary)]">{agentView()?.bin || "—"}</dd>
                          </div>
                          <div class="flex min-w-0 items-center justify-between gap-2">
                            <dt class="text-[var(--color-text-muted)]">Probe risk</dt>
                            <dd class="m-0">
                              <StatusChip tone={dispatchStatusTone(agentView()?.risk ?? "")} label={agentView()?.risk || "unknown"} />
                            </dd>
                          </div>
                          <For each={facts()}>
                            {(fact) => (
                              <div class="flex min-w-0 items-center justify-between gap-2">
                                <dt class="truncate text-[var(--color-text-muted)]">{fact.label}</dt>
                                <dd class="m-0 truncate text-[var(--color-text-secondary)]">{fact.value}</dd>
                              </div>
                            )}
                          </For>
                          <Show when={cooldownUntil()}>
                            {(until) => (
                              <div class="col-span-2 flex min-w-0 items-center justify-between gap-2">
                                <dt class="text-[var(--color-text-muted)]">Cooldown until</dt>
                                <dd class="m-0 flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                                  <Show when={cooldownActive()}><StatusChip tone="warn" label="Cooldown" /></Show>
                                  {formatWhen(until())}
                                </dd>
                              </div>
                            )}
                          </Show>
                        </dl>
                      </Card>
                    );
                  }}
                </For>
              </div>
            </Show>
          </PageContent>
        </Match>

        <Match when={activeTab() === "tiers"}>
          <PageContent class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            <Show when={tierProblems().length > 0}>
              <Card class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div class="flex items-center gap-2">
                  <Gauge size={15} />
                  <span class="text-[13px] font-medium">Tier configuration check</span>
                </div>
                <StatusChip
                  tone="warn"
                  label={`${tierProblems().length} problem(s)`}
                />
                  <ul class="m-0 w-full list-disc pl-5 text-[12px] text-[var(--color-text-secondary)]">
                    <For each={tierProblems()}>{(problem) => <li>{problem}</li>}</For>
                  </ul>
              </Card>
            </Show>

            <TierBoard
              tiers={tiers()}
              editable={tiersEditable()}
              matches={tierMatches}
              avatar={(agent) => <DispatchAgentAvatar agent={agent} seed={agent} />}
              onChange={(next) => void saveTiers(next)}
            />
          </PageContent>
          {/* The model palette is a movable window over the whole app, so models drag straight from it onto cells. */}
          <Portal>
            <FloatingWindow.Root
              class="pw-tier-palette-window"
              open={paletteOpen()}
              expanded={false}
              minimized={false}
              controls="close"
              storageKey="polterware.dispatch.model-palette.window"
              defaultGeometry={{ dock: "bottom-left", width: 360, height: 480 }}
              aria-label="Add model"
              onOpenChange={setPaletteOpen}
              onExpandedChange={() => undefined}
              onMinimizedChange={() => undefined}
            >
              <FloatingWindow.Workspace>{null}</FloatingWindow.Workspace>
              <FloatingWindow.Content>
                <TierModelPalette
                  models={paletteModels()}
                  loading={paletteLoading()}
                  problems={paletteProblems()}
                  onAdd={(card, tier) => void saveTiers(placeTierCard(tiers(), card, { tier, index: Number.MAX_SAFE_INTEGER }))}
                  avatar={(agent) => <DispatchAgentAvatar agent={agent} seed={agent} />}
                />
              </FloatingWindow.Content>
            </FloatingWindow.Root>
          </Portal>
        </Match>

        <Match when={activeTab() === "stats"}>
          <DispatchStatsPage
            projectId={props.projectId}
            by={statsBy()}
            since={statsSince()}
            onInFlight={setStatsInFlight}
          />
        </Match>

        <Match when={activeTab() === "learning"}>
          <DispatchLearningPage query={learningQuery()} clauses={learningFilters.pageClauses()} />
        </Match>
      </Switch>

      <Dialog
        open={startOpen()}
        title="Start run"
        description="Delegate a task to a worker agent."
        size="md"
        onClose={() => {
          if (!starting()) setStartOpen(false);
        }}
        footer={
          <>
            <Button variant="texture" disabled={starting()} onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={starting() || !draftPrompt().trim() || !props.projectId.trim()}
              onClick={() => void handleStartRun()}
            >
              <Play size={14} />
              {starting() ? "Starting…" : "Start run"}
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          <Field label="Tier">
            <Select
              aria-label="Tier"
              options={tierSelectOptions()}
              value={draftTier()}
              onChange={setDraftTier}
            />
          </Field>
          <Field label="Agent">
            <Select
              aria-label="Agent"
              options={agentSelectOptions()}
              value={draftAgent()}
              onChange={setDraftAgent}
            />
          </Field>
          <Field label="Card">
            <Input
              aria-label="Card"
              placeholder="Optional card slug"
              value={draftCard()}
              onInput={(event) => setDraftCard(event.currentTarget.value)}
            />
          </Field>
          <Field label="Prompt">
            <Textarea
              aria-label="Prompt"
              rows={4}
              placeholder="Describe the task to dispatch…"
              value={draftPrompt()}
              onInput={(event) => setDraftPrompt(event.currentTarget.value)}
            />
          </Field>
        </div>
      </Dialog>
    </EntityDetailHost>
  );
}

/** A run card's facts: its route, worktree branch and status, and a trailing slot. */
function DispatchRunCard(props: {
  run: DispatchRunView;
  worktree?: DispatchWorktreeView;
  selected: boolean;
  tabStop: boolean;
  now: number;
  cancelling: boolean;
  onOpen: () => void;
  onMove: (key: "up" | "down" | "home" | "end") => void;
  onCancel: () => void;
}) {
  const failed = () => dispatchStatusTone(props.run.status) === "danger";
  /** The run's last word: its error or note, else who ran it. */
  const subtitle = () => (failed() && props.run.error.trim()) || props.run.note.trim() || dotted(props.run.agent, props.run.model);
  const statusDot = () => {
    const tone = dispatchStatusTone(props.run.status);
    if (tone === "danger") return "bg-[var(--color-danger)]";
    if (tone === "syncing") return "bg-[var(--color-info)]";
    if (tone === "ok") return "bg-[var(--color-success)]";
    return "bg-[var(--color-text-disabled)]";
  };
  const fromControl = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("button, a, input, textarea, select"));
  return (
    <article
      id={`dispatch-run-${props.run.id}`}
      role="option"
      aria-selected={props.selected}
      aria-current={props.selected ? "true" : undefined}
      aria-label={`Open run ${props.run.id}`}
      data-detail-opener=""
      data-selected={props.selected ? "true" : undefined}
      tabIndex={props.tabStop ? 0 : -1}
      class={`flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-[var(--color-surface-hover)] focus-visible:bg-[var(--color-surface-hover)] motion-reduce:transition-none ${props.selected ? "bg-[var(--color-surface-selected)]" : ""}`}
      onClick={(event) => {
        if (fromControl(event.target)) return;
        props.onOpen();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          props.onMove("down");
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          props.onMove("up");
        } else if (event.key === "Home") {
          event.preventDefault();
          props.onMove("home");
        } else if (event.key === "End") {
          event.preventDefault();
          props.onMove("end");
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <DispatchAgentAvatar agent={props.run.agent} seed={props.run.id} status={props.run.status} size={40} />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[13px] font-medium leading-5 text-[var(--color-text-primary)]" title={props.run.prompt || "—"}>
          {props.run.prompt || "—"}
        </span>
        <span class={`truncate text-[12px] leading-5 ${failed() ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"}`} title={subtitle()}>
          {subtitle()}
        </span>
      </span>
      <Show when={isRunActive(props.run.status)}>
        <Button size="sm" variant="ghost" disabled={props.cancelling} onClick={() => props.onCancel()}>
          <Stop size={12} />
          Cancel
        </Button>
      </Show>
      <span class="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">{formatAgo(props.run.createdAt || props.run.startedAt, props.now)}</span>
      <span aria-label={props.run.status || "unknown"} title={props.run.status || "unknown"} class={`size-2 shrink-0 rounded-full ${statusDot()}`} />
    </article>
  );
}

/**
 * A run's output as its agent's CLI prints it, under the pinned agent bar: what the agent
 * did as `›` steps, its reasoning dimmed, its reply in compact Markdown, the CLI's raw output in
 * mono, and the lines the core recorded (`✓ verified …`). No title or frame: it is the page's content.
 */
function RunTranscript(props: { log: string; answer: string; live: boolean }) {
  const entries = createMemo(() => buildTranscript(props.log, props.answer));
  return (
    <div class="pw-run-transcript flex min-w-0 flex-col gap-2 font-mono text-[12px] leading-5">
      <Show
        when={entries().length > 0}
        fallback={<div class="text-[var(--color-text-muted)]">{props.live ? "Waiting for agent output…" : "No agent output recorded."}</div>}
      >
        <Index each={entries()}>{(entry) => <TranscriptLine entry={entry()} />}</Index>
      </Show>
      <Show when={props.live}>
        <div class="inline-flex items-center gap-2 text-[var(--color-text-muted)]">
          <StatusChip tone="syncing" label="Live" />
          The agent is still writing.
        </div>
      </Show>
    </div>
  );
}

function TranscriptLine(props: { entry: TranscriptEntry }) {
  return (
    <Switch>
      <Match when={props.entry.kind === "step" && props.entry}>
        {(step) => (
          <div class={`flex min-w-0 gap-2 ${step().failed ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}`}>
            <span aria-hidden="true" class="shrink-0 text-[var(--color-text-muted)]">›</span>
            <span class="min-w-0 break-words">{step().text}</span>
            <Show when={step().detail}>
              <span class="shrink-0 text-[var(--color-text-muted)]">{step().detail}</span>
            </Show>
          </div>
        )}
      </Match>
      <Match when={props.entry.kind === "thinking" && props.entry}>
        {(thinking) => <div class="whitespace-pre-wrap break-words italic text-[var(--color-text-muted)]">{thinking().text.replace(/\*\*(.+?)\*\*/g, "$1")}</div>}
      </Match>
      <Match when={props.entry.kind === "message" && props.entry}>
        {(message) => (
          <div class="py-2 font-sans">
            <MarkdownEditor class="pw-md-editor--transcript" value={message().text} editable={false} aria-label="Agent response" />
          </div>
        )}
      </Match>
      <Match when={props.entry.kind === "output" && props.entry}>
        {(output) => <pre class="m-0 whitespace-pre-wrap break-words font-mono text-[var(--color-text-muted)]">{output().text}</pre>}
      </Match>
      <Match when={props.entry.kind === "event" && props.entry}>
        {(event) => (
          <div class="flex min-w-0 items-center gap-2 text-[var(--color-text-muted)]">
            <StatusChip tone={dispatchStatusTone(event().event)} label={event().event} />
            <span class="min-w-0 truncate">{event().text}</span>
          </div>
        )}
      </Match>
    </Switch>
  );
}

/**
 * The agent that runs (or ran) the job, pinned above the transcript: its bot, animated while
 * it works, and agent · model · provider. Failed attempts before it show as quiet bots and a
 * line each with their error.
 */
function RunAgentBar(props: { run: DispatchRunView; attempts: readonly AgentAttemptCard[] }) {
  const current = () => props.attempts[props.attempts.length - 1];
  const earlier = () => props.attempts.slice(0, -1);
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <DispatchAgentAvatar agent={current()?.agent} seed={current()?.key} status={props.run.status} size={28} />
        <span class="min-w-0 truncate text-[13px] font-medium text-[var(--color-text-primary)]">{current()?.title}</span>
        <Show when={current()?.durationMs !== undefined}>
          <span class="shrink-0 tabular-nums text-[12px] text-[var(--color-text-muted)]">{measuredDuration(current()?.durationMs)}</span>
        </Show>
      </div>
      <For each={earlier()}>
        {(attempt) => (
          <div class="flex min-w-0 items-center gap-2 pl-1 text-[12px] text-[var(--color-text-muted)]">
            <DispatchAgentAvatar agent={attempt.agent} seed={attempt.key} status="failed" size={18} />
            <span class="shrink-0">{attempt.title}</span>
            <Show when={attempt.error}><span class="min-w-0 truncate text-[var(--color-danger)]">{attempt.error}</span></Show>
          </div>
        )}
      </For>
    </div>
  );
}

/** A linked run in the rail: the agent's avatar, the link, and its status; a plain row, not a card. */
function LinkedRunRow(props: { label: string; agent?: string; seed: string; status?: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      class="flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start hover:bg-[var(--color-surface-hover)]"
      onClick={() => props.onOpen()}
    >
      <DispatchAgentAvatar agent={props.agent} seed={props.seed} status={props.status} size={18} />
      <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-text-secondary)]">{props.label}</span>
      <Show when={props.status}>{(status) => <StatusChip tone={dispatchStatusTone(status())} label={status()} />}</Show>
    </button>
  );
}

/**
 * A run opens in the page structure of docs, in two columns: its output in the center and its
 * metadata in the rail on the right, each group under a title with an icon tile, with no cards.
 * The header has Back, the breadcrumb Runs › prompt, and the next step (Verify, Merge, or Cancel).
 */
function DispatchRunDetail(props: {
  run: DispatchRunView;
  childRuns: readonly DispatchRunView[];
  resumedBy: readonly DispatchRunView[];
  onSelect: (id: string) => void;
  onBack: () => void;
  worktree?: DispatchWorktreeView;
  log: string;
  /** The stored final reply, shown when the stream holds none. */
  answer: string;
  live: boolean;
  now: number;
  cancelling: boolean;
  onCancel: () => void;
  reviewing: "" | "verify" | "merge";
  onVerify?: () => void;
  onMerge?: () => void;
}) {
  let logEnd: HTMLDivElement | undefined;
  createEffect(() => {
    props.log;
    if (!props.live) return;
    logEnd?.scrollIntoView({ block: "nearest" });
  });
  const branch = () => (props.worktree?.branch || props.run.branch).trim();
  const path = () => (props.worktree?.path || props.run.worktree).trim();
  const worktreeStatus = () => worktreeDisplayStatus(props.run.status, props.worktree?.status ?? "");
  const duration = () => {
    if (props.run.runMs !== undefined) return measuredDuration(props.run.runMs);
    if (isRunActive(props.run.status)) {
      const start = parseTime(props.run.startedAt || props.run.createdAt);
      if (start !== undefined) return formatDuration(Math.max(0, props.now - start));
    }
    return measuredDuration(props.run.queuedMs);
  };
  const attempts = () => agentAttemptCards(props.run);
  const promptTitle = () => props.run.prompt.trim().split("\n")[0]?.trim() ?? "";
  const promptRest = () => {
    const prompt = props.run.prompt.trim();
    return prompt.includes("\n") || prompt.length > 120 ? prompt : "";
  };
  const review = () => runReviewAction(props.run, Boolean(branch() || path()));
  const text = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
  const linked = () => props.run.resumedOf.trim() || props.resumedBy.length > 0 || props.childRuns.length > 0;
  const actions = () => (
    <>
      <StatusChip tone={dispatchStatusTone(props.run.status)} label={props.run.status || "unknown"} />
      <Show when={isRunActive(props.run.status)}>
        <Button size="sm" variant="ghost" disabled={props.cancelling} onClick={() => props.onCancel()}>
          <Stop size={12} />
          Cancel
        </Button>
      </Show>
      <Show when={review() === "verify" && props.onVerify}>
        <Button size="sm" variant="primary" disabled={props.reviewing !== ""} onClick={() => props.onVerify?.()}>
          <ShieldCheck size={12} />
          {props.reviewing === "verify" ? "Verifying…" : "Verify"}
        </Button>
      </Show>
      <Show when={review() === "merge" && props.onMerge}>
        <Button size="sm" variant="primary" disabled={props.reviewing !== ""} onClick={() => props.onMerge?.()}>
          <GitBranch size={12} />
          {props.reviewing === "merge" ? "Merging…" : "Merge"}
        </Button>
      </Show>
    </>
  );
  const rail = () => (
    <>
      <RailGroup title="Run" icon={<InformationCircle size={14} />}>
        <DetailPanel.Properties variant="rail">
          <DetailPanel.Property label="Run" mono value={props.run.id} />
          <DetailPanel.Property label="Model" value={modelLabel(props.run)} />
          <DetailPanel.Property label="Route" value={routeLabel(props.run)} />
          <DetailPanel.Property label="Duration" value={duration() === "—" ? undefined : duration()} />
          <DetailPanel.Property label="Timing" value={timingLabel(props.run)} />
          <DetailPanel.Property label="Card" mono value={text(props.run.cardSlug)} />
          <DetailPanel.Property label="Verification" value={text(props.run.verification)} />
          <DetailPanel.Property label="Note" value={text(props.run.note)} />
        </DetailPanel.Properties>
      </RailGroup>
      <RailGroup title="Changes" icon={<FileDiff size={14} />}>
        <DetailPanel.Properties variant="rail">
          <DetailPanel.Property label="Files" value={formatFiles(props.run) ? <FileChangeLine run={props.run} /> : undefined} />
          <DetailPanel.Property label="Branch" mono value={text(branch())} />
          <DetailPanel.Property label="Worktree" value={worktreeStatus() ? <StatusChip tone={dispatchStatusTone(worktreeStatus())} label={worktreeStatus()} /> : undefined} />
          <DetailPanel.Property label="Path" mono value={text(path())} />
          <DetailPanel.Property label="Merged" mono value={text(props.run.mergeSha)} />
        </DetailPanel.Properties>
      </RailGroup>
      <Show when={linked()}>
        <RailGroup title="Linked runs" icon={<Route size={14} />}>
          <div class="flex flex-col gap-0.5 px-1">
            <Show when={props.run.resumedOf.trim()}>
              <LinkedRunRow label={`Resumed from ${shortRunId(props.run.resumedOf)}`} seed={`${props.run.id}:resumed-of`} onOpen={() => props.onSelect(props.run.resumedOf)} />
            </Show>
            <For each={props.resumedBy}>
              {(next) => (
                <LinkedRunRow label={`Resumed by ${next.agent || "agent"} · ${shortRunId(next.id)}`} agent={next.agent} seed={next.id} status={next.status} onOpen={() => props.onSelect(next.id)} />
              )}
            </For>
            <For each={props.childRuns}>
              {(child) => (
                <LinkedRunRow label={`Child ${child.agent || "agent"} · ${shortRunId(child.id)}`} agent={child.agent} seed={child.id} status={child.status} onOpen={() => props.onSelect(child.id)} />
              )}
            </For>
          </div>
        </RailGroup>
      </Show>
    </>
  );
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <RailPage
        trail={[{ label: "Runs", onSelect: () => props.onBack() }]}
        title={promptTitle() || shortRunId(props.run.id)}
        onBack={() => props.onBack()}
        actions={actions()}
        rail={rail()}
        railStorageKey="polterware.run.rail"
        lead={<RunAgentBar run={props.run} attempts={attempts()} />}
        wide
      >
        <div class="flex min-w-0 flex-col gap-6 pt-2">
          <Show when={promptRest()}>
            {(rest) => (
              <RailGroup title="Prompt" icon={<FileText size={14} />}>
                <p class="m-0 whitespace-pre-wrap px-1 text-[13px] leading-5 text-[var(--color-text-secondary)]">{rest()}</p>
              </RailGroup>
            )}
          </Show>
          <RunTranscript log={props.log} answer={props.answer} live={props.live} />
          <div ref={logEnd} />
        </div>
      </RailPage>
    </div>
  );
}
