import { For, Show } from "solid-js";
import { Button, DetailPanel, StatusChip, FileText, ListFilter, Network, Check, Bot, Clock, Hammer, Pencil, Eye, ShieldCheck, ThumbsDownIcon } from "@polterware/frontend-design-system";
import type { WorkspaceInboxAction, WorkspaceInboxItem } from "./workspace-mocks";

const KIND_LABEL = { decision: "Decision", drift: "Drift", verify: "Verify" } as const;

const ACTION_LABEL: Record<WorkspaceInboxAction, string> = {
  decide: "Decide",
  delegate: "Delegate",
  defer: "Defer",
  fix_code: "Fix code",
  update_intent: "Update intent",
  ignore: "Ignore",
  verify: "Mark verified",
  reject: "Reject",
};

const ACTION_ICON = {
  decide: Check,
  delegate: Bot,
  defer: Clock,
  fix_code: Hammer,
  update_intent: Pencil,
  ignore: Eye,
  verify: ShieldCheck,
  reject: ThumbsDownIcon,
} as const;

/** Peek-only panel for one Inbox item: what it is, where it came from, and how to resolve it. */
export function InboxItemDetail(props: {
  item: WorkspaceInboxItem;
  disabled?: boolean;
  onAction?: (action: WorkspaceInboxAction) => void;
}) {
  const statusLabel = () => (props.item.state === "deferred" ? "Deferred" : props.item.blocking ? "Blocking" : "Open");
  return (
    <DetailPanel.Content>
      <DetailPanel.Header title={props.item.title} />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <div class="-mt-2 mb-6 flex flex-wrap gap-1.5">
            <StatusChip tone="muted" label={KIND_LABEL[props.item.kind]} />
            <StatusChip tone={props.item.blocking && props.item.state === "open" ? "danger" : "muted"} label={statusLabel()} />
          </div>
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
              return <Button
                size="sm"
                class="min-w-0 flex-1"
                variant={action === "decide" || action === "verify" ? "primary" : "ghost"}
                disabled={props.disabled}
                onClick={() => props.onAction?.(action)}
              >
                <Icon size={14} />
                {ACTION_LABEL[action]}
              </Button>;
            }}
          </For>
        </DetailPanel.Footer>
      </Show>
    </DetailPanel.Content>
  );
}
