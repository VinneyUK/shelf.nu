import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  filamentPrice: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  spool: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db }));
vi.mock("~/utils/logger", () => ({ Logger: { error: vi.fn() } }));

import { StoreError } from "./bambu-store.server";
import {
  fillMissingPrices,
  refreshPrice,
  refreshStalePrices,
  storePriceFor,
} from "./prices.server";

const wanted = {
  type: "PLA Basic",
  colourName: "Jade White",
  filamentCode: "10100",
};
const variant = (
  kind: string,
  price: number,
  discountPrice: number | null = null
) => ({
  productName: "PLA Basic",
  productUrl: "https://uk.store.bambulab.com/products/pla-basic?id=1",
  colourName: "Jade White",
  filamentCode: "10100",
  imageUrl: null,
  price,
  discountPrice,
  kind,
  size: "1 kg",
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.values(db.filamentPrice).forEach((f) => f.mockReset());
  db.spool.findMany.mockReset();
  db.filamentPrice.upsert.mockResolvedValue({});
});

describe("checking one filament's prices", () => {
  it("keeps the variants' prices and the store link", async () => {
    const store = {
      findFilamentVariants: vi
        .fn()
        .mockResolvedValue([
          variant("Filament with spool", 19.99),
          variant("Refill", 16.99, 13.99),
        ]),
    };
    expect(await refreshPrice("o1", wanted, store)).toBe("found");
    expect(store.findFilamentVariants).toHaveBeenCalledWith({
      type: "PLA Basic",
      colourName: "Jade White",
      code: "10100",
    });
    const call = db.filamentPrice.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      organizationId_key: { organizationId: "o1", key: "pla basic|jade white" },
    });
    expect(call.create).toMatchObject({
      status: "found",
      productUrl: "https://uk.store.bambulab.com/products/pla-basic?id=1",
      variants: [
        {
          kind: "Filament with spool",
          size: "1 kg",
          price: 19.99,
          discountPrice: null,
        },
        { kind: "Refill", size: "1 kg", price: 16.99, discountPrice: 13.99 },
      ],
    });
  });
  it("records 'not sold' and store problems, in plain words, without throwing", async () => {
    expect(
      await refreshPrice("o1", wanted, {
        findFilamentVariants: vi.fn().mockResolvedValue([]),
      })
    ).toBe("missing");
    const failing = {
      findFilamentVariants: vi
        .fn()
        .mockRejectedValue(
          new StoreError(
            "The Bambu store refused the request; lookups are paused for an hour."
          )
        ),
    };
    expect(await refreshPrice("o1", wanted, failing)).toBe("error");
    expect(db.filamentPrice.upsert.mock.calls.at(-1)?.[0].create).toMatchObject(
      { status: "error", message: expect.stringMatching(/paused/) }
    );
  });
});

describe("keeping prices fresh", () => {
  it("checks each filament once, skipping ones checked in the last day", async () => {
    db.spool.findMany.mockResolvedValue([
      { type: "PLA Basic", colourName: "Jade White", filamentCode: null },
      { type: "PLA Basic", colourName: "Jade White", filamentCode: null },
      { type: "PLA Basic", colourName: "Hot Pink", filamentCode: null },
    ]);
    db.filamentPrice.findMany.mockResolvedValue([
      { key: "pla basic|hot pink", checkedAt: new Date() },
    ]);
    const store = {
      findFilamentVariants: vi
        .fn()
        .mockResolvedValue([variant("Refill", 16.99)]),
    };
    expect(refreshStalePrices("o1", {}, store)).toBe(true);
    for (let i = 0; i < 10; i++) await flush();
    expect(store.findFilamentVariants).toHaveBeenCalledTimes(1);
    expect(store.findFilamentVariants.mock.calls[0][0].colourName).toBe(
      "Jade White"
    );
  });
  it("checks everything when forced, and stops when the store pauses", async () => {
    db.spool.findMany.mockResolvedValue([
      { type: "PLA Basic", colourName: "A", filamentCode: null },
      { type: "PLA Basic", colourName: "B", filamentCode: null },
    ]);
    db.filamentPrice.findMany.mockResolvedValue([
      { key: "pla basic|a", checkedAt: new Date() },
      { key: "pla basic|b", checkedAt: new Date() },
    ]);
    db.filamentPrice.findUnique.mockResolvedValue({
      message: "lookups are paused for an hour",
    });
    const store = {
      findFilamentVariants: vi
        .fn()
        .mockRejectedValue(new StoreError("lookups are paused for an hour")),
    };
    expect(refreshStalePrices("o1", { force: true }, store)).toBe(true);
    for (let i = 0; i < 10; i++) await flush();
    expect(store.findFilamentVariants).toHaveBeenCalledTimes(1); // stopped after the pause
  });
});

describe("default prices", () => {
  const variants = [
    {
      kind: "Filament with spool",
      size: "1 kg",
      price: 16.99,
      discountPrice: null,
    },
    { kind: "Refill", size: "1 kg", price: 13.99, discountPrice: 11.99 },
  ];
  it("today's store price as a spool or a refill, from what's kept when fresh", async () => {
    db.filamentPrice.findUnique.mockResolvedValue({
      variants,
      checkedAt: new Date(),
      status: "found",
    });
    const store = { findFilamentVariants: vi.fn() };
    const wanted = {
      type: "PLA Basic",
      colourName: "Jade White",
      filamentCode: null,
    };
    expect(
      await storePriceFor("o1", { ...wanted, packaging: "spool" }, store)
    ).toBe(16.99);
    expect(
      await storePriceFor("o1", { ...wanted, packaging: "refill" }, store)
    ).toBe(11.99); // on offer
    expect(store.findFilamentVariants).not.toHaveBeenCalled();
  });
  it("fills in only missing prices, from prices already held", async () => {
    db.spool.findMany.mockResolvedValue([
      {
        id: "a",
        type: "PLA Basic",
        colourName: "Jade White",
        packaging: "refill",
      },
      { id: "b", type: "PLA Basic", colourName: "Unknown", packaging: "spool" },
    ]);
    db.filamentPrice.findMany.mockResolvedValue([
      { key: "pla basic|jade white", variants },
    ]);
    db.spool.update = vi.fn().mockResolvedValue({});
    expect(await fillMissingPrices("o1")).toEqual({ filled: 1, unpriced: 1 });
    expect(db.spool.update).toHaveBeenCalledWith({
      where: { id: "a", organizationId: "o1" },
      data: { pricePaid: 11.99 },
    });
  });
});
