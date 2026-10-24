import { For, Show } from "solid-js";
import { Button, Field, GitCompare, IconTile, Input, StatusChip } from "@polterware/frontend-design-system";
import type { DriftPreviewResult } from "./agents-types";
import { driftFindingSeverityTone } from "./drift-step-payload";

/** Narrow Drift Checker preview for the current project (Desktop inspection only). */
export function DriftPreviewCard(props: {
  entityId: string;
  busy: boolean;
  result: DriftPreviewResult | undefined;
  error: string | undefined;
  onEntityIdChange: (value: string) => void;
  onCheck: () => void;
}) {
  return (
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Entity id">
          <Input
            value={props.entityId}
            placeholder="Optional — leave empty to check the whole project"
            onInput={(event) => props.onEntityIdChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onCheck();
            }}
          />
        </Field>
        <Button
          size="sm"
          variant="primary"
          disabled={props.busy}
          onClick={() => props.onCheck()}
        >
          {props.busy ? "Checking…" : "Check drift"}
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
                tone={result().findings.length > 0 ? "warn" : "ok"}
                label={
                  result().findings.length === 0
                    ? "No findings"
                    : `${result().findings.length} ${result().findings.length === 1 ? "finding" : "findings"}`
                }
              />
              <span class="text-[11.5px] text-[var(--color-text-muted)]">
                {[`${result().checker || "narrow"} checker`, result().status].filter(Boolean).join(" · ")}
              </span>
            </div>
            <Show
              when={result().findings.length > 0}
              fallback={
                <p class="m-0 text-[12px] text-[var(--color-text-muted)]">
                  No findings under the narrow rules — not “no checker”.
                </p>
              }
            >
              <ul class="m-0 flex list-none flex-col gap-4 p-0">
                <For each={result().findings}>
                  {(finding) => (
                    <li class="flex min-w-0 items-start gap-3">
                      <IconTile size={24} tone="observability" seed={finding.summary} class="shrink-0">
                        <GitCompare size={14} />
                      </IconTile>
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <StatusChip
                            tone={driftFindingSeverityTone(finding.severity)}
                            label={finding.severity || "finding"}
                          />
                          <Show when={finding.type}>
                            <span class="font-mono text-[11px] text-[var(--color-text-muted)]">
                              {finding.type}
                            </span>
                          </Show>
                        </div>
                        <p class="m-0 text-[12.5px] text-[var(--color-text-primary)]">
                          {finding.summary || "—"}
                        </p>
                        <Show when={finding.subjectIds.length > 0}>
                          <p class="m-0 truncate font-mono text-[11px] text-[var(--color-text-muted)] pw-selectable">
                            Subjects: {finding.subjectIds.join(", ")}
                          </p>
                        </Show>
                        <Show when={finding.evidenceIds.length > 0}>
                          <p class="m-0 truncate font-mono text-[11px] text-[var(--color-text-muted)] pw-selectable">
                            Evidence: {finding.evidenceIds.join(", ")}
                          </p>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
