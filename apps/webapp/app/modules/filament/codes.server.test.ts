import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  filamentCode: { upsert: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db }));
vi.mock("~/utils/logger", () => ({ Logger: { error: vi.fn() } }));

import { StoreError } from "./bambu-store.server";
import { buildCodeTable, refreshCodesIfStale } from "./codes.server";

const sku = (colour: string, type = "Filament with spool") => ({
  id: colour,
  productSkuPropertyList: [
    { propertyKey: "Color", propertyValue: colour },
    { propertyKey: "Type", propertyValue: type },
  ],
});

beforeEach(() => {
  Object.values(db.filamentCode).forEach((f) => f.mockReset());
  db.filamentCode.upsert.mockResolvedValue({});
});

describe("Bambu's box codes", () => {
  it("files each colour's code under its line, once, from the product that is that line", async () => {
    const store = {
      searchProducts: vi.fn().mockImplementation((type: string) =>
        Promise.resolve(
          type === "PLA Basic"
            ? [
                { seoCode: "pla-basic-gradient", name: "PLA Basic Gradient" },
                { seoCode: "pla-basic", name: "PLA Basic" },
              ]
            : []
        )
      ),
      getProduct: vi.fn().mockResolvedValue({
        seoCode: "pla-basic",
        name: "PLA Basic",
        productSkuList: [
          sku("Jade White (10100)"),
          sku("Jade White (10100)", "Refill"),
          sku("Black (10101)"),
        ],
      }),
    };
    const result = await buildCodeTable("o1", store);
    expect(store.getProduct).toHaveBeenCalledWith("pla-basic"); // the line itself, not "PLA Basic Gradient"
    expect(result.codes).toBe(2);
    expect(
      db.filamentCode.upsert.mock.calls.map((c) => [
        c[0].create.code,
        c[0].create.type,
        c[0].create.colourName,
      ])
    ).toEqual([
      ["10100", "PLA Basic", "Jade White"],
      ["10101", "PLA Basic", "Black"],
    ]);
    expect(result.unmatched).toContain("PLA Matte"); // no product named PLA Matte: skipped, not guessed
  });
  it("stops when the store pauses", async () => {
    const store = {
      searchProducts: vi
        .fn()
        .mockRejectedValue(new StoreError("lookups are paused for an hour")),
      getProduct: vi.fn(),
    };
    const result = await buildCodeTable("o1", store);
    expect(result.stopped).toBe(true);
    expect(store.searchProducts).toHaveBeenCalledTimes(1);
  });
  it("rebuilds weekly, not when the table is fresh", async () => {
    db.filamentCode.findFirst.mockResolvedValue({ checkedAt: new Date() });
    expect(
      await refreshCodesIfStale("o1", {
        searchProducts: vi.fn(),
        getProduct: vi.fn(),
      })
    ).toBe(false);
    db.filamentCode.findFirst.mockResolvedValue({
      checkedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    });
    const store = {
      searchProducts: vi.fn().mockResolvedValue([]),
      getProduct: vi.fn(),
    };
    expect(await refreshCodesIfStale("o1", store)).toBe(true);
  });
});
