import { describe, expect, it } from "vitest";
import { distinctColor, hexToHue, mostDistinctHue } from "./distinct-color";

describe("distinct colours", () => {
  it("reads hues back from hex", () => {
    expect(hexToHue("#ff0000")).toBe(0);
    expect(hexToHue("#00ff00")).toBe(120);
    expect(hexToHue("#0000ff")).toBe(240);
    expect(hexToHue("#808080")).toBeNull();
    expect(hexToHue("nonsense")).toBeNull();
  });
  it("picks the middle of the biggest gap", () => {
    const h = mostDistinctHue([0, 120, 240]); // every gap is equal: any midpoint will do
    expect([60, 180, 300]).toContain(h);
    expect(mostDistinctHue([0])).toBe(180);
    expect(mostDistinctHue([350, 10])).toBe(180); // the gap wraps around 0
    expect(mostDistinctHue([])).toBe(24);
  });
  it("keeps adding colours that stay apart", () => {
    const used: string[] = [];
    for (let i = 0; i < 8; i++) used.push(distinctColor(used));
    const hues = used.map((h) => hexToHue(h)!).sort((a, b) => a - b);
    for (let i = 1; i < hues.length; i++)
      expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(40);
  });
});
