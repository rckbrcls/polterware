import { TreeView as ArkTreeView, createTreeCollection, type TreeViewRootProps } from "@ark-ui/solid/tree-view";
import { For, Show, createEffect, createMemo, onCleanup, splitProps, type JSX } from "solid-js";
import { createFluidHover, FluidHoverHighlight, type FluidHover } from "./fluid-hover";
import { ChevronRight } from "./hugeicons";
import "./tree-view.css";

export type TreeViewNode = { id: string; label: string; children?: TreeViewNode[]; icon?: JSX.Element; trailing?: JSX.Element };
export type TreeViewProps = Omit<TreeViewRootProps<TreeViewNode>, "children" | "collection"> & {
  nodes: TreeViewNode[];
  label: string;
  /** Show the expand chevron on branches. Defaults to true. */
  indicator?: boolean;
  /** Show the vertical guide line beside nested rows. Defaults to true. */
  guides?: boolean;
  /** Glide one hover highlight between the leaves of each branch. */
  fluidHover?: boolean;
};

export function TreeView(props: TreeViewProps) {
  const [local, rest] = splitProps(props, ["nodes", "label", "class", "indicator", "guides", "fluidHover"]);
  const collection = createMemo(() =>
    createTreeCollection<TreeViewNode>({
      rootNode: { id: "__root__", label: "", children: local.nodes },
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.label,
    }),
  );
  return (
    <ArkTreeView.Root {...rest} collection={collection()} class={`pw-tree ${local.class ?? ""}`}>
      <ArkTreeView.Label>{local.label}</ArkTreeView.Label>
      <ArkTreeView.Tree>
        <For each={local.nodes}>{(node, index) => <TreeNode node={node} indexPath={[index()]} indicator={local.indicator !== false} guides={local.guides !== false} fluidHover={local.fluidHover} />}</For>
      </ArkTreeView.Tree>
    </ArkTreeView.Root>
  );
}

type TreeNodeProps = { node: TreeViewNode; indexPath: number[]; indicator: boolean; guides: boolean; fluidHover?: boolean; hover?: FluidHover };

function TreeNode(props: TreeNodeProps) {
  return (
    <ArkTreeView.NodeProvider node={props.node} indexPath={props.indexPath}>
      <Show
        when={props.node.children?.length}
        fallback={
          <ArkTreeView.Item class="pw-tree__row" ref={(element) => {
            // For can reorder or recreate rows; registration follows the live index and owner.
            createEffect(() => {
              const hover = props.hover;
              if (hover) onCleanup(hover.registerItem(props.indexPath[props.indexPath.length - 1]!, element));
            });
          }}>
            {props.node.icon}
            <ArkTreeView.ItemText class="pw-tree__text">{props.node.label}</ArkTreeView.ItemText>
            {props.node.trailing ? <span class="pw-tree__trailing">{props.node.trailing}</span> : null}
          </ArkTreeView.Item>
        }
      >
        <ArkTreeView.Branch>
          <ArkTreeView.BranchControl class="pw-tree__row">
            {props.node.icon}
            <ArkTreeView.BranchText class="pw-tree__text">{props.node.label}</ArkTreeView.BranchText>
            <Show when={props.indicator}>
              <ArkTreeView.BranchIndicator class="pw-tree__indicator">
                <ChevronRight size={14} />
              </ArkTreeView.BranchIndicator>
            </Show>
            {props.node.trailing ? <span class="pw-tree__trailing pw-tree__trailing--after-indicator">{props.node.trailing}</span> : null}
          </ArkTreeView.BranchControl>
          <TreeChildren {...props} />
        </ArkTreeView.Branch>
      </Show>
    </ArkTreeView.NodeProvider>
  );
}

function TreeChildren(props: TreeNodeProps) {
  const rows = (hover?: FluidHover) => <>
    <Show when={props.guides}><ArkTreeView.BranchIndentGuide class="pw-tree__guide" /></Show>
    <For each={props.node.children}>
      {(node, index) => <TreeNode node={node} indexPath={[...props.indexPath, index()]} indicator={props.indicator} guides={props.guides} fluidHover={props.fluidHover} hover={hover} />}
    </For>
  </>;
  return <Show when={props.fluidHover} fallback={<ArkTreeView.BranchContent class="pw-tree__children">{rows()}</ArkTreeView.BranchContent>}>
    <FluidTreeChildren>{rows}</FluidTreeChildren>
  </Show>;
}

function FluidTreeChildren(props: { children: (hover: FluidHover) => JSX.Element }) {
  let container: HTMLDivElement | undefined;
  const hover = createFluidHover(() => container, { gapClick: false });
  // Nested Spaces own their highlights. Their headers and descendants must not pick
  // the nearest leaf in this ancestor list.
  const ownsTarget = (target: EventTarget | null) => target instanceof Element &&
    target.closest(".pw-tree__children") === container &&
    target.closest('[data-part="branch"]') === container?.parentElement;

  const registerContainer = (root: HTMLDivElement) => {
    container = root;
    // Native listeners preserve Ark's own event handlers.
    const listen = <K extends keyof HTMLElementEventMap>(name: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      root.addEventListener(name, handler);
      onCleanup(() => root.removeEventListener(name, handler));
    };
    listen("pointerenter", hover.handlers.onPointerEnter);
    listen("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      if (ownsTarget(event.target)) hover.handlers.onPointerMove(event);
      else hover.handlers.onPointerLeave();
    });
    listen("pointerleave", hover.handlers.onPointerLeave);
    listen("focusin", (event) => {
      if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return;
      hover.releasePointer();
      if (ownsTarget(event.target)) hover.handlers.onFocusIn(event);
      else hover.setActiveIndex(null);
    });
    listen("focusout", (event) => {
      if (!ownsTarget(event.relatedTarget)) hover.handlers.onPointerLeave();
      else hover.handlers.onFocusOut(event);
    });
  };

  return <ArkTreeView.BranchContent ref={registerContainer} class="pw-tree__children" data-fluid-hover="">
    <FluidHoverHighlight hover={hover} class="pw-tree__hover" />
    {props.children(hover)}
  </ArkTreeView.BranchContent>;
}
