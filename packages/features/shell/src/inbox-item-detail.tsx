import { For, Show, createEffect, createSignal, on } from "solid-js";
import { Button, DetailPanel, Input, Morph, RadioGroup, StatusChip, AlertDiamond, FileText, ListFilter, Network, Check, Bot, Clock, Eye } from "@polterware/frontend-design-system";
import type { WorkspaceInboxAction, WorkspaceInboxItem } from "./workspace-mocks";

const KIND_LABEL = { conflict: "Conflict", decision: "Question", setup: "Setup" } as const;

const ACTION_LABEL: Record<WorkspaceInboxAction, string> = {
  decide: "Decide",
  delegate: "Delegate",
  defer: "Later",
  ignore: "Dismiss",
};

const ACTION_ICON = {
  decide: Check,
  delegate: Bot,
  defer: Clock,
  ignore: Eye,
} as const;

/** What each action does, as the button's hint; it matches what the core records (`ResolveInbox`). */
const ACTION_HINT: Record<WorkspaceInboxAction, string> = {
  decide: "Answer this question. The answer is written on the card and the item leaves the Inbox.",
  delegate: "Hand this question to an agent. It leaves your Inbox and shows up in polterware status for the next agent session.",
  defer: "Set this aside. It stays in the Inbox, dimmed under Later, until you come back to it.",
  ignore: "This needs no action. The item leaves the Inbox.",
};

/** A Conflict's Decide hint: the answer goes to the agent that raised it. */
const CONFLICT_DECIDE_HINT = "Decide this conflict. The agent that raised it reads the answer and goes on.";

/** The confirm each action opens: its question, what happens, and the button that does it. */
const ACTION_CONFIRM: Record<Exclude<WorkspaceInboxAction, "decide">, { title: string; body: string; confirm: string }> = {
  delegate: {
    title: "Delegate to an agent?",
    body: "The question leaves your Inbox. The next agent session sees it in polterware status and answers it.",
    confirm: "Delegate",
  },
  defer: {
    title: "Move to Later?",
    body: "The item stays in the Inbox, dimmed under Later, until you come back to it.",
    confirm: "Move to Later",
  },
  ignore: {
    title: "Dismiss this item?",
    body: "It needs no action. The item leaves the Inbox.",
    confirm: "Dismiss",
  },
};

/** An action to open on the active item, from outside the detail (the row menu); `nonce` reopens the same one. */
export type InboxActionRequest = { itemId: string; action: WorkspaceInboxAction; nonce: number };

/** Peek-only panel for one Inbox item: what it is, where it came from, and how to resolve it. */
export function InboxItemDetail(props: {
  item: WorkspaceInboxItem;
  disabled?: boolean;
  /** Runs an action; the confirm closes when it resolves and stays open when it rejects. */
  onAction?: (action: WorkspaceInboxAction, answer?: string) => Promise<void>;
  request?: InboxActionRequest | null;
}) {
  const statusLabel = () => (props.item.state === "deferred" ? "Later" : props.item.blocking ? "Blocking" : "Open");
  const [opened, setOpened] = createSignal<WorkspaceInboxAction | null>(null);
  const [answer, setAnswer] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  // Another item closes the open confirm; a request for this item opens its action's confirm.
  createEffect(on(() => props.item.id, () => setOpened(null), { defer: true }));
  createEffect(on(() => props.request, (request) => {
    if (request && request.itemId === props.item.id && props.item.actions.includes(request.action)) setOpened(request.action);
  }));
  createEffect(on(opened, (action) => {
    if (action === "decide") setAnswer(props.item.options.length === 1 ? props.item.options[0]! : "");
  }));

  async function confirm(action: WorkspaceInboxAction) {
    if (!props.onAction || saving()) return;
    setSaving(true);
    try {
      await props.onAction(action, action === "decide" ? answer().trim() : undefined);
      setOpened(null);
    } catch {
      // The host reports the failure; the confirm stays open to retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailPanel.Content>
      <DetailPanel.Header title={props.item.title} aside={<>
        <StatusChip tone="muted" label={KIND_LABEL[props.item.kind]} />
        <StatusChip tone={props.item.blocking && props.item.state === "open" ? "danger" : "muted"} label={statusLabel()} />
      </>} />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <Show when={props.item.kind === "conflict" && (props.item.details.rule || props.item.details.decision)}>
            <DetailPanel.Section title="Goes against" icon={<AlertDiamond size={14} />}>
              <DetailPanel.Properties>
                <Show when={props.item.details.rule}>
                  <DetailPanel.Property label="Rule" value={props.item.details.rule} />
                </Show>
                <Show when={props.item.details.decision}>
                  <DetailPanel.Property label="Decision" value={props.item.details.decision} />
                </Show>
              </DetailPanel.Properties>
            </DetailPanel.Section>
          </Show>
          <Show when={props.item.detail && props.item.kind !== "conflict"}>
            <DetailPanel.Section title="Detail" icon={<FileText size={14} />}>
              <p class="m-0 whitespace-pre-wrap">{props.item.detail}</p>
            </DetailPanel.Section>
          </Show>
          <Show when={props.item.options.length > 0}>
            <DetailPanel.Section title="Options" icon={<ListFilter size={14} />}>
              <ol class="m-0 grid list-none gap-2 p-0" role="list" aria-label="Options">
                <For each={props.item.options}>{(option, index) => (
                  <li class="flex min-w-0 items-start gap-2">
                    <span class="shrink-0 tabular-nums text-[var(--color-text-muted)]" aria-hidden="true">
                      {String(index() + 1).padStart(2, "0")}
                    </span>
                    <span class="min-w-0 [overflow-wrap:anywhere]">{option}</span>
                  </li>
                )}</For>
              </ol>
            </DetailPanel.Section>
          </Show>
          <DetailPanel.Section title="Context" icon={<Network size={14} />}>
            <DetailPanel.Properties>
              <DetailPanel.Property label="Where" value={props.item.where || null} />
              <DetailPanel.Property label="Source" value={props.item.source || null} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
        </DetailPanel.Main>
      </DetailPanel.Body>
      <Show when={props.onAction && props.item.actions.length > 0}>
        <DetailPanel.Footer aria-label="Inbox actions">
          <For each={props.item.actions}>
            {(action) => {
              const Icon = ACTION_ICON[action];
              return (
                <Morph.Root open={opened() === action} onOpenChange={(open) => setOpened(open ? action : null)}>
                  <Morph.Trigger
                    size="sm"
                    class="flex-1"
                    variant={action === "decide" ? "primary" : "ghost"}
                    disabled={props.disabled}
                    hint={action === "decide" && props.item.kind === "conflict" ? CONFLICT_DECIDE_HINT : ACTION_HINT[action]}
                  >
                    <Icon size={14} />
                    {ACTION_LABEL[action]}
                  </Morph.Trigger>
                  <Show
                    when={action !== "decide"}
                    fallback={
                      <Morph.Panel title={props.item.title}>
                        <Morph.Body>
                          <Show
                            when={props.item.options.length > 0}
                            fallback={
                              <Input
                                aria-label="Answer"
                                placeholder="Your answer"
                                data-autofocus
                                value={answer()}
                                onInput={(event) => setAnswer(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && answer().trim()) void confirm("decide");
                                }}
                              />
                            }
                          >
                            <RadioGroup
                              aria-label="Answer"
                              value={props.item.options.includes(answer()) ? answer() : ""}
                              onValueChange={setAnswer}
                              options={props.item.options.map((option) => ({ value: option, label: option }))}
                            />
                            <Show when={props.item.kind === "conflict"}>
                              <Input
                                aria-label="Another answer"
                                placeholder="Another answer"
                                class="mt-2"
                                value={props.item.options.includes(answer()) ? "" : answer()}
                                onInput={(event) => setAnswer(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && answer().trim()) void confirm("decide");
                                }}
                              />
                            </Show>
                          </Show>
                        </Morph.Body>
                        <Morph.Footer>
                          <Button size="sm" variant="primary" disabled={!answer().trim() || saving()} onClick={() => void confirm("decide")}>
                            {saving() ? "Saving…" : "Record decision"}
                          </Button>
                        </Morph.Footer>
                      </Morph.Panel>
                    }
                  >
                    {(() => {
                      const copy = ACTION_CONFIRM[action as Exclude<WorkspaceInboxAction, "decide">];
                      return (
                        <Morph.Panel title={copy.title}>
                          <Morph.Body>{copy.body}</Morph.Body>
                          <Morph.Footer>
                            <Button size="sm" variant="primary" data-autofocus disabled={saving()} onClick={() => void confirm(action)}>
                              {saving() ? "Saving…" : copy.confirm}
                            </Button>
                          </Morph.Footer>
                        </Morph.Panel>
                      );
                    })()}
                  </Show>
                </Morph.Root>
              );
            }}
          </For>
        </DetailPanel.Footer>
      </Show>
    </DetailPanel.Content>
  );
}
