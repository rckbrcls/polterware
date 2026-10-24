import { For, Show } from "solid-js";
import { Button, Field, FileText, IconTile, Input, Link, StatusChip } from "@polterware/frontend-design-system";
import type { CompilePreviewResult } from "./agents-types";

/** CompileContext playground for the current project. */
export function CompilePreviewCard(props: {
  query: string;
  entityId: string;
  budget: string;
  busy: boolean;
  result: CompilePreviewResult | undefined;
  error: string | undefined;
  onQueryChange: (value: string) => void;
  onEntityIdChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onCompile: () => void;
}) {
  return (
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_auto] sm:items-end">
        <Field label="Query">
          <Input
            value={props.query}
            placeholder="architecture payment"
            onInput={(event) => props.onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onCompile();
            }}
          />
        </Field>
        <Field label="Entity id">
          <Input
            value={props.entityId}
            placeholder="Optional"
            onInput={(event) => props.onEntityIdChange(event.currentTarget.value)}
          />
        </Field>
        <Field label="Budget">
          <Input
            value={props.budget}
            inputMode="numeric"
            onInput={(event) => props.onBudgetChange(event.currentTarget.value)}
          />
        </Field>
        <Button
          size="sm"
          variant="primary"
          disabled={props.busy}
          onClick={() => props.onCompile()}
        >
          {props.busy ? "Compiling…" : "Compile"}
        </Button>
      </div>

      <Show when={props.error}>
        {(message) => (
          <p role="alert" class="m-0 text-[12px] text-[var(--color-danger)]">{message()}</p>
        )}
      </Show>

      <Show when={props.result}>
        {(result) => (
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <StatusChip
                tone="ok"
                label={`${result().tokensUsed} / ${result().tokenBudget} tokens`}
              />
              <span class="text-[11.5px] text-[var(--color-text-muted)]">
                {result().items.length} {result().items.length === 1 ? "item" : "items"}
              </span>
              <Show when={result().truncated}>
                <StatusChip tone="warn" label="Truncated" />
              </Show>
            </div>
            <Show
              when={result().items.length > 0}
              fallback={<p class="m-0 text-[12px] text-[var(--color-text-muted)]">No items in this package.</p>}
            >
              <ol class="m-0 flex list-none flex-col gap-4 p-0">
                <For each={result().items}>
                  {(item) => (
                    <li class="flex min-w-0 items-start gap-3">
                      <IconTile size={24} tone="knowledge" seed={item.title} class="shrink-0">
                        <FileText size={14} />
                      </IconTile>
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <p class="m-0 text-[12.5px] text-[var(--color-text-primary)]">{item.title}</p>
                        <p class="m-0 truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                          {[item.kind, item.truthClass, item.source, item.path].filter(Boolean).join(" · ")}
                        </p>
                        <Show when={item.excerpt}>
                          <p class="m-0 line-clamp-2 text-[12px] text-[var(--color-text-secondary)]">
                            {item.excerpt}
                          </p>
                        </Show>
                        <Show when={item.reasons.length > 0}>
                          <p class="m-0 text-[11.5px] text-[var(--color-text-muted)]">
                            Why: {item.reasons.join(", ")}
                          </p>
                        </Show>
                        <Show when={item.evidence.length > 0}>
                          <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
                            <For each={item.evidence}>
                              {(ev) => (
                                <li class="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--color-text-muted)]">
                                  <Link size={12} aria-hidden class="shrink-0" />
                                  <span class="truncate">
                                    Evidence · {ev.kind}
                                    {ev.path ? ` · ${ev.path}` : ""}
                                    {ev.summary ? ` — ${ev.summary}` : ""}
                                  </span>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
