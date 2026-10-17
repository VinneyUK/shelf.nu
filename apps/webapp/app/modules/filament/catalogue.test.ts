import { describe, expect, it } from "vitest";
import { BAMBU_CATALOGUE } from "./bambu-catalogue";
import {
  BAMBU_TYPES,
  catalogueEntry,
  cleanHex,
  cleanPackaging,
  coloursFor,
  colourWords,
  costPerKg,
  daysAgo,
  filamentKey,
  filamentSlug,
  gramsLeft,
  groupSpools,
  materialOf,
  oldestNew,
  remainingTone,
  searchFilaments,
  spoolState,
  stateCounts,
  stateLabel,
  stocktakeOrder,
  summarise,
  typeCounts,
  typeWords,
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

describe("a spool's life", () => {
  const s = (
    status: string,
    amsSlot: number | null,
    openedOn: string | null
  ) => ({ status, amsSlot, openedOn });
  it("is New until opened, Opened on the shelf, In use in the AMS, then Run out? and Retired", () => {
    expect(spoolState(s("active", null, null))).toBe("new");
    expect(spoolState(s("active", null, "2026-10-01"))).toBe("opened");
    expect(spoolState(s("active", 2, "2026-10-01"))).toBe("in-use");
    expect(spoolState(s("empty", 2, "2026-10-01"))).toBe("run-out");
    expect(spoolState(s("retired", null, "2026-10-01"))).toBe("retired");
  });
  it("names the slot of a spool in use", () => {
    expect(stateLabel(s("active", 2, "2026-10-01"))).toBe("In use · AMS 2");
    expect(stateLabel(s("active", null, null))).toBe("New");
  });
  it("counts new and open spools for a tile", () => {
    expect(
      stateCounts([
        s("active", null, null),
        s("active", null, null),
        s("active", 1, "2026-10-01"),
        s("active", null, "2026-10-02"),
      ])
    ).toEqual({ new: 2, open: 2 });
  });
  it("says how long ago, in plain words", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(daysAgo("2026-10-17", now)).toBe("today");
    expect(daysAgo("2026-10-16", now)).toBe("yesterday");
    expect(daysAgo("2026-10-12", now)).toBe("5 days ago");
    expect(daysAgo("2026-09-26", now)).toBe("3 weeks ago");
    expect(daysAgo("2026-02-17", now)).toBe("8 months ago");
    expect(daysAgo("2024-10-17", now)).toBe("2 years ago");
  });
  it("suggests opening the oldest-bought new spool, unknown dates last", () => {
    const spool = (
      id: string,
      purchasedOn: string | null,
      createdAt: string,
      openedOn: string | null = null
    ) => ({
      id,
      status: "active",
      amsSlot: null,
      openedOn,
      purchasedOn,
      createdAt,
    });
    const pick = oldestNew([
      spool("unknown", null, "2026-01-01"),
      spool("newer", "2026-09-01", "2026-09-02"),
      spool("older", "2026-05-01", "2026-09-03"),
      spool("open", "2026-01-01", "2026-01-02", "2026-02-01"),
    ]);
    expect(pick?.id).toBe("older");
    expect(
      oldestNew([
        spool("a", null, "2026-03-01"),
        spool("b", null, "2026-02-01"),
      ])?.id
    ).toBe("b");
    expect(oldestNew([])).toBeNull();
  });
});

describe("finding a filament as you type", () => {
  const codes = [
    { code: "10100", type: "PLA Basic", colourName: "Jade White" },
    { code: "99999", type: "PLA Special", colourName: "Mystery" },
  ];
  it("by colour", () => {
    const hits = searchFilaments("jade", codes);
    expect(hits[0]).toMatchObject({
      type: "PLA Basic",
      colourName: "Jade White",
      colourHex: "#FFFFFF",
      code: "10100",
    });
  });
  it("by line and colour, in any order", () => {
    expect(searchFilaments("white basic jade", codes)[0]).toMatchObject({
      type: "PLA Basic",
      colourName: "Jade White",
    });
  });
  it("by a plain colour word, even when Bambu's name differs (Matte's black is Charcoal)", () => {
    const hits = searchFilaments("matte black", codes);
    expect(hits.map((h) => h.colourName)).toContain("Charcoal");
    expect(hits.every((h) => h.type === "PLA Matte")).toBe(true);
    expect(
      searchFilaments("matte blue", codes).map((h) => h.colourName)
    ).toEqual(
      expect.arrayContaining([
        "Ice Blue",
        "Marine Blue",
        "Dark Blue",
        "Sky Blue",
      ])
    );
  });
  it("by the code on the box, first", () => {
    expect(searchFilaments("10100", codes)[0]).toMatchObject({
      colourName: "Jade White",
      code: "10100",
    });
  });
  it("finds a known code's filament even if the catalogue doesn't have it", () => {
    expect(searchFilaments("99999", codes)[0]).toMatchObject({
      type: "PLA Special",
      colourName: "Mystery",
    });
  });
  it("needs every word, and shows a handful", () => {
    expect(searchFilaments("jade nonsense", codes)).toEqual([]);
    expect(searchFilaments("", codes)).toEqual([]);
    expect(searchFilaments("pla", codes).length).toBe(8);
  });
});

describe("refill or spool", () => {
  it("is a spool unless it says refill", () => {
    expect(cleanPackaging("refill")).toBe("refill");
    expect(cleanPackaging("spool")).toBe("spool");
    expect(cleanPackaging(undefined)).toBe("spool");
    expect(cleanPackaging("box")).toBe("spool");
  });
});

describe("plain colour words", () => {
  it("judge a shade by its hex", () => {
    expect(colourWords("#000000")).toEqual(["black"]);
    expect(colourWords("#FFFFFF")).toEqual(["white"]);
    expect(colourWords("#8E9089")).toEqual(["grey", "gray"]);
    expect(colourWords("#C12E1F")).toEqual(["red"]);
    expect(colourWords("#0A2989")).toEqual(["blue"]);
    expect(colourWords("#00AE42")).toEqual(["green"]);
    expect(colourWords("#F4EE2A")).toEqual(["yellow"]);
    expect(colourWords("#FF6A13")).toEqual(["orange"]);
    expect(colourWords("#F5547C")).toEqual(["pink"]);
    expect(colourWords("#5E43B7")).toEqual(["purple"]);
    expect(colourWords("#7D6556")).toEqual(["brown"]);
  });
});

describe("spools and refills", () => {
  const items = (spools: number, refills: number) => [
    ...Array.from({ length: spools }, () => ({ packaging: "spool" })),
    ...Array.from({ length: refills }, () => ({ packaging: "refill" })),
  ];
  it("are counted apart", () => {
    expect(typeCounts(items(2, 1))).toEqual({ spools: 2, refills: 1 });
    expect(typeCounts([{ packaging: null }])).toEqual({
      spools: 1,
      refills: 0,
    });
  });
  it("are said apart", () => {
    expect(typeWords(items(2, 1))).toBe("2 spools · 1 refill");
    expect(typeWords(items(1, 0))).toBe("1 spool");
    expect(typeWords(items(0, 3))).toBe("3 refills");
  });
});
