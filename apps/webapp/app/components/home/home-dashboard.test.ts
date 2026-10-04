import { describe, expect, it } from "vitest";
import { HOME_TILES, orderedTiles, packTiles } from "./home-dashboard";

const ids = (order: string[]) => orderedTiles(order).map((t) => t.id);

describe("orderedTiles", () => {
  it("uses Shelf's order when nothing is saved", () => {
    expect(ids([])).toEqual(HOME_TILES.map((t) => t.id));
  });
  it("puts the saved order first, then anything new, and ignores unknown ids", () => {
    const out = ids(["newest-assets", "summary", "gone-tile"]);
    expect(out.slice(0, 2)).toEqual(["newest-assets", "summary"]);
    expect(out).toHaveLength(HOME_TILES.length);
    expect(out).not.toContain("gone-tile");
  });
});

describe("packTiles", () => {
  const spans = (list: number[]) =>
    packTiles(list.map((span) => ({ span }))).map((c) => c.span);
  it("leaves full rows as they are", () => {
    expect(spans([6])).toEqual([6]);
    expect(spans([4, 2, 2, 2, 2])).toEqual([4, 2, 2, 2, 2]);
  });
  it("fills a short row by sharing out the spare columns from the left", () => {
    expect(spans([2, 3])).toEqual([3, 3]); // what the Home screenshot showed: a gap
    expect(spans([2, 2])).toEqual([3, 3]);
    expect(spans([3, 2, 2])).toEqual([4, 2, 6]); // [3, 2] stretches to [4, 2]; the last tile fills its row
  });
  it("gives a tile on its own the whole row", () => {
    expect(spans([4, 2, 2])).toEqual([4, 2, 6]);
    expect(spans([2])).toEqual([6]);
  });
  it("keeps every row exactly six wide, whichever tiles are hidden", () => {
    for (const mask of Array.from(
      { length: 1 << HOME_TILES.length },
      (_, n) => n
    )) {
      const shown = HOME_TILES.filter((_, i) => mask & (1 << i));
      const placed = packTiles(shown.map((t) => ({ span: t.span })));
      let used = 0;
      for (const cell of placed) {
        used += cell.span;
        expect(used).toBeLessThanOrEqual(6);
        if (used === 6) used = 0;
      }
      expect(used).toBe(0);
    }
  });
  it("keeps the order", () => {
    const tiles = [
      { id: "a", span: 2 },
      { id: "b", span: 3 },
      { id: "c", span: 2 },
    ];
    expect(packTiles(tiles).map((c) => c.tile.id)).toEqual(["a", "b", "c"]);
  });
});
