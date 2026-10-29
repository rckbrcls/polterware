import { type JSX } from "solid-js";
import type { IconTileTone } from "./icon-tile";
import { TemplateCardGrid } from "./template-card";
import { pushToast } from "./toast";

export type PromptCardGridItem = {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  tone?: IconTileTone;
  /** The text copied to the clipboard for the user's agent. */
  prompt: string;
};

export type PromptCardGridProps = {
  label?: string;
  items: PromptCardGridItem[];
  class?: string;
};

/** Copies an agent prompt and confirms with a toast. */
export function copyAgentPrompt(prompt: string) {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard) {
    pushToast("Could not copy prompt.", "danger");
    return;
  }
  void clipboard.writeText(prompt).then(
    () => pushToast("Prompt copied. Paste it into your agent.", "success"),
    () => pushToast("Could not copy prompt.", "danger"),
  );
}

/** Cards that copy a ready-made prompt for the user's coding agent instead of creating an item by hand. */
export function PromptCardGrid(props: PromptCardGridProps) {
  return (
    <TemplateCardGrid
      label={props.label ?? "Copy a prompt for your agent"}
      class={props.class}
      items={props.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        icon: item.icon,
        tone: item.tone,
        onSelect: () => copyAgentPrompt(item.prompt),
      }))}
    />
  );
}
