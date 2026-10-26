import { For, Show, createSignal } from "solid-js";
import {
  HelpCircle,
  MenuItem,
  MenuList,
  Popover,
} from "@polterware/frontend-design-system";
import { HELP_TOPICS, type HelpTopicId } from "./help-topics";

const footerIconControlClass =
  "pw-sidebar-item !w-8 shrink-0 justify-center";

export function HelpMenu(props: {
  onSelectTopic: (topicId: HelpTopicId) => void;
}) {
  const [open, setOpen] = createSignal(false);
  let triggerRef: HTMLButtonElement | undefined;

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={(el) => {
          triggerRef = el;
        }}
        type="button"
        aria-label="Help and about"
        aria-expanded={open()}
        title="Help"
        onClick={() => setOpen((value) => !value)}
        class={footerIconControlClass}
      >
        <HelpCircle size={14} />
      </button>

      <Popover
        open={open()}
        onClose={close}
        title="Help"
        width={260}
        placement="top-start"
        anchorRef={() => triggerRef}
      >
        <MenuList class="min-h-0 flex-1 overflow-auto p-2">
          <For each={HELP_TOPICS}>
            {(topic) => {
              const Icon = topic.icon;
              return (
                <MenuItem
                  class="gap-2 py-2 text-[13px]"
                  onClick={() => {
                    close();
                    props.onSelectTopic(topic.id);
                  }}
                >
                  <Icon size={14} class="shrink-0 text-[var(--color-text-secondary)]" />
                  <span class="truncate text-[var(--color-text-primary)]">
                    {topic.label}
                  </span>
                </MenuItem>
              );
            }}
          </For>
        </MenuList>
      </Popover>
    </>
  );
}
