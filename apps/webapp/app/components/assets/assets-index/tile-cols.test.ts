/**
 * Tiles per row in the assets Tile view (fork).
 */
import { describe, expect, it } from "vitest";
import { parseTileCols, tileGridTemplate } from "./tile-cols";

describe("tiles per row", () => {
  it("takes Auto or 3 to 8, and anything else as Auto", () => {
    expect(parseTileCols("5")).toBe("5");
    expect(parseTileCols("auto")).toBe("auto");
    expect(parseTileCols("2")).toBe("auto");
    expect(parseTileCols("9")).toBe("auto");
    expect(parseTileCols(null)).toBe("auto");
  });

  it("fits 250 px tiles on Auto, else a fixed number across", () => {
    expect(tileGridTemplate("auto")).toBe(
      "repeat(auto-fill, minmax(min(250px, 100%), 1fr))"
    );
    expect(tileGridTemplate("6")).toBe("repeat(6, minmax(0, 1fr))");
  });
});
