/**
 * Filament's Advanced view (fork): columns, rows and sorting.
 */
import { describe, expect, it } from "vitest";
import {
  advancedRow,
  DEFAULT_COLUMNS,
  parseColumns,
  parseSort,
  sortRows,
} from "./advanced";

const item = (over: Record<string, unknown> = {}) => ({
  type: "PLA Basic",
  material: "PLA",
  colourName: "Jade White",
  packaging: "spool",
  weightGrams: 1000,
  remainingPercent: 50,
  pricePaid: 20,
  amsSlot: null,
  purchasedOn: null,
  filamentCode: null,
  ...over,
});

describe("parseColumns", () => {
  it("has the ID after the code by default", () => {
    expect(DEFAULT_COLUMNS.indexOf("fil")).toBe(
      DEFAULT_COLUMNS.indexOf("code") + 1
    );
    expect(parseColumns(null)).toEqual(DEFAULT_COLUMNS);
  });

  it("keeps the chosen order, the filament first, and drops strangers and repeats", () => {
    expect(parseColumns("store,colour,line,bogus,store,fil")).toEqual([
      "colour",
      "store",
      "line",
      "fil",
    ]);
    expect(parseColumns(encodeURIComponent("left,spent"))).toEqual([
      "colour",
      "left",
      "spent",
    ]);
  });
});

describe("advancedRow", () => {
  it("sums a filament's items", () => {
    const row = advancedRow(
      {
        type: "PLA Basic",
        colourName: "Jade White",
        spools: [
          item({
            amsSlot: 2,
            purchasedOn: "2026-08-01",
            filamentCode: "10100",
          }),
          item({
            packaging: "refill",
            remainingPercent: 100,
            pricePaid: 15,
            purchasedOn: new Date("2026-10-03"),
          }),
          item({ pricePaid: null, remainingPercent: 0 }),
        ],
      },
      { fil: "FIL-0001", code: "99999", store: 16.49 }
    );
    expect(row).toEqual({
      colour: "Jade White",
      line: "PLA Basic",
      code: "10100",
      fil: "FIL-0001",
      material: "PLA",
      spools: 2,
      refills: 1,
      left: 1500,
      paidKg: 17.5,
      spent: 35,
      store: 16.49,
      ams: [2],
      bought: "2026-10-03T00:00:00.000Z",
    });
  });

  it("falls back to the store's code, and blanks when nothing is known", () => {
    const row = advancedRow(
      {
        type: "PETG HF",
        colourName: "Black",
        spools: [item({ pricePaid: null })],
      },
      { fil: null, code: "33102", store: null }
    );
    expect(row.code).toBe("33102");
    expect(row.paidKg).toBeNull();
    expect(row.spent).toBeNull();
    expect(row.bought).toBeNull();
  });
});

describe("sorting", () => {
  const rows = [
    { key: "a", adv: { left: 500, colour: "Black", store: null, ams: [] } },
    { key: "b", adv: { left: 2000, colour: "Ash", store: 10, ams: [3] } },
    { key: "c", adv: { left: 1000, colour: "cyan", store: 12, ams: [1] } },
  ] as unknown as Parameters<typeof sortRows>[0];
  const keys = (r: typeof rows) =>
    r.map((x) => (x as unknown as { key: string }).key);

  it("sorts numbers and words either way", () => {
    expect(keys(sortRows(rows, "left", "asc"))).toEqual(["a", "c", "b"]);
    expect(keys(sortRows(rows, "left", "desc"))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows(rows, "colour", "asc"))).toEqual(["b", "a", "c"]);
  });

  it("puts blanks last whichever way", () => {
    expect(keys(sortRows(rows, "store", "asc"))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows(rows, "store", "desc"))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows(rows, "ams", "asc"))).toEqual(["c", "b", "a"]);
  });

  it("reads the sort from the address", () => {
    expect(parseSort("left", "desc")).toEqual({ by: "left", dir: "desc" });
    expect(parseSort("left", null)).toEqual({ by: "left", dir: "asc" });
    expect(parseSort("nope", "asc")).toBeNull();
  });
});
