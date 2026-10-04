import { describe, expect, it } from "vitest";
import { HOME_TILES, orderedTiles } from "./home-dashboard";

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
