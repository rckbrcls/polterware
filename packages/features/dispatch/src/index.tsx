import { For, Index, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { BotAvatar, agentMarkFor, botAvatarTypes, type BotAvatarType } from "@polterware/bot-avatars";
import { EntityDetailHost } from "@polterware/feature-shell";
import {
  Bot,
  Badge,
  Button,
  Card,
  Clock,
  Cpu,
  DetailPanel,
  Dialog,
  ChevronLeft,
  Field,
  FileDiff,
  FileText,
  FilterPopover,
  Folder,
  Gauge,
  GitBranch,
  Input,
  PageContent,
  PageEmpty,
  PageToolbar,
  Tabs,
  Play,
  ProgressBar,
  Route,
  Select,
  SegmentDisplay,
  Settings,
  ShieldCheck,
  Skeleton,
  SparkChart,
  StatusChip,
  StickyNote,
  Stop,
  Terminal,
  Textarea,
  ToolbarIconButton,
  pushToast,
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
  mapDispatchWorktrees,
} from "./dispatch-bridge";
import type {
  DispatchAgentView,
  DispatchCapacityView,
  DispatchQuotaSnapshotView,
  DispatchRunEventView,
  DispatchRunView,
  DispatchTab,
  DispatchTierView,
  DispatchWatchEventView,
  DispatchWorktreeView,
} from "./dispatch-types";
import { DispatchLearningPage } from "./learning-page";
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

type InvolvedAgent = { agent: string; failed: boolean; seed: string };

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

/** Failed attempts in order, then the agent that finished the run. */
function involvedAgents(run: DispatchRunView): InvolvedAgent[] {
  const items: InvolvedAgent[] = run.attempts.map((attempt, index) => ({
    agent: attempt.agent.trim() || "agent",
    failed: true,
    seed: `${run.id}:attempt:${index}`,
  }));
  const finalAgent = run.agent.trim() || "agent";
  const last = items[items.length - 1];
  if (last && last.agent === finalAgent) last.failed = false;
  else items.push({ agent: finalAgent, failed: false, seed: `${run.id}:final` });
  return items;
}

function shortRunId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function shortPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (!path || parts.length <= 3) return path || "—";
  return `…/${parts.slice(-3).join("/")}`;
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

function TierMeter(props: { label: string; value: number; tone: "blue" | "violet" }) {
  const value = () => Math.max(0, Math.min(10, props.value));
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-secondary)]">
        <span>{props.label}</span>
        <span class="tabular-nums">{props.value}/10</span>
      </div>
      <ProgressBar label={props.label} value={value() * 10} aria-valuetext={`${value()} out of 10`} tone={props.tone} size="sm" />
    </div>
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

const DEFAULT_DISPATCH_TABS = [
  { id: "runs", label: "Runs" },
  { id: "agents", label: "Agents" },
];

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
  const tierCards = createMemo(() => DEFAULT_TIER_OPTIONS.map((tier) => ({
    ...tier,
    candidates: tiers().filter((candidate) => candidate.name === tier.value)
      .sort((a, b) => a.position - b.position),
  })).filter((tier) => tier.candidates.length > 0));
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
    const items = runs();
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

  const runDetailOpen = () => activeTab() === "runs" && Boolean(selectedRun());

  return (
    <EntityDetailHost>
      <Show when={!runDetailOpen()}>
        <PageToolbar.Root>
          <Show
            when={activeTab() !== "stats" && routeTabs().length > 1}
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
            <Show when={activeTab() === "runs"}>
              <ToolbarIconButton label="Start run" onClick={() => setStartOpen(true)}>
                <Play size={14} />
              </ToolbarIconButton>
            </Show>
            <Show when={activeTab() === "stats"}>
              <FilterPopover
                ariaLabel="Stats filters"
                title="Filter stats"
                active={statsBy() !== "day" || statsSince() !== "7d"}
                onClear={() => {
                  setStatsBy("day");
                  setStatsSince("7d");
                }}
                groups={[
                  {
                    id: "group-by",
                    label: "Group by",
                    selectionMode: "single",
                    options: DISPATCH_STATS_BY_OPTIONS.map((option) => ({
                      id: option.value,
                      label: option.label,
                      checked: statsBy() === option.value,
                      onCheckedChange: (checked: boolean) => {
                        if (checked) setStatsBy(option.value);
                      },
                    })),
                  },
                  {
                    id: "since",
                    label: "Since",
                    selectionMode: "single",
                    options: DISPATCH_STATS_SINCE_OPTIONS.map((option) => ({
                      id: option.value,
                      label: option.label,
                      checked: statsSince() === option.value,
                      onCheckedChange: (checked: boolean) => {
                        if (checked) setStatsSince(option.value);
                      },
                    })),
                  },
                ]}
              />
              <Show when={statsInFlight() > 0}>
                <StatusChip tone="syncing" label={`${statsInFlight()} in flight`} />
              </Show>
            </Show>
          </PageToolbar.Actions>
        </PageToolbar.Root>
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
              live={isRunActive(run().status)}
              now={now()}
              cancelling={cancellingId() === run().id}
              onCancel={() => void handleCancelRun(run().id)}
            />
          )}
        </Match>

        <Match when={activeTab() === "runs"}>
          <PageContent class="flex min-h-0 flex-1 flex-col p-0">
            <div class="min-h-0 flex-1 overflow-auto p-3">
              <Show
                when={runs().length > 0}
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
                      title="No dispatch runs yet"
                      description="Start a run to delegate a task to a worker agent."
                    />
                  </Show>
                }
              >
                <div
                  role="listbox"
                  aria-label="Dispatch runs"
                  class="flex flex-col gap-2"
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
                  <Index each={runs()}>
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
              when={agentCards().length > 0}
              fallback={<PageEmpty title="No agents registered" description="Registered worker agents and their quota snapshots appear here." />}
            >
              <div class="grid auto-rows-fr items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]">
                <For each={agentCards()}>
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
                    const facts = createMemo(() => {
                      const source = knownText(latest()?.source) || knownText(agentView()?.quotaSource);
                      const confidence = knownText(latest()?.confidence) || knownText(agentView()?.confidence);
                      const items = [
                        `Quota source: ${source ?? "unknown"}`,
                        `Confidence: ${confidence ?? "unknown"}`,
                      ];
                      for (const pool of pools()) {
                        const rollup = [
                          `${pool.windows} ${pool.windows === 1 ? "window" : "windows"}`,
                          `${pool.hitFull} hit 100%`,
                        ];
                        const leftover = pool.leftoverPct !== undefined && Number.isFinite(pool.leftoverPct)
                          ? formatUsedPercent(pool.leftoverPct)
                          : knownText(capacityPaceLabel(pool.leftover));
                        if (leftover) rollup.push(`${leftover} leftover`);
                        items.push(`${pools().length > 1 ? `${pool.key}: ` : ""}${rollup.join(" · ")}`);
                      }
                      return items.join(" · ");
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
                        <div class="flex flex-col gap-2">
                          <div class="flex items-baseline gap-2 text-[var(--color-text-primary)]">
                            <SegmentDisplay
                              value={used() === undefined ? "--" : formatUsedPercent(used())}
                              size={28}
                              aria-label={`${entry.agent} quota usage: ${formatUsedPercent(used())}`}
                            />
                            <Show when={used() === undefined}><span class="text-[11px] text-[var(--color-text-muted)]">unknown</span></Show>
                          </div>
                          <Show when={quotaWindow(latest())}>
                            {(window) => (
                              <span class="text-[12px] text-[var(--color-text-secondary)]">
                                used of {window()} window
                              </span>
                            )}
                          </Show>
                          <ProgressBar
                            label={`${entry.agent} quota usage`}
                            value={used() ?? null}
                            aria-valuetext={formatUsedPercent(used())}
                            tone="blue"
                          />
                        </div>
                        <Show when={reset() !== undefined}>
                          <span
                            class="text-[11px] tabular-nums text-[var(--color-text-muted)]"
                            title={formatWhen(latest()!.resetsAt)}
                          >
                            Resets {relativeWhen(latest()!.resetsAt, now())}
                          </span>
                        </Show>
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
                        <div class="mt-auto flex flex-col gap-2 text-[11px] leading-4 tabular-nums text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
                          <div class="flex flex-wrap items-center gap-2">
                            <span>Binary: <span class="font-mono">{agentView()?.bin || "—"}</span></span>
                            <span class="inline-flex items-center gap-1">
                              Probe risk
                              <StatusChip
                                tone={dispatchStatusTone(agentView()?.risk ?? "")}
                                label={agentView()?.risk || "unknown"}
                              />
                            </span>
                            <Show when={cooldownActive()}>
                              <StatusChip tone="warn" label="Cooldown" />
                            </Show>
                          </div>
                          <span>{facts()}</span>
                          <Show when={cooldownUntil()}>
                            {(until) => <span>Cooldown until {formatWhen(until())}</span>}
                          </Show>
                        </div>
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

            <Show
              when={tierCards().length > 0}
              fallback={<PageEmpty title="No tiers configured" description="Configure dispatch tiers in the core." />}
            >
              <div class="grid auto-rows-fr items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]">
                <For each={tierCards()}>
                  {(tier) => (
                    <Card class="flex h-full min-w-0 flex-col gap-4 p-3.5">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {tier.label}
                        </span>
                        <StatusChip tone="muted" label={`#${tier.candidates[0]!.position}`} />
                      </div>
                      <div class="flex flex-col gap-4">
                        <For each={tier.candidates}>
                          {(candidate, index) => (
                            <div class="flex min-w-0 flex-col gap-3">
                              <div class="flex min-w-0 items-center gap-2">
                                <DispatchAgentAvatar agent={candidate.agent} seed={candidate.agent} />
                                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span class="truncate text-[13px] font-medium text-[var(--color-text-primary)]" title={candidate.agent}>
                                    {candidate.agent || "—"}
                                  </span>
                                  <span class="truncate text-[11px] text-[var(--color-text-secondary)]" title={candidate.provider}>
                                    {candidate.provider || "—"}
                                  </span>
                                </div>
                                <Show when={index() > 0}>
                                  <StatusChip tone="muted" label={`#${candidate.position}`} />
                                </Show>
                              </div>
                              <span class="font-mono text-[12px] text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
                                {candidate.model || "—"}
                              </span>
                              <div class="grid grid-cols-2 gap-3">
                                <TierMeter label="Speed" value={candidate.speed} tone="blue" />
                                <TierMeter label="Strength" value={candidate.strength} tone="violet" />
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Card>
                  )}
                </For>
              </div>
            </Show>
          </PageContent>
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
          <DispatchLearningPage />
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

function RunFact(props: {
  title: string;
  icon: JSX.Element;
  aside?: JSX.Element;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <DetailPanel.Section
      class={`!mt-0 h-full min-w-0 !gap-1.5 !p-3 ${props.class ?? ""}`}
      title={props.title}
      icon={props.icon}
      aside={props.aside}
    >
      {props.children}
    </DetailPanel.Section>
  );
}

type RunFactKey = "agents" | "model" | "route" | "timing" | "worktree" | "files" | "verification" | "note";

function RunFactGrid(props: { layout: "list" | "detail"; children: JSX.Element }) {
  return (
    <div class="@container min-w-0">
      <div
        class={
          props.layout === "detail"
            ? "grid grid-cols-1 items-stretch gap-3 @sm:grid-cols-2 @xl:grid-cols-6"
            : "grid items-stretch gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13.5rem),1fr))]"
        }
      >
        {props.children}
      </div>
    </div>
  );
}

function RunFacts(props: {
  run: DispatchRunView;
  worktree?: DispatchWorktreeView;
  showVerification?: boolean;
  trailing?: JSX.Element;
  layout?: "list" | "detail";
}) {
  const layout = () => props.layout ?? "list";
  const branch = () => (props.worktree?.branch || props.run.branch).trim();
  const path = () => (props.worktree?.path || props.run.worktree).trim();
  const status = () => props.worktree?.status.trim() || "";
  const model = () => modelLabel(props.run);
  const route = () => routeLabel(props.run);
  const timing = () => timingLabel(props.run);
  const files = () => formatFiles(props.run);
  const note = () => props.run.note.trim();
  const verification = () => props.run.verification.trim();
  const involved = () => involvedAgents(props.run);
  const showWorktree = () => Boolean(branch() || path() || status());
  const keys = createMemo(() => {
    const next: RunFactKey[] = [];
    if (involved().length > 1) next.push("agents");
    if (model()) next.push("model");
    if (route()) next.push("route");
    if (timing()) next.push("timing");
    if (showWorktree()) next.push("worktree");
    if (files()) next.push("files");
    if (props.showVerification && verification()) next.push("verification");
    if (note()) next.push("note");
    return next;
  });
  const spanFor = (key: RunFactKey) => {
    if (layout() !== "detail") return "";
    return key === "note" ? "col-span-full" : "col-span-1 @xl:col-span-2";
  };
  const factText = (value: string, numeric = false) => (
    <p class={`m-0 truncate text-[12px] leading-4 text-[var(--color-text-secondary)] ${numeric ? "tabular-nums" : ""}`}>
      {value}
    </p>
  );
  if (layout() === "list") {
    return (
      <Show when={route() || showWorktree() || files() || props.trailing}>
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <Show when={route()}>
              {(value) => (
                <Badge tone="muted" title={`Route: ${value()}`}>
                  <Route size={12} aria-hidden="true" />
                  <span class="ml-1">{value()}</span>
                </Badge>
              )}
            </Show>
            <Show when={showWorktree() && branch()}>
              <Badge tone="muted" title={path() || `Worktree: ${branch()}`}>
                <GitBranch size={12} aria-hidden="true" />
                <span class="ml-1 truncate font-mono">{branch()}</span>
              </Badge>
            </Show>
            <Show when={status()}>
              <StatusChip tone={dispatchStatusTone(status())} label={status()} />
            </Show>
            <span class="ml-auto inline-flex min-w-0">{props.trailing}</span>
          </div>
        </div>
      </Show>
    );
  }
  return (
    <Show when={keys().length > 0}>
      <RunFactGrid layout={layout()}>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "agents"}>
              <RunFact title="Agents" icon={<Bot size={14} />} class={spanFor(key)}>
                <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <For each={avatarWindow(involved())}>
                    {(entry) => (
                      <span class="inline-flex shrink-0 items-center gap-0.5">
                        <Show when={entry.gap}>
                          <span class="px-0.5 text-[11px] text-[var(--color-text-muted)]">…</span>
                        </Show>
                        <DispatchAgentAvatar
                          agent={entry.item.agent}
                          seed={entry.item.seed}
                          status={entry.item.failed ? "failed" : props.run.status}
                          size={entry.item.failed ? 16 : 20}
                        />
                      </span>
                    )}
                  </For>
                  <span class="truncate text-[12px] leading-4 text-[var(--color-text-secondary)]">
                    {involved().length} agents
                  </span>
                </div>
              </RunFact>
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "model" && model()}>
              {(value) => (
                <RunFact title="Model" icon={<Cpu size={14} />} class={spanFor(key)}>
                  {factText(value())}
                </RunFact>
              )}
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "route" && route()}>
              {(value) => (
                <RunFact title="Route" icon={<Route size={14} />} class={spanFor(key)}>
                  {factText(value())}
                </RunFact>
              )}
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "timing" && timing()}>
              {(value) => (
                <RunFact title="Timing" icon={<Clock size={14} />} class={spanFor(key)}>
                  {factText(value(), true)}
                </RunFact>
              )}
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "worktree"}>
              <RunFact
                title="Worktree"
                icon={<GitBranch size={14} />}
                class={spanFor(key)}
                aside={status() ? <StatusChip tone={dispatchStatusTone(status())} label={status()} /> : undefined}
              >
                <div class="flex min-w-0 flex-col gap-1">
                  <Show when={branch()}>
                    <span class="truncate font-mono text-[12px] leading-4 text-[var(--color-text-secondary)]" title={branch()}>
                      {branch()}
                    </span>
                  </Show>
                  <Show when={path()}>
                    <span
                      class="truncate text-end font-mono text-[11px] leading-4 text-[var(--color-text-muted)]"
                      dir="rtl"
                      title={path()}
                    >
                      <span dir="ltr">{path()}</span>
                    </span>
                  </Show>
                </div>
              </RunFact>
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "files" && files()}>
              <RunFact title="Files" icon={<FileDiff size={14} />} class={spanFor(key)}>
                <FileChangeLine run={props.run} />
              </RunFact>
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "verification" && verification()}>
              {(value) => (
                <RunFact title="Verification" icon={<ShieldCheck size={14} />} class={spanFor(key)}>
                  {factText(value())}
                </RunFact>
              )}
            </Show>
          )}
        </For>
        <For each={keys()}>
          {(key) => (
            <Show when={key === "note" && note()}>
              {(value) => (
                <RunFact title="Note" icon={<StickyNote size={14} />} class={spanFor(key)}>
                  <p class="m-0 flex min-w-0 items-center gap-1 truncate text-[12px] leading-4 text-[var(--color-text-muted)]" title={value()}>
                    <span class="truncate">{value()}</span>
                  </p>
                </RunFact>
              )}
            </Show>
          )}
        </For>
      </RunFactGrid>
    </Show>
  );
}

function avatarWindow(items: readonly InvolvedAgent[]): { item: InvolvedAgent; gap: boolean }[] {
  if (items.length <= 4) return items.map((item) => ({ item, gap: false }));
  const tail = items.length - 2;
  return [
    { item: items[0]!, gap: false },
    { item: items[tail]!, gap: true },
    { item: items[tail + 1]!, gap: false },
  ];
}

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
  const identity = () => dotted(props.run.agent, props.run.model);
  const duration = () => {
    if (props.run.runMs !== undefined) return measuredDuration(props.run.runMs);
    return measuredDuration(props.run.queuedMs);
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
      class={`min-w-0 rounded-[var(--radius-card)] outline-offset-2 transition-[outline-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none ${props.selected ? "outline outline-1 outline-[var(--color-accent)]" : ""}`}
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
      <Card class="flex min-w-0 flex-col gap-3">
        <div class="flex min-h-7 min-w-0 items-center gap-2">
          <span class="inline-flex shrink-0">
            <DispatchAgentAvatar agent={props.run.agent} seed={props.run.id} status={props.run.status} />
          </span>
          <span class="min-w-0 shrink truncate text-[13px] leading-5 text-[var(--color-text-primary)]" title={props.run.prompt || "—"}>
            {props.run.prompt || "—"}
          </span>
          <span class="min-w-0 max-w-[min(18rem,28%)] shrink-[2] truncate font-mono text-[11px] text-[var(--color-text-muted)]" title={identity()}>
            {identity()}
          </span>
          <span class="flex-1" aria-hidden="true" />
          <StatusChip tone={dispatchStatusTone(props.run.status)} label={props.run.status || "unknown"} />
          <span class="shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]" title={props.run.id}>
            {shortRunId(props.run.id)}
          </span>
          <FileChangeLine run={props.run} />
          <Show when={isRunActive(props.run.status)}>
            <Button size="sm" variant="ghost" disabled={props.cancelling} onClick={() => props.onCancel()}>
              <Stop size={12} />
              Cancel
            </Button>
          </Show>
        </div>
        <Show when={props.run.note.trim()}>
          <p class="m-0 flex min-w-0 items-center gap-1 truncate text-[12px] leading-4 text-[var(--color-text-muted)]" title={props.run.note.trim()}>
            <span class="truncate">{props.run.note.trim()}</span>
          </p>
        </Show>
        <RunFacts run={props.run} worktree={props.worktree} trailing={
          <span class="inline-flex min-h-7 shrink-0 items-center gap-2 text-[11px] tabular-nums text-[var(--color-text-muted)]">
            <span>{formatAgo(props.run.createdAt || props.run.startedAt, props.now)}</span>
            <span class="inline-flex items-center gap-1">
              <Clock size={12} />
              {duration()}
            </span>
          </span>
        } />
      </Card>
    </article>
  );
}

function LinkedRunCard(props: {
  label: string;
  title: string;
  agent?: string;
  seed: string;
  status?: string;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={props.label}
      class="cursor-pointer rounded-[var(--radius-card)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-border-strong)]"
      onClick={() => props.onOpen()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <DetailPanel.Section
        class="!mt-0"
        title={props.title}
        icon={<DispatchAgentAvatar agent={props.agent} seed={props.seed} status={props.status} size={18} />}
        aside={props.status ? <StatusChip tone={dispatchStatusTone(props.status)} label={props.status} /> : undefined}
      >
        <span class="font-mono text-[12px] text-[var(--color-text-muted)]">{props.label}</span>
      </DetailPanel.Section>
    </div>
  );
}

function DispatchRunDetail(props: {
  run: DispatchRunView;
  childRuns: readonly DispatchRunView[];
  resumedBy: readonly DispatchRunView[];
  onSelect: (id: string) => void;
  onBack: () => void;
  worktree?: DispatchWorktreeView;
  log: string;
  live: boolean;
  now: number;
  cancelling: boolean;
  onCancel: () => void;
}) {
  let logEnd: HTMLDivElement | undefined;
  createEffect(() => {
    props.log;
    if (!props.live) return;
    logEnd?.scrollIntoView({ block: "nearest" });
  });
  const branch = () => (props.worktree?.branch || props.run.branch).trim();
  const path = () => (props.worktree?.path || props.run.worktree).trim();
  const duration = () => {
    if (props.run.runMs !== undefined) return measuredDuration(props.run.runMs);
    if (isRunActive(props.run.status)) {
      const start = parseTime(props.run.startedAt || props.run.createdAt);
      if (start !== undefined) return formatDuration(Math.max(0, props.now - start));
    }
    return measuredDuration(props.run.queuedMs);
  };
  const attempts = () => agentAttemptCards(props.run);
  return (
    <PageContent class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => props.onBack()}>
          <ChevronLeft size={14} />
          Back
        </Button>
        <StatusChip tone={dispatchStatusTone(props.run.status)} label={props.run.status || "unknown"} />
        <span class="min-w-0 truncate font-mono text-[12px] text-[var(--color-text-muted)]" title={props.run.id}>
          {props.run.id}
        </span>
        <span class="ml-auto inline-flex shrink-0 items-center gap-2">
          <span class="inline-flex items-center gap-1 text-[12px] tabular-nums text-[var(--color-text-muted)]">
            <Clock size={12} />
            {duration()}
          </span>
          <Show when={isRunActive(props.run.status)}>
            <Button size="sm" variant="ghost" disabled={props.cancelling} onClick={() => props.onCancel()}>
              <Stop size={12} />
              Cancel
            </Button>
          </Show>
        </span>
      </div>
      <p class="m-0 whitespace-pre-wrap text-[13px] leading-5 text-[var(--color-text-primary)]">
        {props.run.prompt || "—"}
      </p>
      <RunFacts run={props.run} worktree={props.worktree} showVerification layout="detail" />
      <DetailPanel.Section
        class="!mt-0"
        title="Agents involved"
        icon={<Bot size={14} />}
        aside={
          <span class="text-[12px] tabular-nums text-[var(--color-text-muted)]">
            {attempts().length} {attempts().length === 1 ? "agent" : "agents"}
          </span>
        }
      >
        <div class="flex flex-col gap-2">
          <For each={attempts()}>
            {(attempt) => (
              <DetailPanel.Section
                class="!mt-0"
                title={attempt.title}
                icon={
                  <DispatchAgentAvatar
                    agent={attempt.agent}
                    seed={attempt.key}
                    status={attempt.status}
                    size={18}
                  />
                }
                aside={
                  <span class="inline-flex items-center gap-2">
                    <StatusChip tone={dispatchStatusTone(attempt.status)} label={attempt.status} />
                    <Show when={attempt.durationMs !== undefined}>
                      <span class="tabular-nums text-[11px] text-[var(--color-text-muted)]">
                        {measuredDuration(attempt.durationMs)}
                      </span>
                    </Show>
                  </span>
                }
              >
                <Show when={attempt.error}>
                  <p class="m-0 whitespace-pre-wrap text-[12px] text-[var(--color-danger)]">{attempt.error}</p>
                </Show>
                <Show when={attempt.final && (branch() || path())}>
                  <div class="flex flex-col gap-1 text-[12px] text-[var(--color-text-secondary)]">
                    <Show when={branch()}>
                      <span class="inline-flex min-w-0 items-center gap-1.5">
                        <GitBranch size={12} class="shrink-0" />
                        <span class="truncate font-mono">{branch()}</span>
                      </span>
                    </Show>
                    <Show when={path()}>
                      <span class="inline-flex min-w-0 items-center gap-1.5">
                        <Folder size={12} class="shrink-0" />
                        <span class="truncate font-mono">{shortPath(path())}</span>
                      </span>
                    </Show>
                  </div>
                </Show>
              </DetailPanel.Section>
            )}
          </For>
          <Show when={props.run.resumedOf.trim()}>
            <LinkedRunCard
              label={`Resumed from ${shortRunId(props.run.resumedOf)}`}
              title="Resumed from"
              seed={`${props.run.id}:resumed-of`}
              onOpen={() => props.onSelect(props.run.resumedOf)}
            />
          </Show>
          <For each={props.resumedBy}>
            {(next) => (
              <LinkedRunCard
                label={`Resumed by ${next.agent || "agent"} · ${shortRunId(next.id)}`}
                title={`Resumed by ${next.agent || "agent"}`}
                agent={next.agent}
                seed={next.id}
                status={next.status}
                onOpen={() => props.onSelect(next.id)}
              />
            )}
          </For>
          <For each={props.childRuns}>
            {(child) => (
              <LinkedRunCard
                label={`Child ${child.agent || "agent"} · ${shortRunId(child.id)}`}
                title={`Child ${child.agent || "agent"}`}
                agent={child.agent}
                seed={child.id}
                status={child.status}
                onOpen={() => props.onSelect(child.id)}
              />
            )}
          </For>
        </div>
      </DetailPanel.Section>
      <DetailPanel.Section
        class="!mt-0"
        title="Log"
        icon={<Terminal size={14} />}
        aside={
          <span class="inline-flex items-center gap-2">
            <span class="text-[12px] text-[var(--color-text-muted)]">
              {props.log.trim()
                ? `${props.log.split("\n").length} ${props.log.split("\n").length === 1 ? "line" : "lines"}`
                : props.live
                  ? "Waiting"
                  : "No output"}
            </span>
            <Show when={props.live}>
              <StatusChip tone="syncing" label="Live" />
            </Show>
          </span>
        }
      >
        <div class="pw-scroll-fade max-h-72 overflow-auto font-mono text-[12px] leading-5 whitespace-pre-wrap text-[var(--color-text-secondary)]">
          <Show
            when={props.log.trim()}
            fallback={
              <p class="m-0 text-[var(--color-text-muted)]">
                {props.live ? "Waiting for agent output…" : "No agent output recorded."}
              </p>
            }
          >
            {props.log}
          </Show>
          <div ref={logEnd} />
        </div>
      </DetailPanel.Section>
    </PageContent>
  );
}
