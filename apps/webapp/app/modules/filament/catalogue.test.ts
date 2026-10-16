import { describe, expect, it } from "vitest";
import { BAMBU_CATALOGUE } from "./bambu-catalogue";
import {
  BAMBU_TYPES,
  catalogueEntry,
  cleanHex,
  coloursFor,
  costPerKg,
  filamentKey,
  filamentSlug,
  gramsLeft,
  groupSpools,
  materialOf,
  remainingTone,
  stocktakeOrder,
  summarise,
  valueLeft,
  weighedPercent,
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

describe("the Bambu catalogue", () => {
  it("has every line once, each colour with a hex code", () => {
    expect(new Set(BAMBU_CATALOGUE.map((e) => e.type)).size).toBe(
      BAMBU_CATALOGUE.length
    );
    for (const e of BAMBU_CATALOGUE)
      for (const [, hex] of e.colours) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(
      BAMBU_CATALOGUE.reduce((n, e) => n + e.colours.length, 0)
    ).toBeGreaterThan(250);
  });
  it("gives a line's colours and its empty-spool weight", () => {
    expect(coloursFor("PLA Basic").some(([n]) => n === "Jade White")).toBe(
      true
    );
    expect(catalogueEntry("pla matte")?.spoolWeight).toBe(250);
    expect(coloursFor("Not a line")).toEqual([]);
  });
});

describe("weighing", () => {
  it("takes off the empty spool and gives what's left", () => {
    expect(
      weighedPercent({
        grossGrams: 750,
        spoolWeightGrams: 250,
        weightGrams: 1000,
      })
    ).toBe(50);
    expect(
      weighedPercent({
        grossGrams: 1250,
        spoolWeightGrams: 250,
        weightGrams: 1000,
      })
    ).toBe(100);
    expect(
      weighedPercent({
        grossGrams: 200,
        spoolWeightGrams: 250,
        weightGrams: 1000,
      })
    ).toBe(0);
  });
  it("can't without a weight or an empty-spool weight", () => {
    expect(
      weighedPercent({
        grossGrams: 0,
        spoolWeightGrams: 250,
        weightGrams: 1000,
      })
    ).toBeNull();
    expect(
      weighedPercent({
        grossGrams: 700,
        spoolWeightGrams: null,
        weightGrams: 1000,
      })
    ).toBeNull();
  });
});

describe("grouping by filament", () => {
  it("puts spools of the same line and colour together, with the total left", () => {
    const s = (type: string, colourName: string, remainingPercent: number) => ({
      type,
      colourName,
      colourHex: "#000000",
      weightGrams: 1000,
      remainingPercent,
      pricePaid: null,
    });
    const groups = groupSpools([
      s("PLA Matte", "Charcoal", 100),
      s("PLA Matte", "charcoal", 50),
      s("PLA Basic", "Black", 20),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: filamentKey("PLA Matte", "Charcoal"),
      gramsLeft: 1500,
    });
    expect(groups[0].spools).toHaveLength(2);
  });
});

describe("a filament's address", () => {
  it("is readable, and tells Silk from Silk+", () => {
    expect(filamentSlug("PLA Basic", "Pumpkin Orange")).toBe(
      "pla-basic--pumpkin-orange"
    );
    expect(filamentSlug("PLA Silk+", "Gold")).toBe("pla-silk-plus--gold");
    expect(filamentSlug("PLA Silk", "Gold")).not.toBe(
      filamentSlug("PLA Silk+", "Gold")
    );
  });
});

describe("the stocktake order", () => {
  it("goes by line, then colour, then oldest spool first", () => {
    const s = (
      id: string,
      type: string,
      colourName: string,
      createdAt: string
    ) => ({ id, type, colourName, createdAt });
    const order = stocktakeOrder([
      s("c", "PLA Matte", "Charcoal", "2026-01-01"),
      s("b2", "PLA Basic", "Jade White", "2026-03-01"),
      s("a", "PLA Basic", "Hot Pink", "2026-02-01"),
      s("b1", "PLA Basic", "Jade White", "2026-01-15"),
    ]).map((x) => x.id);
    expect(order).toEqual(["a", "b1", "b2", "c"]);
  });
});
