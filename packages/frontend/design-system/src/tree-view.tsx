import { TreeView as ArkTreeView, createTreeCollection, useTreeViewNodeContext, type TreeViewRootProps } from "@ark-ui/solid/tree-view";
import { For, Show, createEffect, createMemo, on, onCleanup, splitProps, type JSX } from "solid-js";
import { animate, type AnimationPlaybackControls } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";
import { createFluidHover, FluidHoverHighlight, type FluidHover } from "./fluid-hover";
import { ChevronRight, MinusSignIcon, Plus } from "./hugeicons";
import "./tree-view.css";

export type TreeViewNode = {
  id: string;
  label: string;
  children?: TreeViewNode[];
  icon?: JSX.Element;
  trailing?: JSX.Element;
  /** Content under the label line, for card rows that carry the entity's own details. */
  details?: JSX.Element;
  /** Right-click on the row, such as `EntityContextMenu`'s open with the row's actions. */
  onContextMenu?: (event: MouseEvent) => void;
};
export type TreeViewProps = Omit<TreeViewRootProps<TreeViewNode>, "children" | "collection"> & {
  nodes: TreeViewNode[];
  label: string;
  /** Show the expand chevron on branches. Defaults to true. */
  indicator?: boolean;
  /** Expand or collapse a branch when its row is clicked. When false the chevron becomes a button and is the only way to toggle with the pointer. Defaults to true. */
  expandOnClick?: boolean;
  /** Show the vertical guide line beside nested rows. Defaults to true. */
  guides?: boolean;
  /** Card rows with a texture +/- key in front of each branch card; curved elbows run from each open key into its children's keys. Replaces the plain guide line and chevron. */
  branches?: boolean;
  /** Glide one hover highlight between the rows of each level (Spaces and their notes alike). */
  fluidHover?: boolean;
};

export function TreeView(props: TreeViewProps) {
  const [local, rest] = splitProps(props, ["nodes", "label", "class", "indicator", "guides", "fluidHover", "branches", "expandOnClick"]);
  const collection = createMemo(() =>
    createTreeCollection<TreeViewNode>({
      rootNode: { id: "__root__", label: "", children: local.nodes },
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.label,
    }),
  );
  const rows = (hover?: FluidHover) => (
    <For each={local.nodes}>{(node, index) => <TreeNode node={node} indexPath={[index()]} indicator={local.indicator !== false} toggleButton={local.expandOnClick === false} guides={local.guides !== false} branches={!!local.branches} fluidHover={local.fluidHover} hover={hover} />}</For>
  );
  return (
    <ArkTreeView.Root {...rest} expandOnClick={local.expandOnClick} collection={collection()} class={`pw-tree ${local.branches ? "pw-tree--branches" : ""} ${local.class ?? ""}`}>
      <ArkTreeView.Label>{local.label}</ArkTreeView.Label>
      <Show when={local.fluidHover} fallback={<ArkTreeView.Tree>{rows()}</ArkTreeView.Tree>}>
        <FluidTreeList>{(hover, attach) => <ArkTreeView.Tree ref={attach} data-fluid-hover=""><TreeHoverHighlight hover={hover} />{rows(hover)}</ArkTreeView.Tree>}</FluidTreeList>
      </Show>
    </ArkTreeView.Root>
  );
}

type TreeNodeProps = { node: TreeViewNode; indexPath: number[]; indicator: boolean; toggleButton: boolean; guides: boolean; branches: boolean; fluidHover?: boolean; hover?: FluidHover };

function TreeNode(props: TreeNodeProps) {
  // For can reorder or recreate rows; registration follows the live index and owner.
  const registerRow = (element: HTMLElement) => createEffect(() => {
    const hover = props.hover;
    if (hover) onCleanup(hover.registerItem(props.indexPath[props.indexPath.length - 1]!, element));
  });
  return (
    <ArkTreeView.NodeProvider node={props.node} indexPath={props.indexPath}>
      <Show when={!props.branches} fallback={<BranchCardNode {...props} registerRow={registerRow} />}>
      <Show
        when={props.node.children?.length}
        fallback={
          <ArkTreeView.Item class={rowClass(props.node)} ref={registerRow} onContextMenu={(event) => props.node.onContextMenu?.(event)}>
            {props.node.icon}
            <ArkTreeView.ItemText class="pw-tree__text">{props.node.label}</ArkTreeView.ItemText>
            {props.node.trailing ? <span class="pw-tree__trailing">{props.node.trailing}</span> : null}
            {props.node.details ? <div class="pw-tree__details">{props.node.details}</div> : null}
          </ArkTreeView.Item>
        }
      >
        <ArkTreeView.Branch>
          <ArkTreeView.BranchControl class={rowClass(props.node)} ref={registerRow} onContextMenu={(event) => props.node.onContextMenu?.(event)}>
            {props.node.icon}
            <ArkTreeView.BranchText class="pw-tree__text">{props.node.label}</ArkTreeView.BranchText>
            <Show when={props.indicator}>
              <Show
                when={props.toggleButton}
                fallback={<ArkTreeView.BranchIndicator class="pw-tree__indicator"><ChevronRight size={14} /></ArkTreeView.BranchIndicator>}
              >
                <ArkTreeView.BranchTrigger class="pw-tree__toggle rounded-full" aria-label={`Toggle ${props.node.label}`}>
                  <ArkTreeView.BranchIndicator class="pw-tree__indicator"><ChevronRight size={14} /></ArkTreeView.BranchIndicator>
                </ArkTreeView.BranchTrigger>
              </Show>
            </Show>
            {props.node.trailing ? <span class="pw-tree__trailing pw-tree__trailing--after-indicator">{props.node.trailing}</span> : null}
            {props.node.details ? <div class="pw-tree__details">{props.node.details}</div> : null}
          </ArkTreeView.BranchControl>
          <TreeChildren {...props} />
        </ArkTreeView.Branch>
      </Show>
      </Show>
    </ArkTreeView.NodeProvider>
  );
}

/** Branches mode: ring cards (the shared Card material), each led by a texture key (+ closed, - open; a dot on leaves) where the elbows land. */
function BranchCardNode(props: TreeNodeProps & { registerRow: (element: HTMLElement) => void }) {
  const content = (Text: typeof ArkTreeView.ItemText | typeof ArkTreeView.BranchText) => <>
    {props.node.icon}
    <Text class="pw-tree__text">{props.node.label}</Text>
    {props.node.trailing ? <span class="pw-tree__trailing">{props.node.trailing}</span> : null}
    {props.node.details ? <div class="pw-tree__details">{props.node.details}</div> : null}
  </>;
  return (
    <Show
      when={props.node.children?.length}
      fallback={
        <div class="pw-tree__line">
          <span class="pw-tree__key pw-tree__key--leaf" aria-hidden="true"><span class="pw-tree__dot pw-texture-button rounded-full" /></span>
          <ArkTreeView.Item class={`${rowClass(props.node)} card-panel`} ref={props.registerRow} onContextMenu={(event) => props.node.onContextMenu?.(event)}>{content(ArkTreeView.ItemText)}</ArkTreeView.Item>
        </div>
      }
    >
      <ArkTreeView.Branch>
        <div class="pw-tree__line">
          <ArkTreeView.BranchTrigger class="pw-tree__key pw-texture-button rounded-full" aria-label={`Toggle ${props.node.label}`}>
            <span class="pw-tree__key-expand"><Plus size={12} /></span>
            <span class="pw-tree__key-collapse"><MinusSignIcon size={12} /></span>
          </ArkTreeView.BranchTrigger>
          <ArkTreeView.BranchControl class={`${rowClass(props.node)} card-panel`} ref={props.registerRow} onContextMenu={(event) => props.node.onContextMenu?.(event)}>{content(ArkTreeView.BranchText)}</ArkTreeView.BranchControl>
        </div>
        <TreeChildren {...props} />
      </ArkTreeView.Branch>
    </Show>
  );
}

function rowClass(node: TreeViewNode) {
  return node.details ? "pw-tree__row pw-tree__row--details" : "pw-tree__row";
}

function TreeChildren(props: TreeNodeProps) {
  const rows = (hover?: FluidHover) => <>
    <Show when={props.guides}><ArkTreeView.BranchIndentGuide class="pw-tree__guide" /></Show>
    <For each={props.node.children}>
      {(node, index) => <TreeNode node={node} indexPath={[...props.indexPath, index()]} indicator={props.indicator} toggleButton={props.toggleButton} guides={props.guides} branches={props.branches} fluidHover={props.fluidHover} hover={hover} />}
    </For>
  </>;
  const growth = props.branches ? createBranchGrowth() : undefined;
  return <Show when={props.fluidHover} fallback={<ArkTreeView.BranchContent ref={growth} class="pw-tree__children">{rows()}</ArkTreeView.BranchContent>}>
    <FluidTreeList>{(hover, attach) => <ArkTreeView.BranchContent ref={attach} class="pw-tree__children" data-fluid-hover=""><TreeHoverHighlight hover={hover} />{rows(hover)}</ArkTreeView.BranchContent>}</FluidTreeList>
  </Show>;
}

/**
 * Branch cards open and close like the shared collapse: the children (and the elbows they
 * carry) grow from 0 to their measured height on `spring.moderate` and fold on its quicker
 * exit tween, interruptible from the height on screen. Snaps on first paint and under
 * reduced motion.
 */
function createBranchGrowth() {
  const node = useTreeViewNodeContext();
  let element: HTMLElement | undefined;
  let controls: AnimationPlaybackControls | undefined;
  let first = true;
  const settle = (open: boolean) => {
    if (!element) return;
    element.style.height = open ? "" : "0px";
    element.style.marginTop = open ? "" : "0px";
    element.style.overflow = open ? "" : "hidden";
    element.style.visibility = open ? "" : "hidden";
  };
  createEffect(on(() => node().expanded, (open) => {
    if (!element) return;
    controls?.stop();
    if (first || prefersReducedMotion()) {
      first = false;
      settle(open);
      return;
    }
    const from = element.getBoundingClientRect().height;
    element.style.visibility = "";
    element.style.overflow = "hidden";
    element.style.height = "auto";
    element.style.marginTop = "";
    const gap = getComputedStyle(element).marginTop;
    const to = open ? element.scrollHeight : 0;
    element.style.height = `${from}px`;
    const transition = open ? spring.moderate : ({ type: "tween", ...spring.moderate.exit, ease: "easeIn" } as const);
    const run = animate(element, { height: [`${from}px`, `${to}px`], marginTop: open ? [from ? gap : "0px", gap] : [gap, "0px"] }, transition);
    controls = run;
    void run.finished.then(() => { if (controls === run) settle(open); });
  }));
  onCleanup(() => controls?.stop());
  return (el: HTMLElement) => {
    element = el;
    // Ark hides closed content at once, and Tailwind's layered `[hidden]` rule wins over any
    // class, so the attribute is lifted: height 0 and visibility hide it after the fold.
    const observer = new MutationObserver(() => { if (el.hidden) el.hidden = false; });
    observer.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    if (el.hidden) el.hidden = false;
    onCleanup(() => observer.disconnect());
  };
}

/** One gliding highlight per tree level; the root list and each open branch each own one. */
function FluidTreeList(props: { children: (hover: FluidHover, attach: (element: HTMLElement) => void) => JSX.Element }) {
  let container: HTMLElement | undefined;
  const hover = createFluidHover(() => container, { gapClick: false });
  // A row belongs to the nearest level; nested levels own their rows and descendants.
  const ownsTarget = (target: EventTarget | null) => target instanceof Element && !!container &&
    target.closest("[data-fluid-hover]") === container;

  const attach = (root: HTMLElement) => {
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

  return props.children(hover, attach);
}

/** Rendered first inside its level, so the rows paint above it. */
function TreeHoverHighlight(props: { hover: FluidHover }) {
  return <FluidHoverHighlight hover={props.hover} class="pw-tree__hover" />;
}
