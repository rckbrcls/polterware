import { For, Show } from "solid-js";
import { Peek, StatusChip } from "@polterware/frontend-design-system";
import type { WorkspaceWorkCard } from "@polterware/feature-shell";
import { workStageLabel, workStageTone } from "./work-stage";

/** Quick look at a Work card from a list: stage, intent, open tasks and questions. */
export function CardPeek(props: { card: WorkspaceWorkCard | null; onClose: () => void; onOpen: (slug: string) => void }) {
  const openTasks = () => props.card?.tasks.filter((task) => task.state === "open") ?? [];
  const openQuestions = () => props.card?.questions.filter((question) => question.state === "open") ?? [];
  return (
    <Peek
      open={props.card !== null}
      title={props.card?.title ?? "Card"}
      onClose={props.onClose}
      onOpen={() => {
        const slug = props.card?.slug;
        if (slug) props.onOpen(slug);
      }}
    >
      <Show when={props.card}>
        {(card) => (
          <div class="flex flex-col gap-4 text-[13px]">
            <div class="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              <StatusChip tone={workStageTone(card().stage)} label={workStageLabel(card().stage)} />
              <span class="font-mono">{card().slug}</span>
              <Show when={card().under}>{(under) => <span>under {under()}</span>}</Show>
            </div>
            <Show when={card().intent.trim()} fallback={<p class="m-0 text-[var(--color-text-muted)]">No intent written yet.</p>}>
              <p class="m-0 whitespace-pre-wrap text-[var(--color-text-secondary)]">{card().intent}</p>
            </Show>
            <Show when={openTasks().length > 0}>
              <section class="flex flex-col gap-1.5">
                <h3 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">Open tasks</h3>
                <For each={openTasks()}>
                  {(task) => (
                    <p class="m-0 text-[var(--color-text-primary)]">
                      <span class="mr-2 font-mono text-[12px] text-[var(--color-text-muted)]">T{task.number}</span>
                      {task.title}
                      <Show when={task.claimHolder}>{(holder) => <span class="ml-2 text-[12px] text-[var(--color-text-muted)]">· {holder()}</span>}</Show>
                    </p>
                  )}
                </For>
              </section>
            </Show>
            <Show when={openQuestions().length > 0}>
              <section class="flex flex-col gap-1.5">
                <h3 class="m-0 text-[12px] font-medium text-[var(--color-text-muted)]">Open questions</h3>
                <For each={openQuestions()}>
                  {(question) => (
                    <p class="m-0 text-[var(--color-text-primary)]">
                      {question.text}
                      <Show when={question.blocking}>
                        <StatusChip class="ml-2" tone="danger" label="Blocking" />
                      </Show>
                    </p>
                  )}
                </For>
              </section>
            </Show>
          </div>
        )}
      </Show>
    </Peek>
  );
}
