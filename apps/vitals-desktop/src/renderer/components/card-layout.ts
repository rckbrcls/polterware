import { CARD_IDS, type CardId } from "./card-order";

/** Minimum cell width; the column count is however many of these fit the container. */
export const CELL_MIN_W = 260;
/** One row is one small card; every card is a whole number of rows, so cards stack in step. */
export const ROW_H = 192;
export const GAP = 12;

const STORAGE_KEY = "vitals.cardOrder";
/** Anchor cells are in row units, so the key changes with ROW_H. */
const ANCHORS_KEY = "vitals.cardAnchors.v3";
const HIDDEN_KEY = "vitals.cardHidden";

export type Cell = { x: number; y: number };
export type Rect = Cell & { w: number; h: number };
/** Cells a card was dropped on directly; anchored cards keep that spot instead of flowing. */
export type Anchors = Partial<Record<CardId, Cell>>;

/** Card sizes in cells; width is clamped to the column count at render time. */
const SIZES: Record<CardId, { w: number; h: number }> = {
  cpu: { w: 1, h: 2 },
  memory: { w: 1, h: 1 },
  network: { w: 1, h: 2 },
  diskio: { w: 2, h: 1 },
  pressure: { w: 1, h: 1 },
  disk: { w: 2, h: 1 },
  thermal: { w: 1, h: 1 },
  processes: { w: 2, h: 2 },
};

export function colsFor(contentWidth: number): number {
  return Math.max(1, Math.floor((contentWidth + GAP) / (CELL_MIN_W + GAP)));
}

export function sizeOf(id: CardId, cols: number): { w: number; h: number } {
  const size = SIZES[id];
  return { w: Math.min(size.w, cols), h: size.h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Packs cards in sequence order: anchored cards take their cell first (clamped to the column
 * count, and only while it is still free), then every other card takes the first free spot
 * scanning left to right, then top to bottom, like icons on a home screen.
 */
export function packOrder(ids: readonly CardId[], cols: number, anchors: Anchors = {}): Map<CardId, Rect> {
  const placed: Rect[] = [];
  const out = new Map<CardId, Rect>();
  const flowing: CardId[] = [];
  for (const id of ids) {
    const anchor = anchors[id];
    if (!anchor) {
      flowing.push(id);
      continue;
    }
    const { w, h } = sizeOf(id, cols);
    const rect = { x: Math.max(0, Math.min(anchor.x, cols - w)), y: Math.max(0, anchor.y), w, h };
    if (placed.some((other) => overlaps(other, rect))) {
      flowing.push(id);
      continue;
    }
    placed.push(rect);
    out.set(id, rect);
  }
  for (const id of flowing) {
    const { w, h } = sizeOf(id, cols);
    let rect: Rect | undefined;
    for (let y = 0; !rect; y++) {
      for (let x = 0; x + w <= cols; x++) {
        const candidate = { x, y, w, h };
        if (!placed.some((other) => overlaps(other, candidate))) {
          rect = candidate;
          break;
        }
      }
    }
    placed.push(rect);
    out.set(id, rect);
  }
  return out;
}

/** Empty cells that have a card somewhere below them in the same column: the holes a layout shows. */
function holesIn(placed: readonly Rect[], cols: number): number {
  let holes = 0;
  for (let x = 0; x < cols; x++) {
    const filled = placed.filter((rect) => x >= rect.x && x < rect.x + rect.w);
    const bottom = Math.max(0, ...filled.map((rect) => rect.y + rect.h));
    const covered = filled.reduce((sum, rect) => sum + rect.h, 0);
    holes += bottom - covered;
  }
  return holes;
}

/**
 * The flow order that packs `ids` best on `cols` columns: the lowest grid, then the fewest holes.
 * Orders are tried closest to `ids` first and only a strictly better one replaces the best, so a
 * tie keeps the given order. Packing is incremental, so a branch already taller than the best is cut.
 */
export function autoArrange(ids: readonly CardId[], cols: number): CardId[] {
  const area = ids.reduce((sum, id) => {
    const { w, h } = sizeOf(id, cols);
    return sum + w * h;
  }, 0);
  const floor = Math.ceil(area / cols);
  let best = null as { order: CardId[]; bottom: number; holes: number } | null;
  const used = new Array<boolean>(ids.length).fill(false);
  const order: CardId[] = [];
  const placed: Rect[] = [];
  const firstFree = (w: number, h: number): Rect => {
    for (let y = 0; ; y++) {
      for (let x = 0; x + w <= cols; x++) {
        const candidate = { x, y, w, h };
        if (!placed.some((other) => overlaps(other, candidate))) return candidate;
      }
    }
  };
  const visit = (bottom: number): boolean => {
    if (best && bottom > best.bottom) return false;
    if (order.length === ids.length) {
      const holes = holesIn(placed, cols);
      if (!best || bottom < best.bottom || holes < best.holes) best = { order: [...order], bottom, holes };
      // Nothing beats the area floor with no holes.
      return best.bottom === floor && best.holes === 0;
    }
    // Cards of the same size lay out the same, so only the first unused one of each size is tried.
    const tried = new Set<string>();
    for (let index = 0; index < ids.length; index++) {
      if (used[index]) continue;
      const id = ids[index];
      const { w, h } = sizeOf(id, cols);
      if (tried.has(`${w}x${h}`)) continue;
      tried.add(`${w}x${h}`);
      const rect = firstFree(w, h);
      used[index] = true;
      order.push(id);
      placed.push(rect);
      const done = visit(Math.max(bottom, rect.y + rect.h));
      placed.pop();
      order.pop();
      used[index] = false;
      if (done) return true;
    }
    return false;
  };
  visit(0);
  return best ? best.order : [...ids];
}

/**
 * Where `id` would sit if dropped with its top-left on `cell`: the cell clamped so the card fits
 * the columns, or null when another card already covers any part of that spot.
 */
export function freeSpot(rects: ReadonlyMap<CardId, Rect>, id: CardId, cols: number, cell: Cell): Cell | null {
  const { w, h } = sizeOf(id, cols);
  const rect = { x: Math.max(0, Math.min(cell.x, cols - w)), y: Math.max(0, cell.y), w, h };
  for (const [other, placed] of rects) {
    if (other !== id && overlaps(placed, rect)) return null;
  }
  return { x: rect.x, y: rect.y };
}

/**
 * Free cells of the grid while `id` is held, down to the bottom of the other cards plus the held
 * card's height, so there is always room to drop it below everything and grow the grid. A cell is
 * one small card, so each free cell is a whole drop spot. The held card's own cells count as free:
 * it can be dropped back there.
 */
export function freeCells(rects: ReadonlyMap<CardId, Rect>, id: CardId, cols: number): Cell[] {
  let bottom = 0;
  for (const [other, rect] of rects) if (other !== id) bottom = Math.max(bottom, rect.y + rect.h);
  bottom += sizeOf(id, cols).h;
  const cells: Cell[] = [];
  for (let y = 0; y < bottom; y++) {
    for (let x = 0; x < cols; x++) {
      const owner = cellAt(rects, { x, y });
      if (owner === null || owner === id) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Puts `id` with its top-left on `cell` and pushes every card it would cover straight down,
 * cascading, so a drop above or below a card of any size makes room by growing the grid downward.
 * Returns anchors pinning every card in `rects` where it now sits; `anchors` of cards that are not
 * in `rects` (hidden ones) are kept.
 */
export function placeWithPush(
  rects: ReadonlyMap<CardId, Rect>,
  id: CardId,
  cols: number,
  cell: Cell,
  anchors: Anchors = {},
): Anchors {
  const { w, h } = sizeOf(id, cols);
  const held: Rect = { x: Math.max(0, Math.min(cell.x, cols - w)), y: Math.max(0, cell.y), w, h };
  const others = [...rects]
    .filter(([other]) => other !== id)
    .map(([other, rect]): [CardId, Rect] => [other, { ...rect }])
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  const placed: Rect[] = [held];
  const next: Anchors = { ...anchors, [id]: { x: held.x, y: held.y } };
  for (const [other, rect] of others) {
    for (let moved = true; moved; ) {
      moved = false;
      for (const fixed of placed) {
        if (!overlaps(fixed, rect)) continue;
        rect.y = fixed.y + fixed.h;
        moved = true;
      }
    }
    placed.push(rect);
    next[other] = { x: rect.x, y: rect.y };
  }
  return next;
}

/** Card whose cells include `cell`, if any. */
export function cellAt(rects: ReadonlyMap<CardId, Rect>, cell: Cell): CardId | null {
  for (const [id, rect] of rects) {
    if (cell.x >= rect.x && cell.x < rect.x + rect.w && cell.y >= rect.y && cell.y < rect.y + rect.h) return id;
  }
  return null;
}

/** Pixel box of a rect inside the grid's content box. */
export function rectBox(rect: Rect, cellW: number): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * (cellW + GAP),
    top: rect.y * (ROW_H + GAP),
    width: rect.w * cellW + (rect.w - 1) * GAP,
    height: rect.h * ROW_H + (rect.h - 1) * GAP,
  };
}

/** Screen geometry of the grid's content box, used to turn a pointer position into a cell. */
export function gridMetrics(grid: HTMLElement, cols: number): { left: number; top: number; cellW: number } {
  const rect = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const content = rect.width - padL - padR;
  return { left: rect.left + padL, top: rect.top + padT, cellW: (content - GAP * (cols - 1)) / cols };
}

export type DropSide = "top" | "bottom" | "left" | "right";

/** Which side of `box` the point falls on: the axis where it sits furthest from the center wins. */
export function dropSide(box: { left: number; top: number; width: number; height: number }, px: number, py: number): DropSide {
  const u = (px - (box.left + box.width / 2)) / (box.width / 2 || 1);
  const v = (py - (box.top + box.height / 2)) / (box.height / 2 || 1);
  if (Math.abs(u) > Math.abs(v)) return u < 0 ? "left" : "right";
  return v < 0 ? "top" : "bottom";
}

/** Keeps known ids in saved order and appends any card the saved list does not know yet. */
export function normalizeOrder(saved: unknown): CardId[] {
  const known = new Set<string>(CARD_IDS);
  const seen = new Set<string>();
  const order: CardId[] = [];
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (typeof id === "string" && known.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id as CardId);
      }
    }
  }
  for (const id of CARD_IDS) if (!seen.has(id)) order.push(id);
  return order;
}

export function loadOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeOrder(null);
  }
}

export function saveOrder(order: readonly CardId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Persistence is a convenience; the order still works for this session.
  }
}

/** Keeps anchors of known cards whose cell is a pair of non-negative integers. */
export function normalizeAnchors(saved: unknown): Anchors {
  const anchors: Anchors = {};
  if (!saved || typeof saved !== "object") return anchors;
  const known = new Set<string>(CARD_IDS);
  for (const [id, cell] of Object.entries(saved as Record<string, unknown>)) {
    if (!known.has(id) || !cell || typeof cell !== "object") continue;
    const { x, y } = cell as Record<string, unknown>;
    if (Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (y as number) >= 0) {
      anchors[id as CardId] = { x: x as number, y: y as number };
    }
  }
  return anchors;
}

export function loadAnchors(): Anchors {
  try {
    const raw = localStorage.getItem(ANCHORS_KEY);
    return normalizeAnchors(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export function saveAnchors(anchors: Anchors): void {
  try {
    localStorage.setItem(ANCHORS_KEY, JSON.stringify(anchors));
  } catch {
    // Persistence is a convenience; the layout still works for this session.
  }
}

/** Keeps known card ids, once each. */
export function normalizeHidden(saved: unknown): CardId[] {
  if (!Array.isArray(saved)) return [];
  return CARD_IDS.filter((id) => saved.includes(id));
}

export function loadHidden(): CardId[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return normalizeHidden(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

export function saveHidden(hidden: readonly CardId[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  } catch {
    // Persistence is a convenience; the choice still holds for this session.
  }
}
