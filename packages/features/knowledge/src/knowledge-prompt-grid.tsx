import {
  BookOpen02Icon,
  ListChecks,
  PromptCardGrid,
  Shield,
  type PromptCardGridItem,
} from "@polterware/frontend-design-system";
import type { KnowledgePromptKind } from "./agent-prompts";
import { knowledgePromptsForKind } from "./agent-prompts";

function promptIcon(kind: KnowledgePromptKind) {
  if (kind === "verdict") return <Shield size={16} />;
  if (kind === "card") return <ListChecks size={16} />;
  return <BookOpen02Icon size={16} />;
}

/** Prompts the user copies into their coding agent to fill an empty knowledge page from the real project. */
export function KnowledgePromptGrid(props: { kind: KnowledgePromptKind; label?: string }) {
  const items = (): PromptCardGridItem[] =>
    knowledgePromptsForKind(props.kind).map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      description: prompt.description,
      tone: prompt.tone,
      icon: promptIcon(prompt.kind),
      prompt: prompt.prompt,
    }));

  return <PromptCardGrid label={props.label} items={items()} />;
}
