import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js";
import {
  Button, Check, Copy, HelpCircle, History, Play, RailGroup, ShieldCheck, SourceCodeIcon, StatusChip, X, pushToast,
  type StatusTone,
} from "@polterware/frontend-design-system";
import { requestSectionNavigate } from "@polterware/feature-shell";
import { activeProjectId } from "@polterware/frontend-state";
import {
  cardRuns, gateChecks, latestHandoff, mapVerification, nextGate,
  type CardGateCheck, type CardHandoff, type CardRun, type CardVerification,
} from "./work-card-model";

type CoreCall = (payload: Record<string, unknown>) => Promise<unknown>;
type CardBridge = { reviewFeature?: CoreCall; verifyFeature?: CoreCall; query?: CoreCall; listAgentSessions?: CoreCall; listRuns?: CoreCall };

function cardBridge(): CardBridge {
  const core = (globalThis as { polterware?: { core?: { work?: Record<string, CoreCall>; dispatch?: Record<string, CoreCall> } } }).polterware?.core;
  return {
    reviewFeature: core?.work?.reviewFeature, verifyFeature: core?.work?.verifyFeature, query: core?.work?.query,
    listAgentSessions: core?.work?.listAgentSessions, listRuns: core?.dispatch?.listRuns,
  };
}

const runTone = (status: string): StatusTone =>
  status === "merged" || status === "completed" || status === "verified" ? "ok"
  : status === "running" || status === "queued" || status === "started" ? "syncing"
  : status === "failed" || status === "cancelled" || status === "timeout" ? "danger" : "muted";

function when(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : value;
}

/**
 * What a card needs to move on, in its page's column: the next stage gate with the checks
 * that hold it (passed inline), the last verification, the latest handoff, the runs that
 * worked on it, and the brief an agent reads before it starts.
 */
export function WorkCardWork(props: {
  slug: string;
  stage: string;
  /** Passes the gate; resolves with the refusal lines, empty when the card moved on. */
  onAdvance?: (step: "contract" | "plan") => Promise<string[]>;
  /** Groups shown before the next steps, such as the card's Tasks and Invariants. */
  leading?: JSX.Element;
}) {
  const [checks, setChecks] = createSignal<CardGateCheck[]>([]);
  const [refusal, setRefusal] = createSignal<string[]>([]);
  const [advancing, setAdvancing] = createSignal(false);
  const [verification, setVerification] = createSignal<CardVerification>();
  const [verifying, setVerifying] = createSignal(false);
  const [handoff, setHandoff] = createSignal<CardHandoff>();
  const [runs, setRuns] = createSignal<CardRun[]>([]);
  const [brief, setBrief] = createSignal("");
  const [briefOpen, setBriefOpen] = createSignal(false);
  const gate = () => nextGate(props.stage);
  const blocked = () => checks().some((check) => check.severity === "error");

  // Everything is re-read when the card or its stage changes, such as after a gate passes.
  createEffect(on(() => [activeProjectId(), props.slug, props.stage] as const, ([projectId, slug, stage]) => {
    setRefusal([]);
    setVerification(undefined);
    if (!projectId || !slug) return;
    const bridge = cardBridge();
    void bridge.reviewFeature?.({ projectId, slug }).then((raw) => setChecks(gateChecks(raw, stage)), () => setChecks([]));
    void bridge.listAgentSessions?.({ projectId }).then((raw) => setHandoff(latestHandoff(raw, slug)), () => setHandoff(undefined));
    void bridge.listRuns?.({ projectId, limit: 200 }).then((raw) => setRuns(cardRuns(raw, slug)), () => setRuns([]));
    void bridge.query?.({ projectId, query: `brief ${slug}` }).then((raw) => setBrief(String((raw as { text?: unknown })?.text ?? "")), () => setBrief(""));
  }));

  async function advance() {
    const next = gate();
    if (!next || !props.onAdvance) return;
    setAdvancing(true);
    try {
      setRefusal(await props.onAdvance(next.step));
    } finally {
      setAdvancing(false);
    }
  }

  async function verify() {
    const verifyFeature = cardBridge().verifyFeature;
    if (!verifyFeature) return;
    setVerifying(true);
    try {
      setVerification(mapVerification(await verifyFeature({ projectId: activeProjectId(), target: props.slug })));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not verify the card.", "danger");
    } finally {
      setVerifying(false);
    }
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief());
      pushToast("Agent brief copied.", "success");
    } catch {
      pushToast("Could not copy the agent brief.", "danger");
    }
  }

  return (
    <div class="pw-card-work">
      {props.leading}
      <Show when={gate()}>
        {(next) => (
          <RailGroup title={next().step === "contract" ? "Contract gate" : "Plan gate"} icon={<ShieldCheck size={14} />}
            aside={<Show when={props.onAdvance}>
              <Button size="sm" variant="secondary" disabled={advancing() || blocked()} onClick={() => void advance()}>{advancing() ? "Moving…" : next().label}</Button>
            </Show>}>
            <Show when={checks().length > 0 || refusal().length > 0} fallback={<p class="pw-card-work__muted">Nothing holds this card back.</p>}>
              <ul class="pw-card-work__checks">
                <For each={[...refusal().map((message) => ({ severity: "error" as const, message })), ...checks()]}>
                  {(check) => (
                    <li class="pw-card-work__check" data-severity={check.severity}>
                      <span class="pw-card-work__check-icon">{check.severity === "error" ? <X size={14} aria-label="Blocks the gate" /> : <HelpCircle size={14} aria-label="Hint" />}</span>
                      <span>{check.message}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </RailGroup>
        )}
      </Show>

      <RailGroup title="Verification" icon={<Check size={14} />}
        aside={<Button size="sm" variant="secondary" disabled={verifying()} onClick={() => void verify()}>{verifying() ? "Verifying…" : "Verify"}</Button>}>
        <Show when={verification()} fallback={<p class="pw-card-work__muted">Verify reads whether the card's tasks and checks are done. It never writes.</p>}>
          {(result) => (
            <>
              <StatusChip tone={result().passed ? "ok" : "warn"} label={result().passed ? "Passed" : "Not finished"} />
              <ul class="pw-card-work__checks">
                <For each={result().checks}>
                  {(check) => (
                    <li class="pw-card-work__check" data-severity={check.status === "fail" ? "error" : check.status === "pass" ? "pass" : "hint"}>
                      <span class="pw-card-work__check-icon">{check.status === "pass" ? <Check size={14} aria-label="Pass" /> : check.status === "fail" ? <X size={14} aria-label="Fail" /> : <HelpCircle size={14} aria-label={check.status === "manual" ? "Manual" : "Info"} />}</span>
                      <span>{check.message}</span>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>
      </RailGroup>

      <Show when={handoff()}>
        {(last) => (
          <RailGroup title="Last handoff" icon={<History size={14} />}
            aside={<span class="pw-card-work__muted">{[last().agent, last().branch, when(last().at)].filter(Boolean).join(" / ")}</span>}>
            <dl class="pw-card-work__handoff">
              <For each={[["Goal", last().goal], ["Done", last().done], ["In progress", last().inProgress], ["Next", last().next]].filter(([, value]) => value)}>
                {([label, value]) => <><dt>{label}</dt><dd>{value}</dd></>}
              </For>
            </dl>
          </RailGroup>
        )}
      </Show>

      <Show when={runs().length > 0}>
        <RailGroup title="Runs" icon={<Play size={14} />} aside={<span class="pw-card-work__muted">{runs().length}</span>}>
          <ul class="pw-card-work__runs" aria-label="Runs on this card">
            <For each={runs()}>
              {(run) => (
                <li>
                  <button type="button" class="pw-card-work__run" onClick={() => requestSectionNavigate("dispatch", "runs")}>
                    <StatusChip tone={runTone(run.status)} label={run.status || "queued"} />
                    <span class="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">{run.prompt || run.id}</span>
                    <span class="pw-card-work__muted shrink-0">{[run.agent, when(run.at)].filter(Boolean).join(" / ")}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </RailGroup>
      </Show>

      <Show when={brief().trim()}>
        <RailGroup title="Agent brief" icon={<SourceCodeIcon size={14} />}
          aside={<span class="inline-flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-expanded={briefOpen()} onClick={() => setBriefOpen((open) => !open)}>{briefOpen() ? "Hide" : "Preview"}</Button>
            <Button size="icon" variant="ghost" aria-label="Copy agent brief" onClick={() => void copyBrief()}><Copy size={14} /></Button>
          </span>}>
          <Show when={briefOpen()} fallback={<p class="pw-card-work__muted">What an agent reads before it works on this card (<code>polterware brief {props.slug}</code>).</p>}>
            <pre class="pw-card-work__brief pw-selectable">{brief()}</pre>
          </Show>
        </RailGroup>
      </Show>
    </div>
  );
}
