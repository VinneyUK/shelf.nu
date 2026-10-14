import { describe, expect, it } from "vitest";
import {
  BAMBU_TYPES,
  cleanHex,
  costPerKg,
  gramsLeft,
  materialOf,
  remainingTone,
  summarise,
  valueLeft,
} from "./catalogue";

describe("Bambu product lines", () => {
  it("know their material", () => {
    expect(materialOf("PLA Basic")).toBe("PLA");
    expect(materialOf("pla matte")).toBe("PLA");
    expect(materialOf("PETG HF")).toBe("PETG");
    expect(materialOf("PA6-CF")).toBe("PA");
    expect(materialOf("Support for PLA/PETG")).toBe("Support");
    expect(materialOf("TPU for AMS")).toBe("TPU");
  });
  it("work out an unknown line from its first word", () => {
    expect(materialOf("HIPS Something")).toBe("HIPS");
    expect(materialOf("")).toBe("Other");
  });
  it("list each line once", () => {
    expect(new Set(BAMBU_TYPES.map(([t]) => t)).size).toBe(BAMBU_TYPES.length);
  });
});

describe("colours", () => {
  it("are tidied to #RRGGBB", () => {
    expect(cleanHex("#00ae42")).toBe("#00AE42");
    expect(cleanHex("00AE42FF")).toBe("#00AE42"); // the AMS reports RRGGBBAA
    expect(cleanHex("#fff")).toBe("#FFFFFF");
    expect(cleanHex("green")).toBeNull();
    expect(cleanHex("")).toBeNull();
  });
});

describe("the sums", () => {
  const spool = { weightGrams: 1000, remainingPercent: 40, pricePaid: 19.99 };
  it("grams and value left", () => {
    expect(gramsLeft(spool)).toBe(400);
    expect(valueLeft(spool)).toBe(8);
    expect(valueLeft({ ...spool, pricePaid: null })).toBe(0);
    expect(gramsLeft({ ...spool, remainingPercent: 140 })).toBe(1000);
  });
  it("cost per kilogram, whatever the spool size", () => {
    expect(costPerKg(spool)).toBe(19.99);
    expect(costPerKg({ weightGrams: 500, pricePaid: 12.5 })).toBe(25);
    expect(costPerKg({ weightGrams: 1000, pricePaid: null })).toBeNull();
  });
  it("the tone of the remaining bar", () => {
    expect(remainingTone(0)).toBe("empty");
    expect(remainingTone(10)).toBe("low");
    expect(remainingTone(50)).toBe("ok");
    expect(remainingTone(90)).toBe("full");
  });
  it("the page's figures count only spools on hand, and spending counts everything", () => {
    const s = summarise([
      {
        weightGrams: 1000,
        remainingPercent: 50,
        pricePaid: 20,
        status: "active",
      },
      {
        weightGrams: 1000,
        remainingPercent: 100,
        pricePaid: 18,
        status: "active",
      },
      {
        weightGrams: 1000,
        remainingPercent: 0,
        pricePaid: 22,
        status: "retired",
      },
    ]);
    expect(s).toEqual({ spools: 2, gramsLeft: 1500, valueLeft: 28, spent: 60 });
  });
});
