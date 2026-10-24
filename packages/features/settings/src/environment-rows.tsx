import { For, Show, createSignal } from "solid-js";
import { Button, IconTile, Server, StatusChip } from "@polterware/frontend-design-system";
import type { ProjectEnvironment } from "./types";
import {
  environmentKindLabel,
  environmentKindTone,
  protectionLabel,
  protectionTone,
} from "./environment-status";

/** Expandable environment rows for the Settings dialog. */
export function EnvironmentRows(props: {
  environments: readonly ProjectEnvironment[];
  canDelete: boolean;
  onSetDefault?: (environmentId: string) => void;
  onDelete?: (environmentId: string) => void;
}) {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  return (
    <ul class="m-0 flex list-none flex-col gap-3 p-0" aria-label="Environments">
      <For each={props.environments}>
        {(environment) => {
          const open = () => expandedId() === environment.id;
          const rules = () => environment.protectionRules ?? [];
          return (
            <li class="flex flex-col gap-3">
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border-0 bg-transparent p-0 text-left text-[12.5px] text-[var(--color-text-primary)]"
                aria-expanded={open()}
                onClick={() => setExpandedId(open() ? null : environment.id)}
              >
                <IconTile size={24} tone="infrastructure" seed={environment.id} class="shrink-0">
                  <Server size={14} />
                </IconTile>
                <span class="min-w-0 flex-1 truncate">{environment.name}</span>
                <Show when={environment.isDefault}>
                  <StatusChip tone="muted" label="Default" />
                </Show>
                <StatusChip
                  tone={environmentKindTone(environment.kind)}
                  label={environmentKindLabel(environment.kind)}
                />
                <StatusChip
                  tone={protectionTone(environment.protection)}
                  label={protectionLabel(environment.protection)}
                />
              </button>
              <Show when={open()}>
                <div class="flex flex-col gap-2 pl-9 text-[12px] text-[var(--color-text-secondary)]">
                  <p class="m-0">{environment.description || "No summary yet."}</p>
                  <Show when={rules().length > 0}>
                    <ul class="m-0 list-disc space-y-1 pl-4" aria-label="Protection rules">
                      <For each={rules()}>{(rule) => <li>{rule}</li>}</For>
                    </ul>
                  </Show>
                  <p class="m-0 font-mono text-[11px] text-[var(--color-text-muted)]">
                    {environment.id}
                  </p>
                  <div class="flex gap-2">
                    <Show when={props.onSetDefault && !environment.isDefault}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => props.onSetDefault?.(environment.id)}
                      >
                        Set as default
                      </Button>
                    </Show>
                    <Show when={props.onDelete && props.canDelete}>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => props.onDelete?.(environment.id)}
                      >
                        Delete environment
                      </Button>
                    </Show>
                  </div>
                </div>
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
