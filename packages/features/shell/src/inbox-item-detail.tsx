import { For, Show } from "solid-js";
import { Button, DetailPanel, StatusChip } from "@polterware/frontend-design-system";
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

/** Peek-only panel for one Inbox item: what it is, where it came from, and how to resolve it. */
export function InboxItemDetail(props: {
  item: WorkspaceInboxItem;
  disabled?: boolean;
  onAction?: (action: WorkspaceInboxAction) => void;
}) {
  const statusLabel = () => (props.item.state === "deferred" ? "Deferred" : props.item.blocking ? "Blocking" : "Open");
  return (
    <DetailPanel.Content>
      <DetailPanel.Header />
      <DetailPanel.Body>
        <DetailPanel.Main>
          <DetailPanel.Title title={props.item.title} />
          <div class="mb-3 flex flex-wrap gap-1.5">
            <StatusChip tone="muted" label={KIND_LABEL[props.item.kind]} />
            <StatusChip tone={props.item.blocking && props.item.state === "open" ? "danger" : "muted"} label={statusLabel()} />
          </div>
          <Show when={props.item.detail}>
            <DetailPanel.Section title="Detail">
              <p class="m-0 whitespace-pre-wrap">{props.item.detail}</p>
            </DetailPanel.Section>
          </Show>
          <Show when={props.item.options.length > 0}>
            <DetailPanel.Section title="Options">
              <ul class="m-0 list-disc pl-4">
                <For each={props.item.options}>{(option) => <li>{option}</li>}</For>
              </ul>
            </DetailPanel.Section>
          </Show>
          <DetailPanel.Section title="Context">
            <DetailPanel.Properties>
              <DetailPanel.Property label="Where" value={props.item.where || null} />
              <DetailPanel.Property label="Source" value={props.item.source || null} />
            </DetailPanel.Properties>
          </DetailPanel.Section>
          <Show when={props.onAction && props.item.actions.length > 0}>
            <div class="mt-4 flex flex-wrap gap-1.5">
              <For each={props.item.actions}>
                {(action) => (
                  <Button
                    size="sm"
                    variant={action === "decide" || action === "verify" ? "primary" : "ghost"}
                    disabled={props.disabled}
                    onClick={() => props.onAction?.(action)}
                  >
                    {ACTION_LABEL[action]}
                  </Button>
                )}
              </For>
            </div>
          </Show>
        </DetailPanel.Main>
      </DetailPanel.Body>
    </DetailPanel.Content>
  );
}
