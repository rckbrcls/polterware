import { createDragMotion, type DragMotion } from "@polterware/frontend-design-system";
import { batch, createSignal, type JSX } from "solid-js";

/** Pointer travel before a press on a row becomes a drag. */
const DEAD_ZONE = 4;
const LIFT_SCALE = 1.03;
/** Over a Space long enough, the held card shrinks as if it were being put away. */
const SHRINK_SCALE = 0.55;
const SHRINK_MS = 220;
/** How long the pointer must rest over a card side before the order reflows (home-screen feel). */
const DWELL_MS = 120;
const EDGE = 48;
const EDGE_STEP = 14;

type Side = "before" | "after";

/** A Space shown as a card beside the notes of a Space page; the page supplies its look. */
export type FolderItem = { id: string; sortOrder: number; render: (state: { dropTarget: boolean; noteCount: number }) => JSX.Element };

function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return document.documentElement;
}

/** Which half of a card the pointer is on, along the axis it is furthest from the center. */
function dropSide(box: DOMRect, x: number, y: number): Side {
  const u = (x - (box.left + box.width / 2)) / (box.width / 2 || 1);
  const v = (y - (box.top + box.height / 2)) / (box.height / 2 || 1);
  return (Math.abs(u) >= Math.abs(v) ? u : v) < 0 ? "before" : "after";
}

type Entry = { element: HTMLElement; motion: DragMotion; floatMotion?: DragMotion };

/**
 * Drag-to-reorder for a wrapped list of rows (grid or column), in the style of the Vitals cards:
 * the held row follows the pointer, the others glide (FLIP) into their new place as it passes over
 * them, and the final order is committed on release. Escape or a cancelled pointer restores it.
 */
export function createCardReorder(options: {
  order: () => string[];
  commit: (orderedIds: string[]) => Promise<void> | void;
  /** Keys that accept a drop *into* them (the middle of the card), e.g. Space cards. */
  canDropInto?: (held: string, target: string) => boolean;
  dropInto?: (held: string, target: string) => Promise<void> | void;
}) {
  const entries = new Map<string, Entry>();
  const [override, setOverride] = createSignal<string[] | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  /** The card raised above the others: held, or still gliding home after release. */
  /** The card the held one would drop into on release. */
  const [intoId, setIntoId] = createSignal<string | null>(null);
  const [liftedId, setLiftedId] = createSignal<string | null>(null);
  /** A drag must not also count as a click on the row's button. */
  let suppressClick = false;

  const current = () => override() ?? options.order();

  const register = (id: string, element: HTMLElement) => {
    const entry: Entry = { element, motion: createDragMotion(element, { liftScale: LIFT_SCALE }) };
    entries.set(id, entry);
    return () => {
      entry.motion.stop();
      entry.floatMotion?.stop();
      if (entries.get(id) === entry) entries.delete(id);
    };
  };

  const floatingIds = new Set<string>();

  const apply = (next: string[], held: string): { dx: number; dy: number } => {
    const before = new Map<string, DOMRect>();
    for (const [id, entry] of entries) before.set(id, entry.element.getBoundingClientRect());
    batch(() => setOverride(next));
    let shift = { dx: 0, dy: 0 };
    for (const [id, entry] of entries) {
      const from = before.get(id);
      if (!from) continue;
      const to = entry.element.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (id === held) {
        // A floating card is pinned to the viewport, so a moving cell does not shift it.
        shift = floatingIds.has(id) ? { dx: 0, dy: 0 } : { dx, dy };
        continue;
      }
      if (dx === 0 && dy === 0) continue;
      entry.motion.follow(dx, dy);
      void entry.motion.settle();
    }
    return shift;
  };

  const onPointerDown = (id: string, event: PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, a, label, [data-no-drag]")) return;
    const entry = entries.get(id);
    if (!entry) return;
    const row = event.currentTarget as HTMLElement;
    const scroller = scrollParent(entry.element);
    const startOrder = [...options.order()];
    const startX = event.clientX;
    const startY = event.clientY;
    const startScroll = scroller.scrollTop;
    let x = startX;
    let y = startY;
    let shiftX = 0;
    let shiftY = 0;
    let active = false;
    let edgeFrame = 0;
    /** An edge scrolls only once the pointer has been out of its zone, so grabbing near it stays put. */
    let armedTop = false;
    let armedBottom = false;
    let dwellTimer = 0;
    let pending: string | null = null;
    /** The card side just dropped on is ignored until the pointer leaves that card, so cards never flip-flop. */
    let blocked: { card: string; key: string } | null = null;

    /** While floating, the card's own box sits in the top layer and moves; the cell stays in the grid. */
    let floating: { child: HTMLElement; motion: DragMotion; box: DOMRect } | null = null;
    const mover = () => floating?.motion ?? entry.motion;
    const floatUp = () => {
      const child = entry.element.firstElementChild;
      if (!(child instanceof HTMLElement) || typeof child.showPopover !== "function") return;
      const box = child.getBoundingClientRect();
      child.setAttribute("popover", "manual");
      child.style.left = `${box.left}px`;
      child.style.top = `${box.top}px`;
      child.style.width = `${box.width}px`;
      child.style.height = `${box.height}px`;
      child.showPopover();
      entry.floatMotion ??= createDragMotion(child, { liftScale: LIFT_SCALE });
      floating = { child, motion: entry.floatMotion, box };
      floatingIds.add(id);
    };
    const landDown = () => {
      if (!floating) return;
      const { child, motion } = floating;
      floating = null;
      floatingIds.delete(id);
      if (child.matches(":popover-open")) child.hidePopover();
      child.removeAttribute("popover");
      child.style.left = child.style.top = child.style.width = child.style.height = "";
      motion.follow(0, 0);
    };
    /** Where the cell is now, relative to where the floating card is drawn. */
    const homeOffset = () => {
      if (!floating) return { x: 0, y: 0 };
      const cell = entry.element.getBoundingClientRect();
      return { x: cell.left - floating.box.left, y: cell.top - floating.box.top };
    };
    const glideHome = () => {
      const home = homeOffset();
      void mover().settle(home.x, home.y).then(() => {
        if (draggingId() === id) return;
        landDown();
        if (liftedId() === id) setLiftedId(null);
      });
    };

    const follow = () => {
      const scrolled = floating ? 0 : scroller.scrollTop - startScroll;
      mover().follow(x - startX + shiftX, y - startY + shiftY + scrolled);
    };

    const probe = (): { card: string; side: Side; box: DOMRect } | null => {
      for (const [other, otherEntry] of entries) {
        if (other === id) continue;
        const box = otherEntry.element.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
        return { card: other, side: dropSide(box, x, y), box };
      }
      return null;
    };

    const commitTarget = (target: { card: string; side: Side }) => {
      dwellTimer = 0;
      pending = null;
      blocked = { card: target.card, key: `${target.card}:${target.side}` };
      const rest = current().filter((value) => value !== id);
      const at = rest.indexOf(target.card);
      if (at < 0) return;
      rest.splice(target.side === "after" ? at + 1 : at, 0, id);
      if (rest.every((value, index) => value === current()[index])) return;
      const shift = apply(rest, id);
      shiftX += shift.dx;
      shiftY += shift.dy;
      follow();
    };

    let latest: { card: string; side: Side } | null = null;
    /** A Space outside the grid (breadcrumb, sidebar) under the pointer: a drop there moves the item into it. */
    let outsideEl: HTMLElement | null = null;
    const outsideSpace = (): HTMLElement | null => {
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-space-id]") ?? null;
      if (!hit || [...entries.values()].some((other) => other.element.contains(hit))) return null;
      return hit;
    };
    const markOutside = () => {
      const next = outsideSpace();
      if (next === outsideEl) return;
      outsideEl?.removeAttribute("data-drop-target");
      outsideEl = next;
      outsideEl?.setAttribute("data-drop-target", "true");
    };

    let shrinkTimer = 0;
    let shrunk = false;
    const setShrunk = (want: boolean) => {
      if (want === shrunk) return;
      shrunk = want;
      mover().lift(true, want ? SHRINK_SCALE : undefined);
      if (!want) {
        mover().release();
        return;
      }
      // Glide the card to the middle of the Space it is being put into.
      const target = intoId() ? entries.get(intoId()!)?.element : outsideEl;
      pulledTo = target ?? null;
      if (!floating || !target) return;
      const box = target.getBoundingClientRect();
      const from = floating.box;
      mover().pull(
        box.left + box.width / 2 - (from.left + from.width / 2),
        box.top + box.height / 2 - (from.top + from.height / 2),
      );
    };
    let pulledTo: HTMLElement | null = null;
    const armShrink = (hovering: boolean) => {
      if (hovering && shrunk) {
        const now = intoId() ? entries.get(intoId()!)?.element ?? null : outsideEl;
        if (now !== pulledTo) {
          shrunk = false;
          setShrunk(true);
        }
      }
      if (!hovering) {
        window.clearTimeout(shrinkTimer);
        shrinkTimer = 0;
        setShrunk(false);
        return;
      }
      if (shrinkTimer || shrunk) return;
      shrinkTimer = window.setTimeout(() => {
        shrinkTimer = 0;
        if (active) setShrunk(true);
      }, SHRINK_MS);
    };

    const retarget = () => {
      markOutside();
      const over = probe();
      // The middle of a Space card means "put it inside"; its edges reorder.
      const inside = over && options.canDropInto?.(id, over.card)
        && Math.abs(x - (over.box.left + over.box.width / 2)) < over.box.width * 0.25
        && Math.abs(y - (over.box.top + over.box.height / 2)) < over.box.height * 0.25;
      setIntoId(inside ? over!.card : null);
      armShrink(Boolean(inside || outsideEl));
      if (inside) {
        window.clearTimeout(dwellTimer);
        dwellTimer = 0;
        pending = null;
        latest = null;
        return;
      }
      if (blocked && over?.card !== blocked.card) blocked = null;
      const next = over && `${over.card}:${over.side}` === blocked?.key ? null : over;
      latest = next;
      // The dwell is per card: drifting across its center must not restart the timer.
      const key = next?.card ?? null;
      if (key === pending) return;
      window.clearTimeout(dwellTimer);
      dwellTimer = 0;
      pending = key;
      if (!next) return;
      dwellTimer = window.setTimeout(() => {
        if (active && latest) commitTarget(latest);
      }, DWELL_MS);
    };

    const pump = () => {
      edgeFrame = 0;
      if (!active) return;
      const box = scroller.getBoundingClientRect();
      if (y >= box.top + EDGE) armedTop = true;
      if (y <= box.bottom - EDGE) armedBottom = true;
      const direction = armedTop && y < box.top + EDGE ? -1 : armedBottom && y > box.bottom - EDGE ? 1 : 0;
      if (direction === 0) return;
      scroller.scrollTop += direction * EDGE_STEP;
      follow();
      retarget();
      edgeFrame = requestAnimationFrame(pump);
    };

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return;
      x = move.clientX;
      y = move.clientY;
      if (!active) {
        if (Math.hypot(x - startX, y - startY) < DEAD_ZONE) return;
        active = true;
        setDraggingId(id);
        setLiftedId(id);
        floatUp();
        (floating?.child ?? entry.element).style.pointerEvents = "none";
        mover().lift(true);
        window.addEventListener("keydown", onKey);
      }
      follow();
      retarget();
      if (!edgeFrame) edgeFrame = requestAnimationFrame(pump);
    };

    const finish = (cancelled: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(edgeFrame);
      edgeFrame = 0;
      window.clearTimeout(dwellTimer);
      dwellTimer = 0;
      try { if (row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      if (!active) return;
      active = false;
      window.clearTimeout(shrinkTimer);
      shrinkTimer = 0;
      shrunk = false;
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      // Released in the middle of a Space card, or over a Space elsewhere (the sidebar tree).
      let into = cancelled ? null : intoId();
      if (!cancelled && !into) {
        const spaceId = outsideSpace()?.getAttribute("data-space-id");
        if (spaceId) into = `space:${spaceId}`;
      }
      // Only now: while the card is click-through, the hit test sees what is under it.
      (floating?.child ?? entry.element).style.pointerEvents = "";
      outsideEl?.removeAttribute("data-drop-target");
      outsideEl = null;
      setIntoId(null);
      if (into && options.dropInto) {
        const target = into;
        const shift = apply(startOrder, id);
        shiftX += shift.dx;
        shiftY += shift.dy;
        setDraggingId(null);
        mover().lift(false);
        glideHome();
        setOverride(null);
        void Promise.resolve().then(() => options.dropInto!(id, target)).catch((error: unknown) => console.error("Drop into Space failed", error));
        return;
      }
      const next = cancelled ? startOrder : current();
      if (cancelled) {
        const shift = apply(startOrder, id);
        shiftX += shift.dx;
        shiftY += shift.dy;
        follow();
      }
      setDraggingId(null);
      mover().lift(false);
      glideHome();
      const changed = next.some((value, index) => value !== startOrder[index]);
      if (!changed) {
        setOverride(null);
        return;
      }
      void Promise.resolve()
        .then(() => options.commit(next))
        .catch(() => undefined)
        .finally(() => setOverride(null));
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId === event.pointerId) finish(false);
    };
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === event.pointerId) finish(true);
    };
    function onKey(key: KeyboardEvent) {
      if (key.key === "Escape") finish(true);
    }

    // No pointer capture: it would retarget the click onto this row and swallow the card's own click.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  return {
    register,
    onPointerDown,
    draggingId,
    liftedId,
    intoId,
    order: current,
    /** True right after a drag ends, so the row's click handler can ignore it. */
    consumeClick: () => {
      const value = suppressClick;
      suppressClick = false;
      return value;
    },
  };
}
