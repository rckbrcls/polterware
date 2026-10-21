import type { JSX } from "solid-js";
import { Index, Show } from "solid-js";
import { Button } from "./button";
import { SwitchRow } from "./switch";
import { MenuItem } from "./menu";

export type FilterOptionsPanelOption = {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onCheckedChange: (checked: boolean) => void;
};

export type FilterOptionsPanelAction = {
  label: string;
  onSelect: () => void;
};

export type FilterOptionsPanelGroup = {
  id: string;
  label: string;
  leading?: JSX.Element;
  selectionMode?: "multiple" | "single";
  /** One option shown as a switch in the parent list instead of opening a submenu. */
  inline?: boolean;
  options: readonly FilterOptionsPanelOption[];
  action?: FilterOptionsPanelAction;
};

export function FilterOptionsHeader(props: {
  title: string;
  clearLabel?: string;
  onClear?: () => void;
}) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5">
      <p class="m-0 text-[12px] font-medium text-[var(--color-text-primary)]">
        {props.title}
      </p>
      <Show when={props.onClear}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onClear?.()}
        >
          {props.clearLabel ?? "Clear"}
        </Button>
      </Show>
    </div>
  );
}

export function FilterOptionsPanel(props: {
  group: FilterOptionsPanelGroup;
  header?: JSX.Element;
  onMouseEnter?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseLeave?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onKeyDown?: JSX.EventHandler<HTMLDivElement, KeyboardEvent>;
}) {
  return (
    <div
      class="flex min-h-0 flex-col"
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onKeyDown={props.onKeyDown}
    >
      {props.header}
      <div class="min-h-0 overflow-y-auto p-2" role="group" aria-label={props.group.label}>
        {/* Index, not For: options are rebuilt on every change, and For would replace each
            switch instead of letting its thumb animate. */}
        <Index each={props.group.options}>
          {(option) => (
            <SwitchRow
              checked={Boolean(option().checked)}
              disabled={option().disabled}
              label={option().label}
              leading={option().leading}
              trailing={option().trailing}
              onCheckedChange={(checked) => option().onCheckedChange(checked)}
            />
          )}
        </Index>
        <Show when={props.group.action}>
          {(action) => (
            <>
              <div class="my-1 border-t border-[var(--color-border-subtle)]" aria-hidden />
              <MenuItem onClick={() => action().onSelect()}>{action().label}</MenuItem>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
