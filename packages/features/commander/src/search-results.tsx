import { createMemo, For } from "solid-js";
import {
  Button,
  FilterChip,
  Input,
  PageContent,
  PageHeader,
} from "@polterware/frontend-design-system";

export type SearchHit = {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  statusLabel?: string;
  section: string;
  tab?: string;
  entityKind?: string;
  entityId?: string;
};

export const SEARCH_HITS: SearchHit[] = [
  { id: "h1", category: "Atlas", title: "Payment Service", subtitle: "Service · Production", section: "atlas", entityKind: "arch-node", entityId: "payment" },
  { id: "h2", category: "Atlas", title: "Payment flow", subtitle: "System map", section: "atlas", tab: "map" },
  { id: "h3", category: "Atlas", title: "payment-service", subtitle: "Component · AWS · Healthy", section: "atlas", tab: "map", entityKind: "resource", entityId: "payment-service" },
  { id: "h5", category: "Work", title: "Payment flow", subtitle: "card · Build", section: "work", tab: "board", entityKind: "card", entityId: "payment-flow" },
  { id: "h6", category: "Truth", title: "Verdict 0004", subtitle: "verdict · Product positioning", section: "truth", tab: "decisions", entityKind: "verdict", entityId: "verdict-0004" },
];

export function knowledgeHitsFromSearch(hits: Array<{
  item?: { id?: string; title?: string; kind?: string; tags?: string[]; summary?: string };
  snippet?: string;
  source?: string;
}>): SearchHit[] {
  return hits.flatMap((hit) => {
    const id = hit.item?.id;
    const title = hit.item?.title;
    if (!id || !title) return [];
    const tags = hit.item?.tags ?? [];
    const kind = hit.item?.kind === "verdict" ? "verdict" : "evidence";
    const { section, tab, category } = kind === "verdict"
      ? { section: "truth", tab: "decisions", category: "Truth" }
      : { section: "truth", tab: "evidence", category: "Truth" };
    const entityKind = kind;
    return [{
      id: `knowledge-${id}`,
      category,
      title,
      subtitle: `${[kind, ...tags].join(" · ")} · ${hit.snippet || hit.item?.summary || hit.source || "knowledge"}`,
      section,
      tab,
      entityKind,
      entityId: id,
    }];
  });
}

export function SearchResultsPage(props: {
  query?: string;
  category?: string;
  onQuery?: (q: string) => void;
  onCategory?: (c: string) => void;
  onOpenHit?: (hit: SearchHit) => void;
}) {
  const q = () => (props.query ?? "").toLowerCase().trim();
  const filtered = createMemo(() => {
    let hits = SEARCH_HITS;
    if (q()) {
      hits = hits.filter(
        (h) =>
          h.title.toLowerCase().includes(q()) ||
          h.subtitle.toLowerCase().includes(q()) ||
          h.category.toLowerCase().includes(q()),
      );
    }
    if (props.category && props.category !== "all") {
      const cat = props.category;
      if (cat) hits = hits.filter((h) => h.category.toLowerCase() === cat.toLowerCase());
    }
    return hits;
  });
  const counts = createMemo(() => {
    const base = SEARCH_HITS.filter(
      (h) =>
        !q() ||
        h.title.toLowerCase().includes(q()) ||
        h.subtitle.toLowerCase().includes(q()) ||
        h.category.toLowerCase().includes(q()),
    );
    const c = new Map<string, number>([["all", base.length]]);
    for (const h of base) c.set(h.category, (c.get(h.category) ?? 0) + 1);
    return c;
  });
  const cats = () => ["all", "Atlas", "Work", "Truth"];

  return (
    <div class="flex h-full min-h-0 flex-col">
      <PageHeader title="Search" />
      <div class="border-b border-[var(--color-border-subtle)] px-4 py-3">
        <Input size="md" class="w-full" value={props.query ?? ""} placeholder="Search…" onInput={(e) => props.onQuery?.(e.currentTarget.value)} />
        <div class="mt-2 flex flex-wrap gap-1">
          <For each={cats()}>
            {(c) => (
              <FilterChip
                selected={(props.category ?? "all") === c || (c === "all" && !props.category)}
                count={counts().get(c) ?? 0}
                countAriaLabel={`${counts().get(c) ?? 0} results`}
                onClick={() => props.onCategory?.(c === "all" ? "all" : c)}
              >
                {c === "all" ? "All" : c}
              </FilterChip>
            )}
          </For>
        </div>
      </div>
      <PageContent class="p-4">
        {filtered().length === 0 ? (
          <p class="text-center text-[13px] text-[var(--color-text-muted)]">No results — refine your query</p>
        ) : (
          <For each={["Atlas", "Work", "Truth"]}>
            {(cat) => {
              const items = () => filtered().filter((h) => h.category === cat);
              if (!items().length) return null;
              return (
                <section class="mb-4">
                  <h2 class="m-0 mb-2 text-[12px] font-medium text-[var(--color-text-muted)] uppercase">{cat}</h2>
                  <For each={items()}>
                    {(h) => (
                      <button
                        type="button"
                        class="mb-1 flex w-full items-center justify-between rounded-[var(--radius-item)] px-2 py-2 text-left hover:bg-[var(--color-surface-hover)]"
                        onClick={() => props.onOpenHit?.(h)}
                      >
                        <span>
                          <span class="block text-[13px] text-[var(--color-text-primary)]">{h.title}</span>
                          <span class="block text-[11px] text-[var(--color-text-muted)]">{h.subtitle}</span>
                        </span>
                        <Button size="sm" variant="ghost">
                          Open
                        </Button>
                      </button>
                    )}
                  </For>
                </section>
              );
            }}
          </For>
        )}
      </PageContent>
    </div>
  );
}
