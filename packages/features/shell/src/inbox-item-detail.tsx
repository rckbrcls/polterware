import { For, Show, createEffect, createSignal, on } from "solid-js";
import { Button, DetailPanel, Input, Morph, RadioGroup, StatusChip, FileText, ListFilter, Network, Check, Bot, Clock, Link, Undo2, Eye } from "@polterware/frontend-design-system";
import type { WorkspaceInboxAction, WorkspaceInboxItem } from "./workspace-mocks";

const KIND_LABEL = { decision: "Question", drift: "Commit", setup: "Setup" } as const;

const ACTION_LABEL: Record<WorkspaceInboxAction, string> = {
  decide: "Decide",
  delegate: "Delegate",
  defer: "Later",
  link: "Link",
  reopen: "Reopen",
  ignore: "Dismiss",
};

const ACTION_ICON = {
  decide: Check,
  delegate: Bot,
  defer: Clock,
  link: Link,
  reopen: Undo2,
  ignore: Eye,
} as const;

/** What each action does, as the button's hint; it matches what the core records (`ResolveInbox`). */
const ACTION_HINT: Record<WorkspaceInboxAction, string> = {
  decide: "Answer this question. The answer is written on the card and the item leaves the Inbox.",
  delegate: "Hand this question to an agent. It leaves your Inbox and shows up in polterware status for the next agent session.",
  defer: "Set this aside. It stays in the Inbox, dimmed under Later, until you come back to it.",
  link: "Name what this delivered: the task for a commit, or the commit for a done task. The link is stored and the item leaves the Inbox.",
  reopen: "The task is not done after all. It goes back to open on its card and the item leaves the Inbox.",
  ignore: "This needs no action. The item leaves the Inbox.",
};

/** The confirm each action opens: its question, what happens, and the button that does it. */
const ACTION_CONFIRM: Record<Exclude<WorkspaceInboxAction, "decide" | "link">, { title: string; body: string; confirm: string }> = {
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
  reopen: {
    title: "Reopen the task?",
    body: "The task goes back to open on its card, so it is no longer claimed as done. The item leaves the Inbox.",
    confirm: "Reopen task",
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
    if (action === "link") setAnswer("");
  }));
  /** A commit item links to a task; a done-task item links to a commit. */
  const linksCommit = () => Boolean(props.item.details.sha);

  async function confirm(action: WorkspaceInboxAction) {
    if (!props.onAction || saving()) return;
    setSaving(true);
    try {
      await props.onAction(action, action === "decide" || action === "link" ? answer().trim() : undefined);
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
          <Show when={props.item.detail}>
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
                    variant={action === "decide" || action === "link" ? "primary" : "ghost"}
                    disabled={props.disabled}
                    hint={ACTION_HINT[action]}
                  >
                    <Icon size={14} />
                    {ACTION_LABEL[action]}
                  </Morph.Trigger>
                  <Show when={action === "link"}>
                    <Morph.Panel title={linksCommit() ? "Link to a task" : "Link a commit"}>
                      <Morph.Body>
                        <p class="m-0 mb-2">
                          {linksCommit()
                            ? "The task this commit delivers, as card-slug#T2."
                            : "The commit that delivered this task: its sha, or a ref such as HEAD."}
                        </p>
                        <Input
                          aria-label={linksCommit() ? "Task" : "Commit"}
                          placeholder={linksCommit() ? "card-slug#T2" : "a1b2c3d"}
                          class="font-mono"
                          data-autofocus
                          value={answer()}
                          onInput={(event) => setAnswer(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && answer().trim()) void confirm("link");
                          }}
                        />
                      </Morph.Body>
                      <Morph.Footer>
                        <Button size="sm" variant="primary" disabled={!answer().trim() || saving()} onClick={() => void confirm("link")}>
                          {saving() ? "Saving…" : "Link"}
                        </Button>
                      </Morph.Footer>
                    </Morph.Panel>
                  </Show>
                  <Show
                    when={action !== "decide" && action !== "link"}
                    fallback={action === "link" ? undefined :
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
                              value={answer()}
                              onValueChange={setAnswer}
                              options={props.item.options.map((option) => ({ value: option, label: option }))}
                            />
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
                      const copy = ACTION_CONFIRM[action as Exclude<WorkspaceInboxAction, "decide" | "link">];
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
