import type { JSX } from "solid-js";
import { Show, createEffect, onCleanup, onMount, splitProps } from "solid-js";
import { ChevronDown } from "@polterware/frontend-design-system";
import { cx } from "./classes";
import "./sidebar.css";

export type SidebarItemHover = {
  registerItem: (index: number, element: HTMLElement) => () => void;
};

export function SidebarNavFrame(props: { children: JSX.Element } & JSX.HTMLAttributes<HTMLElement>) {
  const [local, rest] = splitProps(props, ["children", "class", "aria-label"]);
  return (
    <nav
      {...rest}
      class={cx("pw-sidebar-nav", local.class)}
      aria-label={local["aria-label"] ?? "Primary"}
    >
      {local.children}
    </nav>
  );
}

/**
 * A labeled group of sidebar items. With `onToggle` the label is a button that collapses
 * the group; the caller decides which items stay (the active one, in Linear's way).
 */
export function SidebarSection(props: {
  label?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  children: JSX.Element;
}) {
  return (
    <div class="pw-sidebar-group" data-collapsed={props.collapsed ? "true" : undefined}>
      <Show when={props.label}>
        {(label) => (
          <Show when={props.onToggle} fallback={<p class="pw-sidebar-group-label">{label()}</p>}>
            <button
              type="button"
              class="pw-sidebar-group-label pw-sidebar-group-toggle"
              aria-expanded={!props.collapsed}
              onClick={() => props.onToggle?.()}
            >
              {label()}
              <ChevronDown size={12} aria-hidden="true" class="pw-sidebar-group-chevron" />
            </button>
          </Show>
        )}
      </Show>
      {props.children}
    </div>
  );
}

export function SidebarItem(props: {
  active?: boolean;
  nav?: boolean;
  footer?: boolean;
  onClick?: () => void;
  icon?: JSX.Element;
  children: JSX.Element;
  trailing?: JSX.Element;
  hover?: SidebarItemHover;
  index?: number;
  class?: string;
  "aria-label"?: string;
}) {
  let element: HTMLButtonElement | undefined;
  onMount(() => {
    const row = element;
    const hover = props.hover;
    const index = props.index;
    if (!row || !hover || index === undefined) return;
    createEffect(() => onCleanup(hover.registerItem(index, row)));
  });
  return (
    <button
      ref={element}
      type="button"
      aria-label={props["aria-label"]}
      aria-current={props.active ? "page" : undefined}
      class={cx(
        "pw-sidebar-item",
        props.nav && "pw-sidebar-item--nav",
        props.active && "pw-sidebar-item--active",
        props.footer && "pw-sidebar-item--footer",
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      {props.icon ? <span class="pw-sidebar-item-icon">{props.icon}</span> : null}
      <span class="pw-sidebar-item-label">{props.children}</span>
      {props.trailing}
    </button>
  );
}
