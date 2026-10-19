import { describe, expect, it } from "vitest";
import { CARD_IDS, type CardId } from "./card-order";
import { autoArrange, dropSide, freeCells, freeSpot, normalizeAnchors, normalizeHidden, packOrder, placeWithPush } from "./card-layout";

describe("dropSide", () => {
  const box = { left: 0, top: 0, width: 200, height: 100 };

  it("picks the side the point is furthest toward", () => {
    expect(dropSide(box, 100, 10)).toBe("top");
    expect(dropSide(box, 100, 90)).toBe("bottom");
    expect(dropSide(box, 10, 50)).toBe("left");
    expect(dropSide(box, 190, 50)).toBe("right");
  });

  it("normalizes by the box size so wide cards still have top and bottom halves", () => {
    expect(dropSide(box, 40, 5)).toBe("top");
    expect(dropSide(box, 160, 95)).toBe("bottom");
  });
});

describe("placeWithPush", () => {
  const rects = new Map<CardId, { x: number; y: number; w: number; h: number }>([
    ["cpu", { x: 0, y: 0, w: 1, h: 2 }],
    ["memory", { x: 1, y: 0, w: 1, h: 1 }],
    ["diskio", { x: 1, y: 1, w: 2, h: 1 }],
    ["thermal", { x: 1, y: 2, w: 1, h: 1 }],
  ]);

  it("moves a wide card one cell left, pushing what it covers down in a cascade", () => {
    expect(placeWithPush(rects, "diskio", 3, { x: 0, y: 1 })).toEqual({
      diskio: { x: 0, y: 1 },
      cpu: { x: 0, y: 2 },
      memory: { x: 1, y: 0 },
      thermal: { x: 1, y: 2 },
    });
  });

  it("pushes the target down when a card takes its spot from above", () => {
    expect(placeWithPush(rects, "thermal", 3, { x: 1, y: 0 })).toEqual({
      thermal: { x: 1, y: 0 },
      cpu: { x: 0, y: 0 },
      memory: { x: 1, y: 1 },
      diskio: { x: 1, y: 2 },
    });
  });

  it("clamps the spot to the columns and keeps anchors of hidden cards", () => {
    const next = placeWithPush(rects, "diskio", 3, { x: 2, y: 3 }, { network: { x: 0, y: 9 } });
    expect(next.diskio).toEqual({ x: 1, y: 3 });
    expect(next.network).toEqual({ x: 0, y: 9 });
  });
});

describe("packOrder with anchors", () => {
  it("keeps an anchored card on its cell and flows the rest around it", () => {
    const rects = packOrder(["memory", "pressure", "thermal"], 3, { pressure: { x: 2, y: 3 } });
    expect(rects.get("pressure")).toEqual({ x: 2, y: 3, w: 1, h: 1 });
    expect(rects.get("memory")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(rects.get("thermal")).toEqual({ x: 1, y: 0, w: 1, h: 1 });
  });

  it("clamps an anchor to the column count", () => {
    const rects = packOrder(["disk"], 2, { disk: { x: 1, y: 0 } });
    expect(rects.get("disk")).toEqual({ x: 0, y: 0, w: 2, h: 1 });
  });

  it("flows an anchored card whose cell is already taken", () => {
    const rects = packOrder(["memory", "pressure"], 2, { memory: { x: 0, y: 0 }, pressure: { x: 0, y: 0 } });
    expect(rects.get("pressure")).toEqual({ x: 1, y: 0, w: 1, h: 1 });
  });
});

describe("freeSpot", () => {
  const rects = packOrder(["memory", "pressure"], 3);

  it("accepts a free cell and ignores the card being moved", () => {
    expect(freeSpot(rects, "pressure", 3, { x: 2, y: 0 })).toEqual({ x: 2, y: 0 });
    expect(freeSpot(rects, "pressure", 3, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });

  it("rejects a cell another card covers", () => {
    expect(freeSpot(rects, "pressure", 3, { x: 0, y: 0 })).toBeNull();
  });
});

describe("freeCells", () => {
  it("lists empty cells down past the other cards by the held card's height, counting its own cells as free", () => {
    const rects = new Map<CardId, { x: number; y: number; w: number; h: number }>([
      ["cpu", { x: 0, y: 0, w: 1, h: 2 }],
      ["memory", { x: 1, y: 0, w: 1, h: 1 }],
      ["pressure", { x: 2, y: 0, w: 1, h: 1 }],
    ]);
    expect(freeCells(rects, "pressure", 3)).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });
});

describe("autoArrange", () => {
  /** Grid height and empty cells that have a card below them in the same column. */
  const shape = (order: CardId[], cols: number) => {
    const rects = [...packOrder(order, cols).values()];
    let holes = 0;
    for (let x = 0; x < cols; x++) {
      const column = rects.filter((rect) => x >= rect.x && x < rect.x + rect.w);
      const bottom = Math.max(0, ...column.map((rect) => rect.y + rect.h));
      holes += bottom - column.reduce((sum, rect) => sum + rect.h, 0);
    }
    return { bottom: Math.max(...rects.map((rect) => rect.y + rect.h)), holes };
  };

  it("packs every card into the fewest rows with no holes", () => {
    expect(shape(autoArrange([...CARD_IDS], 2), 2)).toEqual({ bottom: 8, holes: 0 });
    expect(shape(autoArrange([...CARD_IDS], 3), 3)).toEqual({ bottom: 5, holes: 0 });
  });

  it("keeps every card exactly once", () => {
    expect([...autoArrange([...CARD_IDS], 3)].sort()).toEqual([...CARD_IDS].sort());
  });

  it("keeps the given order when nothing packs better", () => {
    expect(autoArrange(["memory", "pressure", "thermal"], 3)).toEqual(["memory", "pressure", "thermal"]);
  });
});

describe("normalizeHidden", () => {
  it("keeps known cards once, in card order", () => {
    expect(normalizeHidden(["thermal", "nope", "cpu", "cpu", 3])).toEqual(["cpu", "thermal"]);
    expect(normalizeHidden("cpu")).toEqual([]);
  });
});

describe("normalizeAnchors", () => {
  it("drops unknown cards and malformed cells", () => {
    expect(normalizeAnchors({ pressure: { x: 2, y: 3 }, nope: { x: 0, y: 0 }, cpu: { x: -1, y: 0 }, disk: "x" })).toEqual({
      pressure: { x: 2, y: 3 },
    });
  });
});
