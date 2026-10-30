import { For, Show } from "solid-js";
import { FolderKanban, IconTile, Layers, Peek, PeekChip, PeekSection, StatusChip } from "@polterware/frontend-design-system";
import type { WorkspaceWorkCard } from "@polterware/feature-shell";
import { workStageLabel, workStageTone } from "./work-stage";

/** Quick look at a Work card: stage, intent, open tasks and questions. Expand opens its page. */
export function CardPeek(props: { card: WorkspaceWorkCard | null; onClose: () => void; onOpen: (slug: string) => void }) {
  const openTasks = () => props.card?.tasks.filter((task) => task.state === "open") ?? [];
  const openQuestions = () => props.card?.questions.filter((question) => question.state === "open") ?? [];
  return (
    <Peek
      open={props.card !== null}
      title={props.card?.title ?? "Card"}
      icon={<IconTile size={24} tone="neutral" seed={`peek-card-${props.card?.slug ?? ""}`}><FolderKanban size={14} /></IconTile>}
      kind="Card"
      onClose={props.onClose}
      onOpen={() => {
        const slug = props.card?.slug;
        if (slug) props.onOpen(slug);
      }}
      properties={
        <Show when={props.card}>
          {(card) => (
            <>
              <StatusChip tone={workStageTone(card().stage)} label={workStageLabel(card().stage)} />
              <PeekChip><span class="font-mono">{card().slug}</span></PeekChip>
              <Show when={card().under}>{(under) => <PeekChip icon={<Layers />}>{under()}</PeekChip>}</Show>
            </>
          )}
        </Show>
      }
    >
      <Show when={props.card}>
        {(card) => (
          <>
            <Show when={card().intent.trim()} fallback={<p class="m-0 text-[var(--color-text-muted)]">No intent written yet.</p>}>
              <p class="m-0 whitespace-pre-wrap">{card().intent}</p>
            </Show>
            <Show when={openTasks().length > 0}>
              <PeekSection title="Open tasks">
                <For each={openTasks()}>
                  {(task) => (
                    <p class="m-0 text-[var(--color-text-primary)]">
                      <span class="mr-2 font-mono text-[12px] text-[var(--color-text-muted)]">T{task.number}</span>
                      {task.title}
                      <Show when={task.claimHolder}>{(holder) => <span class="ml-2 text-[12px] text-[var(--color-text-muted)]">/ {holder()}</span>}</Show>
                    </p>
                  )}
                </For>
              </PeekSection>
            </Show>
            <Show when={openQuestions().length > 0}>
              <PeekSection title="Open questions">
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
              </PeekSection>
            </Show>
          </>
        )}
      </Show>
    </Peek>
  );
}
