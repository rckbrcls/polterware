import { Show } from "solid-js";
import {
  A11yDialog,
  Button,
  IconTile,
  ExternalLink,
  pushToast,
} from "@polterware/frontend-design-system";
import { HelpTopicBody } from "./help-topic-body";
import { helpTopicById, type HelpTopicId } from "./help-topics";

function openExternal(url: string): Promise<unknown> {
  return (
    globalThis as unknown as {
      polterware: {
        app: {
          openExternal: (target: string) => Promise<unknown>;
        };
      };
    }
  ).polterware.app.openExternal(url);
}

export function HelpTopicDialog(props: {
  topicId: HelpTopicId | null;
  onClose: () => void;
}) {
  const topic = () => helpTopicById(props.topicId);
  const externalLink = () => topic()?.externalLink;

  async function handleExternal() {
    const link = externalLink();
    if (!link) return;
    try {
      await openExternal(link.url);
    } catch (error: unknown) {
      pushToast(
        error instanceof Error ? error.message : "Could not open link.",
        "danger",
      );
    }
  }

  return (
    <A11yDialog
      open={props.topicId !== null && topic() !== undefined}
      title={topic()?.title ?? "Help"}
      titleLeading={
        (() => {
          const Icon = topic()?.icon;
          if (!Icon) return undefined;
          return (
            <IconTile size={24} tone="neutral" seed={props.topicId ?? undefined}>
              <Icon size={14} aria-hidden />
            </IconTile>
          );
        })()
      }
      size="md"
      onClose={props.onClose}
      footer={
        externalLink() ? (
          <div class="flex w-full items-center justify-end">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleExternal()}
            >
              <ExternalLink size={14} />
              {externalLink()!.label}
            </Button>
          </div>
        ) : undefined
      }
    >
      <Show when={topic()}>
        {(current) => <HelpTopicBody topic={current()} />}
      </Show>
    </A11yDialog>
  );
}
