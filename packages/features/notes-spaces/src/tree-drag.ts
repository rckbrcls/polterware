import { createDragMotion, type DragMotion } from "@polterware/frontend-design-system";

/** Pointer travel before a press on a row becomes a drag. */
const DEAD_ZONE = 4;
const LIFT_SCALE = 1.03;
const ROW_SELECTOR = "[data-part='item'], [data-part='branch-control']";

/** Where the held Space would land: inside a row, or in the gap before/after one (null anchor = end of the root). */
export type TreeDrop =
  | { kind: "into"; target: string }
  | { kind: "before" | "after"; anchor: string }
  | { kind: "end" };

type Row = { id: string; element: HTMLElement; top: number; bottom: number; expanded: boolean; motion?: DragMotion };

/**
 * Pointer drag for the Spaces sidebar tree: the held row follows the pointer and the rows below it are pushed
 * aside to open a gap where it would land (the middle of a row means "put it inside"). The tree is rendered by
 * Ark, so rows are only translated while dragging; the order is committed once the held row has settled.
 */
export function createTreeDrag(options: {
  root: () => HTMLElement | undefined;
  isSpace: (id: string) => boolean;
  canDrop: (held: string, drop: TreeDrop) => boolean;
  commit: (held: string, drop: TreeDrop) => Promise<void> | void;
  isNote: (id: string) => boolean;
}) {
  let suppressClick = false;

  const onPointerDown = (event: PointerEvent) => {
    const root = options.root();
    if (!root || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("button, input, a, [data-no-drag]")) return;
    const heldRow = target.closest<HTMLElement>(ROW_SELECTOR);
    const heldId = heldRow?.getAttribute("data-value") ?? "";
    if (!heldRow || !heldId || options.isNote(heldId) || !options.isSpace(heldId)) return;

    const block = heldRow.closest<HTMLElement>("[data-part='branch']") ?? heldRow;
    const scroller = root;
    const startX = event.clientX;
    const startY = event.clientY;
    const startScroll = scroller.scrollTop;
    let y = startY;
    let x = startX;
    let active = false;
    let rows: Row[] = [];
    let heldMotion: DragMotion | undefined;
    let drop: TreeDrop | null = null;
    let highlighted: HTMLElement | null = null;
    let blockTop = 0;
    let blockBottom = 0;
    let blockHeight = 0;
    let rootBox: DOMRect | undefined;

    const scrolled = () => scroller.scrollTop - startScroll;

    const begin = () => {
      active = true;
      rootBox = root.getBoundingClientRect();
      const blockBox = block.getBoundingClientRect();
      blockTop = blockBox.top;
      blockBottom = blockBox.bottom;
      // The gap a row leaves is its own height plus the space between rows.
      const nextBox = [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
        .filter((row) => !block.contains(row))
        .map((row) => row.getBoundingClientRect())
        .find((box) => box.top >= blockBottom - 0.5);
      blockHeight = blockBox.height + (nextBox ? Math.max(0, nextBox.top - blockBottom) : 0);
      rows = [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
        .filter((row) => !block.contains(row))
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-value") ?? "",
            element,
            top: box.top,
            bottom: box.bottom,
            expanded: element.getAttribute("aria-expanded") === "true" || element.getAttribute("data-state") === "open",
          };
        });
      block.setAttribute("data-tree-held", "true");
      block.style.pointerEvents = "none";
      heldMotion = createDragMotion(block, { liftScale: LIFT_SCALE });
      heldMotion.lift(true);
      window.addEventListener("keydown", onKey);
    };

    const hit = (): TreeDrop | null => {
      const py = y - scrolled();
      for (const row of rows) {
        if (py < row.top || py > row.bottom) continue;
        const isSpace = options.isSpace(row.id) && !options.isNote(row.id);
        if (!isSpace) return null;
        const ratio = (py - row.top) / Math.max(1, row.bottom - row.top);
        // An expanded Space's lower half is "inside" too: below it sit its children, not its next sibling.
        if (ratio > 0.25 && ratio < 0.75) return { kind: "into", target: row.id };
        if (ratio >= 0.75 && row.expanded) return { kind: "into", target: row.id };
        return ratio <= 0.25 ? { kind: "before", anchor: row.id } : { kind: "after", anchor: row.id };
      }
      const last = rows[rows.length - 1];
      if (rootBox && x >= rootBox.left && x <= rootBox.right && (!last || py > last.bottom)) return { kind: "end" };
      return null;
    };

    /** Y of the opening gap in the original layout, or null when the drop pushes nothing. */
    const gapY = (target: TreeDrop | null): number | null => {
      if (!target || target.kind === "into") return null;
      if (target.kind === "end") return rows.length ? rows[rows.length - 1]!.bottom : null;
      const anchor = rows.find((row) => row.id === target.anchor);
      if (!anchor) return null;
      return target.kind === "before" ? anchor.top : anchor.bottom;
    };

    const layout = () => {
      const gap = gapY(drop);
      for (const row of rows) {
        // Closing the held row's old slot, then opening the new gap.
        let shift = row.top >= blockBottom - 0.5 ? -blockHeight : 0;
        if (gap !== null && row.top >= gap - 0.5) shift += blockHeight;
        if (shift === 0 && !row.motion) continue;
        row.motion ??= createDragMotion(row.element);
        void row.motion.settle(0, shift);
      }
    };

    const retarget = () => {
      let next = hit();
      if (next && !options.canDrop(heldId, next)) next = null;
      const same = JSON.stringify(next) === JSON.stringify(drop);
      drop = next;
      const into = next?.kind === "into" ? rows.find((row) => row.id === next.target)?.element ?? null : null;
      if (into !== highlighted) {
        highlighted?.removeAttribute("data-drop-target");
        highlighted = into;
        highlighted?.setAttribute("data-drop-target", "true");
      }
      if (!same) layout();
    };

    const follow = () => heldMotion?.follow(x - startX, y - startY + scrolled());

    const clear = () => {
      highlighted?.removeAttribute("data-drop-target");
      highlighted = null;
      for (const row of rows) {
        row.motion?.follow(0, 0);
        row.motion?.stop();
      }
      heldMotion?.follow(0, 0);
      heldMotion?.stop();
      block.removeAttribute("data-tree-held");
      block.style.pointerEvents = "";
    };

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return;
      x = move.clientX;
      y = move.clientY;
      if (!active) {
        if (Math.hypot(x - startX, y - startY) < DEAD_ZONE) return;
        begin();
      }
      follow();
      retarget();
    };

    const finish = async (cancelled: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      if (!active) return;
      active = false;
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      const landing = cancelled ? null : drop;
      if (cancelled) {
        drop = null;
        layout();
      }
      // The held row glides to where it will sit once the order is applied.
      const gap = gapY(landing);
      let offset = 0;
      if (gap !== null) offset = gap - blockTop - (gap >= blockBottom - 0.5 ? blockHeight : 0);
      heldMotion?.lift(false);
      await heldMotion?.settle(0, offset);
      clear();
      if (landing) await Promise.resolve(options.commit(heldId, landing)).catch((error: unknown) => console.error("Move Space failed", error));
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId === event.pointerId) void finish(false);
    };
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === event.pointerId) void finish(true);
    };
    function onKey(key: KeyboardEvent) {
      if (key.key === "Escape") void finish(true);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  return {
    onPointerDown,
    /** True right after a drag ends, so the row's click (select/expand) can be ignored. */
    consumeClick: () => suppressClick,
  };
}
