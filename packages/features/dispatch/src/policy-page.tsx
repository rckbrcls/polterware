import { For, Show, createSignal, onMount, type JSX } from "solid-js";
import {
  Button,
  Field,
  FilterChip,
  Input,
  Select,
  SettingsSection,
  StatusChip,
  SwitchRow,
  Textarea,
  X,
  pushToast,
} from "@polterware/frontend-design-system";
import { dispatchBridge, dispatchOpBody, mapDispatchAgents } from "./dispatch-bridge";

const TIERS = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

const PRIORITIES = [
  { value: "balanced", label: "Balanced" },
  { value: "speed", label: "Speed" },
  { value: "quality", label: "Quality" },
];

const DIMENSIONS = ["providers", "models", "agents"] as const;
type Dimension = (typeof DIMENSIONS)[number];
type RuleSet = Partial<Record<Dimension, string[]>>;
type Policy = { priority: string; discover: boolean; allow: RuleSet; deny: RuleSet };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function readPolicy(body: Record<string, unknown>): Policy {
  return {
    priority: typeof body.priority === "string" ? body.priority : "",
    discover: body.discover === true,
    allow: asRecord(body.allow) as RuleSet,
    deny: asRecord(body.deny) as RuleSet,
  };
}

/** Runs one dispatch op and toasts its error; resolves the parsed body, or undefined on failure. */
async function runOp(call: (() => Promise<unknown>) | undefined, failure: string) {
  if (!call) {
    pushToast("This core does not support it yet.", "danger");
    return undefined;
  }
  try {
    return dispatchOpBody(await call());
  } catch (error: unknown) {
    pushToast(error instanceof Error ? error.message : failure, "danger");
    return undefined;
  }
}

/**
 * App settings › Dispatch policy: what the CLI's route, classify, config, subagents, verify --init,
 * and skill commands do, from the Desktop. Every write goes through the core (`DispatchService`).
 */
export function DispatchPolicySettings(props: {
  /** The project's checkout, for the project policy, subagents, and verify.json. */
  projectDir: string;
}) {
  const bridge = () => dispatchBridge();
  // Agent names the router knows, for the agent picker.
  const [agents, setAgents] = createSignal<string[]>([]);

  // Route: which agent a run with these options would get, without starting it.
  const [routeTier, setRouteTier] = createSignal("normal");
  const [routeAgent, setRouteAgent] = createSignal("");
  const [routeReadOnly, setRouteReadOnly] = createSignal(false);
  const [route, setRoute] = createSignal<{ candidates: Record<string, unknown>[]; eliminated: string[]; reason: string } | null>(null);
  const simulate = async () => {
    const result = await runOp(
      bridge()?.route && (() => bridge()!.route!({ tier: routeTier(), agent: routeAgent(), readOnly: routeReadOnly(), dir: props.projectDir })),
      "Could not route.",
    );
    if (!result) return;
    setRoute({
      candidates: (Array.isArray(result.body.candidates) ? result.body.candidates : []).map(asRecord),
      eliminated: asStrings(result.body.eliminated),
      reason: String(result.body.reason ?? ""),
    });
  };

  // Classify: the tier the learned classifier suggests for a prompt.
  const [prompt, setPrompt] = createSignal("");
  const [classifyTier, setClassifyTier] = createSignal("normal");
  const [prediction, setPrediction] = createSignal<Record<string, unknown> | null>(null);
  const classify = async () => {
    const result = await runOp(
      bridge()?.classify && (() => bridge()!.classify!({ tier: classifyTier(), prompt: prompt(), dir: props.projectDir })),
      "Could not classify.",
    );
    if (result) setPrediction(asRecord(result.body.prediction));
  };

  // Policy: the global routing policy, or the project's when the switch is on.
  const [projectScope, setProjectScope] = createSignal(false);
  const [policy, setPolicy] = createSignal<Policy | null>(null);
  const [adding, setAdding] = createSignal<Record<string, string>>({});
  const config = (payload: { action: string; key?: string; values?: string[] }) =>
    bridge()?.config && (() => bridge()!.config!({ ...payload, dir: props.projectDir, project: projectScope() }));
  const loadPolicy = async () => {
    const result = await runOp(config({ action: "get" }), "Could not read the routing policy.");
    setPolicy(result ? readPolicy(result.body) : null);
  };
  const writePolicy = async (payload: { action: string; key: string; values: string[] }) => {
    const result = await runOp(config(payload), "Could not save the routing policy.");
    if (result) await loadPolicy();
  };

  // Subagents: named profiles a run can take (`--subagent`).
  const [profiles, setProfiles] = createSignal<string[]>([]);
  const [problems, setProblems] = createSignal<string[] | null>(null);
  const subagents = (action: string) => bridge()?.subagents && (() => bridge()!.subagents!({ action, dir: props.projectDir }));
  const loadProfiles = async () => {
    const result = await runOp(subagents("list"), "Could not list subagents.");
    if (result) setProfiles(Object.keys(asRecord(result.body.profiles)).sort());
  };

  onMount(() => {
    void bridge()?.listAgents({}).then((raw) => setAgents(mapDispatchAgents(raw).map((agent) => agent.name)), () => undefined);
    void loadPolicy();
    void loadProfiles();
  });

  const wrote = (body: Record<string, unknown>, fallback: string) => pushToast(`Wrote ${String(body.wrote ?? fallback)}.`, "success");

  return (
    <div class="grid gap-6">
        <SettingsSection title="Try a route" description="Which agent a run with these options would get, in order, without starting it.">
          <div class="grid grid-cols-2 gap-3">
            <Field label="Tier">
              <Select aria-label="Route tier" options={TIERS} value={routeTier()} onChange={setRouteTier} />
            </Field>
            <Field label="Agent">
              <Select
                aria-label="Route agent"
                options={[{ value: "", label: "Any agent" }, ...agents().map((name) => ({ value: name, label: name }))]}
                value={routeAgent()}
                onChange={setRouteAgent}
              />
            </Field>
          </div>
          <SwitchRow label="Read only" checked={routeReadOnly()} onCheckedChange={setRouteReadOnly} />
          <div><Button size="sm" variant="primary" onClick={() => void simulate()}>Route</Button></div>
          <Show when={route()}>
            {(report) => (
              <div class="flex flex-col gap-2 text-[12.5px]">
                <Show when={report().reason}><p class="m-0 text-[var(--color-text-secondary)]">{report().reason}</p></Show>
                <ol class="m-0 grid list-none gap-1 p-0" aria-label="Candidates">
                  <For each={report().candidates} fallback={<li class="text-[var(--color-text-muted)]">No agent can take this run.</li>}>
                    {(candidate, index) => (
                      <li class="flex items-center gap-2">
                        <span class="w-5 tabular-nums text-[var(--color-text-muted)]">{index() + 1}</span>
                        <span class="font-mono">{String(candidate.Agent ?? "")}</span>
                        <span class="font-mono text-[var(--color-text-muted)]">{String(candidate.Model ?? "")}</span>
                        <span class="ml-auto text-[var(--color-text-muted)]">{String(candidate.reason ?? "")}</span>
                      </li>
                    )}
                  </For>
                </ol>
                <For each={report().eliminated}>{(line) => <p class="m-0 text-[var(--color-text-muted)]">{line}</p>}</For>
              </div>
            )}
          </Show>
        </SettingsSection>

        <SettingsSection title="Classify a prompt" description="The tier the learned classifier suggests, from the runs it has verified.">
          <Field label="Prompt">
            <Textarea aria-label="Prompt to classify" rows={3} value={prompt()} onInput={(event) => setPrompt(event.currentTarget.value)} />
          </Field>
          <div class="flex items-end gap-3">
            <Field label="Requested tier">
              <Select aria-label="Requested tier" options={TIERS} value={classifyTier()} onChange={setClassifyTier} />
            </Field>
            <Button size="sm" variant="primary" disabled={!prompt().trim()} onClick={() => void classify()}>Classify</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await runOp(bridge()?.classify && (() => bridge()!.classify!({ resetModel: true })), "Could not reset the classifier.");
                if (result) pushToast("The classifier forgot what it learned.", "success");
              }}
            >
              Reset classifier
            </Button>
          </div>
          <Show when={prediction()}>
            {(value) => (
              <p class="m-0 flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
                Suggested tier
                <StatusChip tone="muted" label={String(value().suggestedTier ?? "")} />
                <span class="text-[var(--color-text-muted)]">
                  failure risk {Math.round(Number(value().score ?? 0) * 100)}% · {String(value().samples ?? 0)} samples
                </span>
              </p>
            )}
          </Show>
        </SettingsSection>

        <SettingsSection title="Routing policy" description="The priority, discovery, and which providers, models, and agents a run may or may not use.">
          <SwitchRow
            label="This project only"
            checked={projectScope()}
            disabled={!props.projectDir}
            onCheckedChange={(value) => { setProjectScope(value); void loadPolicy(); }}
          />
          <Show when={policy()} fallback={<p class="m-0 text-[12.5px] text-[var(--color-text-muted)]">No policy read yet.</p>}>
            {(current) => (
              <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 gap-3">
                  <Field label="Priority">
                    <Select
                      aria-label="Priority"
                      options={PRIORITIES}
                      value={current().priority || "balanced"}
                      onChange={(value) => { if (value !== (current().priority || "balanced")) void writePolicy({ action: "set", key: "priority", values: [value] }); }}
                    />
                  </Field>
                  <SwitchRow
                    label="Discover new models"
                    checked={current().discover}
                    onCheckedChange={(value) => void writePolicy({ action: "set", key: "discover", values: [String(value)] })}
                  />
                </div>
                <For each={["allow", "deny"] as const}>
                  {(side) => (
                    <For each={DIMENSIONS}>
                      {(dimension) => {
                        const key = `${side}:${dimension}`;
                        const values = () => asStrings(current()[side][dimension]);
                        return (
                          <Field label={`${side === "allow" ? "Allow" : "Deny"} ${dimension}`}>
                            <div class="flex flex-wrap items-center gap-1.5">
                              <For each={values()}>
                                {(value) => (
                                  <FilterChip
                                    aria-label={`Remove ${value}`}
                                    onClick={() => void writePolicy({ action: `${side}-rm`, key: dimension, values: [value] })}
                                  >
                                    {value}
                                    <X size={12} />
                                  </FilterChip>
                                )}
                              </For>
                              <Input
                                aria-label={`Add to ${side} ${dimension}`}
                                class="w-40"
                                placeholder="Add…"
                                value={adding()[key] ?? ""}
                                onInput={(event) => setAdding({ ...adding(), [key]: event.currentTarget.value })}
                                onKeyDown={(event) => {
                                  const value = (adding()[key] ?? "").trim();
                                  if (event.key !== "Enter" || !value) return;
                                  setAdding({ ...adding(), [key]: "" });
                                  void writePolicy({ action: `${side}-add`, key: dimension, values: [value] });
                                }}
                              />
                            </div>
                          </Field>
                        );
                      }}
                    </For>
                  )}
                </For>
              </div>
            )}
          </Show>
        </SettingsSection>

        <SettingsSection title="Subagents" description="Named profiles a run can take: a tier, the agents to prefer or avoid, and its own prompt.">
          <div class="flex flex-wrap gap-1.5">
            <For each={profiles()} fallback={<span class="text-[12.5px] text-[var(--color-text-muted)]">No subagents yet.</span>}>
              {(name) => <StatusChip tone="muted" label={name} />}
            </For>
          </div>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await runOp(subagents("check"), "Could not check subagents.");
                if (result) setProblems(asStrings(result.body.problems));
              }}
            >
              Check
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await runOp(subagents("init"), "Could not write the example subagents.");
                if (result) { wrote(result.body, "agents.json"); await loadProfiles(); }
              }}
            >
              Write example
            </Button>
          </div>
          <Show when={problems()}>
            {(lines) => (
              <Show when={lines().length > 0} fallback={<p class="m-0 text-[12.5px] text-[var(--color-text-secondary)]">Every subagent checks out.</p>}>
                <ul class="m-0 grid gap-1 pl-5 text-[12.5px] text-[var(--color-text-secondary)]">
                  <For each={lines()}>{(line) => <li>{line}</li>}</For>
                </ul>
              </Show>
            )}
          </Show>
        </SettingsSection>

        <SettingsSection title="Verify checks" description="Verify runs the commands in the repository's .dispatch/verify.json in a run's worktree.">
          <div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!props.projectDir}
              onClick={async () => {
                const result = await runOp(
                  bridge()?.initVerify && (() => bridge()!.initVerify!({ dir: props.projectDir })),
                  "Could not write verify.json.",
                );
                if (result) wrote(result.body, ".dispatch/verify.json");
              }}
            >
              Write example verify.json
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="Dispatch skill" description="The skill that teaches the agent CLIs to delegate with polterware run.">
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await runOp(bridge()?.skill && (() => bridge()!.skill!({ action: "install" })), "Could not install the skill.");
                if (!result) return;
                const installed = asStrings(result.body.installed);
                const skipped = asStrings(result.body.skipped);
                pushToast(installed.length ? `Installed for ${installed.length} agent${installed.length === 1 ? "" : "s"}.` : skipped[0] ?? "Nothing to install.", installed.length ? "success" : "default");
              }}
            >
              Install
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await runOp(bridge()?.skill && (() => bridge()!.skill!({ action: "refresh" })), "Could not refresh the skill.");
                if (!result) return;
                const refreshed = asStrings(result.body.refreshed);
                pushToast(refreshed.length ? `Refreshed ${refreshed.length} installed cop${refreshed.length === 1 ? "y" : "ies"}.` : "No installed skill to refresh.", refreshed.length ? "success" : "default");
              }}
            >
              Refresh
            </Button>
          </div>
        </SettingsSection>
    </div>
  );
}
