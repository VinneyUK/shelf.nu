/**
 * Sizing text in the label font. Part of the labels feature; not in upstream Shelf.
 */
import { describe, expect, it } from "vitest";
import { fitSize, fitText, textWidth, wrapToFit } from "./font-metrics";

describe("textWidth", () => {
  it("adds up Poppins Bold's advance widths", () => {
    // 1 (376) 0 (652) at 1000 units to the em, at 10 dots
    expect(textWidth("10", 10)).toBeCloseTo(10.28);
    expect(textWidth("", 20)).toBe(0);
  });

  it("scales with the size", () => {
    expect(textWidth("Jade White", 30)).toBeCloseTo(
      textWidth("Jade White", 15) * 2
    );
  });

  it("measures accented letters and treats unknown ones as wide", () => {
    expect(textWidth("é", 10)).toBeGreaterThan(0);
    expect(textWidth("漢", 10)).toBe(7);
  });
});

describe("fitSize", () => {
  it("uses the largest size that fits", () => {
    const size = fitSize("Charcoal", 120, 25, 13);
    expect(textWidth("Charcoal", size)).toBeLessThanOrEqual(120);
    expect(size === 25 || textWidth("Charcoal", size + 1) > 120).toBe(true);
  });

  it("stops at the smallest size", () => {
    expect(fitSize("A very long colour name indeed", 50, 25, 13)).toBe(13);
  });
});

describe("fitText", () => {
  it("leaves text that fits alone", () => {
    expect(fitText("PLA Basic", 200, 15)).toBe("PLA Basic");
  });

  it("cuts text short with an ellipsis to fit", () => {
    const cut = fitText("PLA Silk Multi-Color", 100, 15);
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, 15)).toBeLessThanOrEqual(100);
  });
});

describe("wrapToFit", () => {
  it("keeps one line when it fits", () => {
    expect(wrapToFit("Black", 60, 17, 11, 2)).toEqual({
      lines: ["Black"],
      size: 17,
    });
  });

  it("wraps onto two lines before shrinking further", () => {
    const { lines, size } = wrapToFit("Dawn Radiance", 62, 17, 11, 2);
    expect(lines).toEqual(["Dawn", "Radiance"]);
    for (const l of lines) expect(textWidth(l, size)).toBeLessThanOrEqual(62);
  });

  it("cuts the last line short when even the smallest size won't do", () => {
    const { lines, size } = wrapToFit(
      "Extraordinarily Unbelievably Long Colour",
      40,
      17,
      11,
      2
    );
    expect(size).toBe(11);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    for (const l of lines) expect(textWidth(l, size)).toBeLessThanOrEqual(40);
  });
});
