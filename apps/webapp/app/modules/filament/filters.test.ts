import { describe, expect, it } from "vitest";
import {
  filterParam,
  matchesGroup,
  matchesItem,
  parseFilters,
} from "./filters";

const params = (q: string) => new URLSearchParams(q);
const item = (over: Record<string, unknown> = {}) => ({
  material: "PLA",
  type: "PLA Basic",
  colourName: "Jade White",
  packaging: "spool",
  status: "active",
  amsSlot: null,
  openedOn: "2026-09-10",
  purchasedOn: "2026-09-01",
  remainingPercent: 40,
  pricePaid: 13.99,
  filamentCode: "10100",
  ...over,
});

describe("reading filters from the address", () => {
  it("in Assets' form, a bare value meaning is", () => {
    expect(
      parseFilters(params("material=isNot:PETG&left=lt:20&line=PLA%20Basic"))
    ).toEqual([
      { name: "material", op: "isNot", value: "PETG" },
      { name: "line", op: "is", value: "PLA Basic" },
      { name: "left", op: "lt", value: "20" },
    ]);
  });
  it("ignores what it doesn't know, and conditions a field doesn't have", () => {
    expect(
      parseFilters(params("nonsense=is:x&left=contains:4&colour="))
    ).toEqual([]);
  });
  it("writes them back the same way", () => {
    expect(filterParam({ op: "after", value: "2026-01-01" })).toBe(
      "after:2026-01-01"
    );
  });
});

describe("testing each spool or refill", () => {
  it("by material, line, colour, type, status and code", () => {
    const f = parseFilters(
      params(
        "material=is:pla&line=contains:basic&colour=is:jade white&type=is:spool&status=is:opened&code=is:10100"
      )
    );
    expect(matchesItem(item(), f)).toBe(true);
    expect(matchesItem(item({ packaging: "refill" }), f)).toBe(false);
    expect(
      matchesItem(item({ amsSlot: 2 }), parseFilters(params("status=is:inuse")))
    ).toBe(true);
    expect(
      matchesItem(
        item({ openedOn: null }),
        parseFilters(params("status=is:new"))
      )
    ).toBe(true);
  });
  it("by left, paid and dates", () => {
    expect(
      matchesItem(item(), parseFilters(params("left=lt:50&paid=gt:10")))
    ).toBe(true);
    expect(
      matchesItem(item({ pricePaid: null }), parseFilters(params("paid=gt:10")))
    ).toBe(false);
    expect(
      matchesItem(
        item(),
        parseFilters(params("bought=after:2026-08-01&opened=before:2026-10-01"))
      )
    ).toBe(true);
    expect(
      matchesItem(
        item({ openedOn: null }),
        parseFilters(params("opened=before:2026-10-01"))
      )
    ).toBe(false);
  });
});

describe("testing the filament as a whole", () => {
  it("by kg left, store price and offer", () => {
    const f = parseFilters(params("kgLeft=lt:1&store=lt:15&offer=is:yes"));
    expect(
      matchesGroup({ gramsLeft: 800 }, { best: 11.99, onOffer: true }, f)
    ).toBe(true);
    expect(
      matchesGroup({ gramsLeft: 1800 }, { best: 11.99, onOffer: true }, f)
    ).toBe(false);
    expect(matchesGroup({ gramsLeft: 800 }, undefined, f)).toBe(false);
    expect(
      matchesGroup(
        { gramsLeft: 800 },
        undefined,
        parseFilters(params("offer=is:no"))
      )
    ).toBe(true);
  });
  it("leaves item filters to the items", () => {
    expect(
      matchesGroup(
        { gramsLeft: 0 },
        undefined,
        parseFilters(params("material=is:PETG"))
      )
    ).toBe(true);
  });
});
