import type { WorkStage, WorkspaceDoc, WorkspaceWorkCard } from "@polterware/feature-shell";
import { cardOpenQuestions } from "./work-stage";

export type CardQuestionsFilter = "any" | "open" | "clear";
export type LinkedFilter = "any" | "linked" | "unlinked";

export type CardListFilters = {
  stages: readonly WorkStage[];
  questions: CardQuestionsFilter;
  query: string;
};

export type DocListFilters = {
  tags: readonly string[];
  linked: LinkedFilter;
  query: string;
};

export const EMPTY_CARD_LIST_FILTERS: CardListFilters = {
  stages: [],
  questions: "any",
  query: "",
};

export const EMPTY_DOC_LIST_FILTERS: DocListFilters = {
  tags: [],
  linked: "any",
  query: "",
};

export function cardListFiltersActive(filters: CardListFilters): boolean {
  return filters.stages.length > 0 || filters.questions !== "any";
}

export function docListFiltersActive(filters: DocListFilters): boolean {
  return filters.linked !== "any" || filters.tags.length > 0;
}

/** Every tag in use across the docs, sorted for the filter list and tag suggestions. */
export function distinctDocTags(items: readonly WorkspaceDoc[]): string[] {
  const values = new Set<string>();
  for (const item of items) for (const tag of item.tags) values.add(tag);
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function filterWorkCards(
  cards: readonly WorkspaceWorkCard[],
  filters: CardListFilters,
): WorkspaceWorkCard[] {
  const needle = filters.query.trim().toLowerCase();
  return cards.filter((card) => {
    if (filters.stages.length > 0 && !filters.stages.includes(card.stage)) return false;
    if (filters.questions === "open" && cardOpenQuestions(card) === 0) return false;
    if (filters.questions === "clear" && cardOpenQuestions(card) > 0) return false;
    if (!needle) return true;
    return [card.title, card.slug, card.intent, card.owner, card.under].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });
}

/** An item matches when it carries every selected tag. */
export function filterDocs(
  items: readonly WorkspaceDoc[],
  filters: DocListFilters,
): WorkspaceDoc[] {
  const needle = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.linked === "linked" && item.entityLinks.length === 0) return false;
    if (filters.linked === "unlinked" && item.entityLinks.length > 0) return false;
    if (filters.tags.length > 0 && !filters.tags.every((tag) => item.tags.includes(tag))) return false;
    if (!needle) return true;
    return [item.title, item.path, item.summary, item.owner, ...item.tags].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });
}
