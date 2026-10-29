import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import { A11yDialog, Button, Field, Input, Select, StatusChip, Textarea } from "@polterware/frontend-design-system";
import type { FeatureFlowStep, WorkspaceFeatureReview } from "@polterware/feature-shell";
import { verdictStatusTone } from "./knowledge-document-helpers";
import "./new-feature-flow.css";

/** One line the flow adds to a card, or its under: value. */
export type FeatureFlowLine =
  | { kind: "invariant"; text: string }
  | { kind: "question"; text: string; blocking: boolean }
  | { kind: "task"; text: string; scope: string }
  | { kind: "under"; path: string };

const STEPS: { id: FeatureFlowStep; label: string }[] = [
  { id: "intent", label: "Intent" },
  { id: "shape", label: "Shape" },
  { id: "contract", label: "Contract" },
  { id: "plan", label: "Plan" },
];

const ROUTE_LABEL = {
  inbox: "Inbox",
  deferred: "Deferred",
  delegated: "Delegated to agent",
  answered: "Answered",
} as const;

const STAGE_ORDER = ["shape", "plan", "build", "verify", "delivered"];

function stagePast(stage: string, than: string): boolean {
  return STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(than);
}

function Section(props: { title: string; children: JSX.Element; empty?: boolean; emptyText?: string }) {
  return (
    <section class="pw-feature-flow__section">
      <h3 class="pw-feature-flow__section-title">{props.title}</h3>
      <Show when={!props.empty} fallback={<p class="pw-feature-flow__empty">{props.emptyText ?? "None."}</p>}>
        {props.children}
      </Show>
    </section>
  );
}

/**
 * New-feature flow: Intent → Shape → Contract → Plan. Intent creates the card
 * in shape; Contract and Plan are gates the core checks. The host owns every
 * write and passes back the fresh review.
 */
export function NewFeatureFlow(props: {
  open: boolean;
  step: FeatureFlowStep;
  review: WorkspaceFeatureReview | null;
  /** Active components for "Lives under", as path and title. */
  components: { path: string; title: string }[];
  busy: boolean;
  /** Gate refusals from the last advance, one per line. */
  errors: string[];
  onStepChange: (step: FeatureFlowStep) => void;
  onClose: () => void;
  onCreate: (input: { intent: string; title: string; under: string; kind: "feature" | "architecture" }) => void;
  onAddLine: (line: FeatureFlowLine) => void;
  onAdvance: (step: "contract" | "plan") => void;
}) {
  const [intent, setIntent] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [under, setUnder] = createSignal("");
  const [kind, setKind] = createSignal<"feature" | "architecture">("feature");
  const [lineKind, setLineKind] = createSignal<"invariant" | "question" | "blocking">("invariant");
  const [lineText, setLineText] = createSignal("");
  const [taskTitle, setTaskTitle] = createSignal("");
  const [taskScope, setTaskScope] = createSignal("");

  createEffect(() => {
    if (props.open) return;
    setIntent("");
    setTitle("");
    setKind("feature");
    setUnder("");
    setLineText("");
    setTaskTitle("");
    setTaskScope("");
  });

  const card = () => props.review?.card;
  const stage = () => card()?.stage ?? "shape";
  const checks = (step: FeatureFlowStep) => (props.review?.checks ?? []).filter((check) => check.step === step);
  const blocked = (step: FeatureFlowStep) => checks(step).some((check) => check.severity === "error");
  const reachable = (step: FeatureFlowStep) => (step === "intent" ? !props.review : Boolean(props.review));
  const componentOptions = () => [
    { value: "", label: "Not placed yet" },
    ...props.components.map((item) => ({ value: item.path, label: `${item.path} · ${item.title}` })),
  ];

  function addLine() {
    const text = lineText().trim();
    if (!text) return;
    const kind = lineKind();
    props.onAddLine(kind === "invariant" ? { kind, text } : { kind: "question", text, blocking: kind === "blocking" });
    setLineText("");
  }

  function addTask() {
    const text = taskTitle().trim();
    if (!text) return;
    props.onAddLine({ kind: "task", text, scope: taskScope().trim() });
    setTaskTitle("");
    setTaskScope("");
  }

  const footer = () => {
    switch (props.step) {
      case "intent":
        return (
          <>
            <Button size="sm" variant="texture" onClick={() => props.onClose()}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={props.busy || intent().trim().length === 0}
              onClick={() => props.onCreate({ intent: intent().trim(), title: title().trim(), under: under(), kind: kind() })}
            >
              Create
            </Button>
          </>
        );
      case "shape":
        return (
          <>
            <Button size="sm" variant="ghost" onClick={() => props.onClose()}>
              Save as proposed
            </Button>
            <Button size="sm" variant="primary" onClick={() => props.onStepChange("contract")}>
              Next: Contract
            </Button>
          </>
        );
      case "contract":
        return (
          <>
            <Button size="sm" variant="ghost" onClick={() => props.onStepChange("shape")}>
              Back
            </Button>
            <Show
              when={stage() === "shape"}
              fallback={
                <Button size="sm" variant="primary" onClick={() => props.onStepChange("plan")}>
                  Next: Plan
                </Button>
              }
            >
              <Button
                size="sm"
                variant="primary"
                disabled={props.busy || blocked("contract")}
                onClick={() => props.onAdvance("contract")}
              >
                Accept contract
              </Button>
            </Show>
          </>
        );
      case "plan":
        return (
          <>
            <Button size="sm" variant="ghost" onClick={() => props.onStepChange("contract")}>
              Back
            </Button>
            <Show
              when={stage() === "plan"}
              fallback={
                <Button size="sm" variant="primary" onClick={() => props.onClose()}>
                  Done
                </Button>
              }
            >
              <Button
                size="sm"
                variant="primary"
                disabled={props.busy || blocked("plan")}
                onClick={() => props.onAdvance("plan")}
              >
                Approve plan
              </Button>
            </Show>
          </>
        );
    }
  };

  const Checks = (checkProps: { step: FeatureFlowStep }) => (
    <Show when={checks(checkProps.step).length > 0 || (props.errors.length > 0 && checkProps.step === props.step)}>
      <Section title="Checks">
        <ul class="pw-feature-flow__list" aria-label="Checks">
          <For each={props.step === checkProps.step ? props.errors : []}>
            {(message) => (
              <li class="pw-feature-flow__row">
                <StatusChip tone="danger" label="Refused" />
                <span>{message}</span>
              </li>
            )}
          </For>
          <For each={checks(checkProps.step)}>
            {(check) => (
              <li class="pw-feature-flow__row">
                <StatusChip tone={check.severity === "error" ? "danger" : "muted"} label={check.severity === "error" ? "Blocks" : "Hint"} />
                <span>{check.message}</span>
              </li>
            )}
          </For>
        </ul>
      </Section>
    </Show>
  );

  return (
    <A11yDialog
      open={props.open}
      title="New feature"
      size="lg"
      onClose={() => props.onClose()}
      footer={footer()}
    >
      <div class="pw-feature-flow">
        <ol class="pw-feature-flow__steps" aria-label="Feature steps">
          <For each={STEPS}>
            {(step, index) => (
              <li>
                <button
                  type="button"
                  class="pw-feature-flow__step pw-texture-button"
                  aria-current={props.step === step.id ? "step" : undefined}
                  data-selected={props.step === step.id ? "" : undefined}
                  disabled={!reachable(step.id)}
                  onClick={() => props.onStepChange(step.id)}
                >
                  <span class="pw-feature-flow__step-number">{index() + 1}</span>
                  {step.label}
                </button>
              </li>
            )}
          </For>
        </ol>

        <Show when={props.step === "intent"}>
          <Field label="Intent" hint="What we want and why. Polterware creates the card in Shape.">
            <Textarea
              size="sm"
              rows={4}
              value={intent()}
              placeholder="Import HEAD, branch, and recent commits as evidence"
              onInput={(event) => setIntent(event.currentTarget.value)}
            />
          </Field>
          <Field label="Title" hint="Defaults to the intent's first sentence.">
            <Input size="sm" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} />
          </Field>
          <Field label="Kind" hint="A structural change proposes an edit to the Structure: mark the node it changes with migrating:.">
            <Select
              size="sm"
              aria-label="Kind"
              value={kind()}
              options={[
                { value: "feature", label: "Feature" },
                { value: "architecture", label: "Architecture change" },
              ]}
              onChange={(value) => setKind(value === "architecture" ? "architecture" : "feature")}
            />
          </Field>
          <Show when={props.components.length > 0}>
            <Field label="Lives under">
              <Select size="sm" aria-label="Lives under" value={under()} options={componentOptions()} onChange={setUnder} />
            </Field>
          </Show>
        </Show>

        <Show when={props.step !== "intent" && props.review}>
          {(review) => (
            <>
              <p class="pw-feature-flow__heading">
                <span class="font-mono">{review().card.slug}</span>
                <span>{review().card.title}</span>
                <StatusChip tone="muted" label={review().card.stage} />
              </p>

              <Show when={props.step === "shape"}>
                <Section title="Intent" empty={!review().card.intent} emptyText="No intent yet.">
                  <p class="pw-feature-flow__text">{review().card.intent}</p>
                </Section>
                <Section title="Lives under">
                  <Show
                    when={review().card.under}
                    fallback={
                      <div class="pw-feature-flow__row">
                        <Select
                          size="sm"
                          aria-label="Place under"
                          class="w-72"
                          value=""
                          placeholder={review().suggested.length > 0 ? "Suggested placements" : "Pick a component"}
                          options={[
                            ...review().suggested.map((path) => ({ value: path, label: `${path} (suggested)` })),
                            ...props.components
                              .filter((item) => !review().suggested.includes(item.path))
                              .map((item) => ({ value: item.path, label: `${item.path} · ${item.title}` })),
                          ]}
                          disabled={props.busy || props.components.length === 0}
                          onChange={(path) => {
                            if (path) props.onAddLine({ kind: "under", path });
                          }}
                        />
                      </div>
                    }
                  >
                    <p class="pw-feature-flow__text">
                      <span class="font-mono">{review().card.under}</span>
                      <Show when={review().underTitle}> · {review().underTitle}</Show>
                    </p>
                  </Show>
                </Section>
                <Section title="Touches" empty={review().touches.length === 0} emptyText="No Structure nodes yet.">
                  <ul class="pw-feature-flow__list" aria-label="Touches">
                    <For each={review().touches}>
                      {(node) => (
                        <li class="pw-feature-flow__row">
                          <span class="font-mono">{node.path}</span>
                          <span class="pw-feature-flow__muted">{node.level} · {node.title}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Section title="Applies" empty={review().decisions.length === 0} emptyText="No decisions cited.">
                  <ul class="pw-feature-flow__list" aria-label="Decisions">
                    <For each={review().decisions}>
                      {(decision) => (
                        <li class="pw-feature-flow__row">
                          <span>{decision.title || decision.ref}</span>
                          <StatusChip
                            tone={decision.id ? verdictStatusTone(decision.status) : "warn"}
                            label={decision.id ? decision.status || "unknown" : "no Verdict"}
                          />
                          <Show when={decision.from !== "card"}>
                            <span class="pw-feature-flow__muted">via {decision.from}</span>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Section title="Inherits" empty={review().inherited.length === 0} emptyText="No inherited contract.">
                  <ul class="pw-feature-flow__list" aria-label="Inherited invariants">
                    <For each={review().inherited}>
                      {(invariant) => (
                        <li class="pw-feature-flow__row">
                          <span>{invariant.text}</span>
                          <span class="pw-feature-flow__muted">from {invariant.from}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Section title="Open" empty={review().questions.length === 0} emptyText="No open questions.">
                  <ul class="pw-feature-flow__list" aria-label="Questions">
                    <For each={review().questions}>
                      {(question) => (
                        <li class="pw-feature-flow__row">
                          <span>{question.text}</span>
                          <Show when={question.blocking && question.route !== "answered"}>
                            <StatusChip tone="warn" label="Blocking" />
                          </Show>
                          <StatusChip
                            tone={question.route === "answered" ? "healthy" : "muted"}
                            label={ROUTE_LABEL[question.route]}
                          />
                          <Show when={question.answer}>
                            <span class="pw-feature-flow__muted">{question.answer}</span>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Checks step="shape" />
              </Show>

              <Show when={props.step === "contract"}>
                <Section title="Inherited contract" empty={review().inherited.length === 0} emptyText="Nothing inherited.">
                  <ul class="pw-feature-flow__list" aria-label="Inherited invariants">
                    <For each={review().inherited}>
                      {(invariant) => (
                        <li class="pw-feature-flow__row">
                          <span>{invariant.text}</span>
                          <span class="pw-feature-flow__muted">from {invariant.from}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Section title="Card contract" empty={review().card.invariants.length === 0} emptyText="No invariants yet.">
                  <ul class="pw-feature-flow__list" aria-label="Card invariants">
                    <For each={review().card.invariants}>{(invariant) => <li class="pw-feature-flow__row">{invariant.text}</li>}</For>
                  </ul>
                </Section>
                <Show when={!stagePast(stage(), "shape")}>
                  <div class="pw-feature-flow__add">
                    <Select
                      size="sm"
                      aria-label="Line kind"
                      class="w-40"
                      value={lineKind()}
                      options={[
                        { value: "invariant", label: "Invariant" },
                        { value: "question", label: "Question" },
                        { value: "blocking", label: "Blocking question" },
                      ]}
                      onChange={(value) => {
                        if (value === "invariant" || value === "question" || value === "blocking") setLineKind(value);
                      }}
                    />
                    <Input
                      size="sm"
                      class="min-w-0 flex-1"
                      aria-label="Line text"
                      value={lineText()}
                      placeholder={lineKind() === "invariant" ? "No network calls during scan" : "Include merge commits?"}
                      onInput={(event) => setLineText(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addLine();
                      }}
                    />
                    <Button size="sm" variant="secondary" disabled={props.busy || !lineText().trim()} onClick={addLine}>
                      Add
                    </Button>
                  </div>
                </Show>
                <Show when={stagePast(stage(), "shape")}>
                  <p class="pw-feature-flow__muted">Contract accepted; the card is in {stage()}.</p>
                </Show>
                <Checks step="contract" />
              </Show>

              <Show when={props.step === "plan"}>
                <Section
                  title="Tasks"
                  empty={review().card.tasks.filter((task) => task.state !== "dropped").length === 0}
                  emptyText="No tasks yet."
                >
                  <ul class="pw-feature-flow__list" aria-label="Tasks">
                    <For each={review().card.tasks.filter((task) => task.state !== "dropped")}>
                      {(task) => (
                        <li class="pw-feature-flow__row">
                          <span class="font-mono pw-feature-flow__muted">T{task.number}</span>
                          <span>{task.title}</span>
                          <Show when={task.scope}>
                            <span class="font-mono pw-feature-flow__muted">{task.scope}</span>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Section>
                <Show when={stage() === "shape"}>
                  <p class="pw-feature-flow__muted">Accept the contract before approving the plan.</p>
                </Show>
                <Show when={!stagePast(stage(), "plan")}>
                  <div class="pw-feature-flow__add">
                    <Input
                      size="sm"
                      class="min-w-0 flex-1"
                      aria-label="Task title"
                      value={taskTitle()}
                      placeholder="Upsert commit evidence"
                      onInput={(event) => setTaskTitle(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addTask();
                      }}
                    />
                    <Input
                      size="sm"
                      class="w-48 font-mono"
                      aria-label="Task scope"
                      value={taskScope()}
                      placeholder="backend/import/*"
                      onInput={(event) => setTaskScope(event.currentTarget.value)}
                    />
                    <Button size="sm" variant="secondary" disabled={props.busy || !taskTitle().trim()} onClick={addTask}>
                      Add task
                    </Button>
                  </div>
                </Show>
                <Show when={stagePast(stage(), "plan")}>
                  <p class="pw-feature-flow__muted">Plan approved; agents can claim the tasks.</p>
                </Show>
                <Checks step="plan" />
              </Show>
            </>
          )}
        </Show>
      </div>
    </A11yDialog>
  );
}
