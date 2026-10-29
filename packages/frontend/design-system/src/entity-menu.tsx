import { createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { buttonClassName } from "./button";
import { ContextMenu } from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { MoreHorizontal, type HugeiconComponent } from "./hugeicons";
import "./entity-menu.css";

/** One action on an entity, listed the same in its "…" menu and its right-click menu. */
export type EntityAction = {
  /** Stable id; also the Ark item value. */
  id: string;
  label: string;
  icon?: HugeiconComponent;
  /** Shortcut hint on the right, such as "⌘C". */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** An action whose group differs from the one before it starts after a separator. */
  group?: string;
  onSelect: () => void;
};

function EntityMenuItems(props: {
  actions: readonly EntityAction[];
  item: typeof DropdownMenuItem;
  separator: typeof DropdownMenuSeparator;
}) {
  return (
    <For each={props.actions}>
      {(action, index) => (
        <>
          <Show when={index() > 0 && action.group !== props.actions[index() - 1]?.group}>
            <Dynamic component={props.separator} />
          </Show>
          <Dynamic
            component={props.item}
            value={action.id}
            danger={action.danger}
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            <Show when={action.icon}>{(icon) => <Dynamic component={icon()} size={14} aria-hidden="true" />}</Show>
            <span class="min-w-0 flex-1 truncate">{action.label}</span>
            <Show when={action.hint}>
              <kbd class="pw-entity-menu-hint">{action.hint}</kbd>
            </Show>
          </Dynamic>
        </>
      )}
    </For>
  );
}

/**
 * The "…" button of an entity row or page. Give its actions to `EntityContextMenu`
 * too, so right-click lists the same items. Clicks inside never reach the row.
 */
export function EntityMenuButton(props: { label: string; actions: readonly EntityAction[]; class?: string }) {
  return (
    <Show when={props.actions.length > 0}>
      {/* Menu items render in a portal whose events still reach the row; keep them there. */}
      <span class="inline-flex" onClick={(event) => event.stopPropagation()} onDblClick={(event) => event.stopPropagation()}>
        <DropdownMenu positioning={{ placement: "bottom-end" }}>
          <DropdownMenuTrigger aria-label={props.label} class={buttonClassName("ghost", "icon", props.class)}>
            <MoreHorizontal size={14} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-44">
            <EntityMenuItems actions={props.actions} item={DropdownMenuItem} separator={DropdownMenuSeparator} />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </Show>
  );
}

export type EntityContextMenuState = { x: number; y: number; actions: readonly EntityAction[] };

/** One right-click menu per page: rows call `open` with their actions. */
export function createEntityContextMenu() {
  const [state, setState] = createSignal<EntityContextMenuState | null>(null);
  return {
    state,
    open(event: MouseEvent, actions: readonly EntityAction[]) {
      if (actions.length === 0) return;
      event.preventDefault();
      setState({ x: event.clientX, y: event.clientY, actions });
    },
    close: () => setState(null),
  };
}

export type EntityContextMenuController = ReturnType<typeof createEntityContextMenu>;

/** The right-click menu `createEntityContextMenu` opens, at the pointer. */
export function EntityContextMenu(props: { menu: EntityContextMenuController }) {
  return (
    <ContextMenu.Root
      open={props.menu.state() !== null}
      onOpenChange={(open) => {
        if (!open) props.menu.close();
      }}
      anchorPoint={props.menu.state()}
    >
      <ContextMenu.Content class="min-w-44">
        <EntityMenuItems actions={props.menu.state()?.actions ?? []} item={ContextMenu.Item} separator={ContextMenu.Separator} />
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
