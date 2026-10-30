import { For, Show, createMemo } from "solid-js";
import {
  Check,
  DetailPanel,
  ListChecks,
  Button,
  Select,
  Square,
  StatusChip,
  X,
  HelpCircle,
  ShieldCheck,
  RailGroup,
} from "@polterware/frontend-design-system";
import type { WorkStage, WorkspaceWorkCard, WorkspaceWorkTask } from "@polterware/feature-shell";
import { KnowledgeDocumentNotFound, KnowledgeDocumentShell } from "./knowledge-document-shell";
import { WORK_STAGES, cardTaskProgress, isWorkStage } from "./work-stage";
import { WorkCardWork } from "./work-card-work";

function TaskStateIcon(props: { state: WorkspaceWorkTask["state"] }) {
  if (props.state === "done") return <Check size={14} aria-label="Done" />;
  if (props.state === "dropped") return <X size={14} aria-label="Dropped" />;
  return <Square size={14} aria-label="Open" />;
}

export function WorkCardDetail(props: {
  card: WorkspaceWorkCard | null | undefined;
  notFound?: boolean;
  onSetStage?: (stage: WorkStage) => void;
  onRemove?: () => void;
  /** Passes the card's next gate (shape → plan, plan → build); resolves with the refusal lines. */
  onAdvance?: (step: "contract" | "plan") => Promise<string[]>;
}) {
  return (
    <Show
      when={props.card}
      fallback={
        <Show when={props.notFound}>
          <KnowledgeDocumentNotFound kindLabel="Card" />
        </Show>
      }
    >
      {(card) => {
        const progress = createMemo(() => cardTaskProgress(card()));
        return (
          <KnowledgeDocumentShell
            entityId={card().slug}
            activitySubjectId={card().id}
            title={card().title}
            bodyMarkdown={card().intent}
            properties={
              <>
                <DetailPanel.Property label="Stage" value={
                  <Select aria-label="Work stage" size="sm" class="w-full"
                    options={WORK_STAGES.map(stage => ({ value: stage.id, label: stage.label }))}
                    value={card().stage} disabled={!props.onSetStage}
                    onChange={next => { if (isWorkStage(next) && next !== card().stage) props.onSetStage?.(next); }} />
                } />
                <DetailPanel.Property label="Slug" value={card().slug} mono />
                <DetailPanel.Property label="Kind" value={card().kind === "architecture" ? "Architecture change" : "Feature"} />
                <DetailPanel.Property label="Owner" value={card().owner || null} />
                <DetailPanel.Property label="Component" value={card().under || null} mono />
                <DetailPanel.Property label="Decisions" value={card().decisions.length > 0 ? card().decisions.join(", ") : null} />
                <DetailPanel.Property label="Updated" value={card().updatedAt} />
              </>
            }
            metadataActions={<>
              <p class="pw-detail-panel__text" data-empty>Agents edit tasks, questions, and invariants with polterware apply.</p>
            </>}
            footerActions={
              <Show when={props.onRemove}>
                <Button variant="danger" size="sm" onClick={() => props.onRemove?.()}>Remove from board</Button>
              </Show>
            }
            railGroups={<>
            <RailGroup
              title="Tasks" icon={<ListChecks size={14} />}
              aside={
                progress().total > 0 ? (
                  <StatusChip
                    tone={progress().done === progress().total ? "healthy" : "muted"}
                    label={`${progress().done}/${progress().total}`}
                  />
                ) : undefined
              }
            >
              <Show
                when={card().tasks.length > 0}
                fallback={<p class="pw-detail-panel__text px-1" data-empty>No tasks yet.</p>}
              >
                <ul class="m-0 grid list-none gap-1.5 px-1 py-0" aria-label="Tasks">
                  <For each={card().tasks}>
                    {(task) => (
                      <li
                        class="flex items-start gap-2 text-[12.5px]"
                        classList={{
                          "text-[var(--color-text-secondary)]": task.state === "open",
                          "text-[var(--color-text-muted)]": task.state !== "open",
                        }}
                      >
                        <span class="mt-0.5 shrink-0">
                          <TaskStateIcon state={task.state} />
                        </span>
                        <span class="w-7 shrink-0 font-mono text-[11px] leading-5 text-[var(--color-text-muted)]">
                          T{task.number}
                        </span>
                        <span class="min-w-0 flex-1" classList={{ "line-through": task.state === "dropped" }}>
                          {task.title}
                          <Show when={task.scope}>
                            <span class="ml-2 font-mono text-[11px] text-[var(--color-text-muted)]">
                              {task.scope}
                            </span>
                          </Show>
                          <Show when={task.claimHolder}>
                            <span class="ml-2 text-[11px] text-[var(--color-text-muted)]">
                              claimed by {task.claimHolder}
                            </span>
                          </Show>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </RailGroup>

            <Show when={card().questions.length > 0}>
              <RailGroup title="Questions" icon={<HelpCircle size={14} />}>
                <ul class="m-0 grid list-none gap-2 px-1 py-0" aria-label="Questions">
                  <For each={card().questions}>
                    {(question) => (
                      <li class="grid gap-1 text-[12.5px] text-[var(--color-text-secondary)]">
                        <span class="flex flex-wrap items-center gap-1.5">
                          <span>{question.text}</span>
                          <Show when={question.blocking && question.state === "open"}>
                            <StatusChip tone="warn" label="Blocking" />
                          </Show>
                          <Show when={question.state === "answered"}>
                            <StatusChip tone="healthy" label="Answered" />
                          </Show>
                        </span>
                        <Show when={question.state === "answered" && question.answer}>
                          <span class="text-[var(--color-text-muted)]">{question.answer}</span>
                        </Show>
                        <Show when={question.state === "open" && question.options.length > 0}>
                          <span class="font-mono text-[11px] text-[var(--color-text-muted)]">
                            {question.options.join(" | ")}
                          </span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </RailGroup>
            </Show>

            <Show when={card().invariants.length > 0}>
              <RailGroup title="Invariants" icon={<ShieldCheck size={14} />}>
                <ul
                  class="m-0 list-disc space-y-1 pl-5 pr-1 text-[12.5px] text-[var(--color-text-secondary)]"
                  aria-label="Invariants"
                >
                  <For each={card().invariants}>{(invariant) => <li>{invariant.text}</li>}</For>
                </ul>
              </RailGroup>
            </Show>
            </>}
          >
            <WorkCardWork slug={card().slug} stage={card().stage} onAdvance={props.onAdvance} />
          </KnowledgeDocumentShell>
        );
      }}
    </Show>
  );
}
