/**
 * Selling part of an asset (quantities, fork), against a pretend database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const state = {
    asset: { id: "a1", quantity: 6 as number | null, sale: null as unknown },
    parts: [] as {
      id: string;
      assetId: string;
      quantity: number;
      soldOn: Date;
      price: number | null;
    }[],
    fullSales: [] as unknown[],
    notes: [] as string[],
  };
  const tx = {
    asset: {
      updateMany: vi.fn(({ where, data }) => {
        if ("quantity" in where && where.quantity !== state.asset.quantity)
          return { count: 0 };
        state.asset.quantity = data.quantity;
        return { count: 1 };
      }),
      findFirst: vi.fn(() => ({ quantity: state.asset.quantity })),
    },
    assetPartSale: {
      create: vi.fn(({ data }) => {
        state.parts.push({ id: `p${state.parts.length + 1}`, ...data });
      }),
      deleteMany: vi.fn(({ where }) => {
        state.parts = state.parts.filter((p) => p.id !== where.id);
      }),
    },
  };
  return { state, tx };
});

vi.mock("~/database/db.server", () => ({
  db: {
    asset: {
      findFirst: vi.fn(({ where }) =>
        where.id === m.state.asset.id ? { ...m.state.asset } : null
      ),
      findMany: vi.fn(() => [{ id: "a1", quantity: m.state.asset.quantity }]),
    },
    assetSale: {
      upsert: vi.fn((args) => {
        m.state.fullSales.push(args);
        return args;
      }),
    },
    assetPartSale: {
      findFirst: vi.fn(
        ({ where }) => m.state.parts.find((p) => p.id === where.id) ?? null
      ),
    },
    organization: { findFirst: vi.fn(() => ({ currency: "GBP" })) },
    $transaction: vi.fn((arg) =>
      typeof arg === "function" ? arg(m.tx) : Promise.all(arg)
    ),
  },
}));
vi.mock("~/modules/activity/service.server", () => ({
  addAssetActivity: vi.fn(({ action }) => m.state.notes.push(action)),
}));
vi.mock("./sold-box.server", () => ({ moveToSoldBox: vi.fn() }));

const { sellPart, undoPartSale } = await import("./service.server");

const soldOn = new Date("2026-10-18T00:00:00.000Z");

beforeEach(() => {
  m.state.asset = { id: "a1", quantity: 6, sale: null };
  m.state.parts = [];
  m.state.fullSales = [];
  m.state.notes = [];
});

describe("sellPart", () => {
  it("sells some: the rest stay, the asset isn't sold", async () => {
    const out = await sellPart({
      organizationId: "o1",
      assetId: "a1",
      quantity: 2,
      soldOn,
      price: 20,
    });
    expect(out).toEqual({ kind: "part", left: 4 });
    expect(m.state.asset.quantity).toBe(4);
    expect(m.state.parts).toEqual([
      expect.objectContaining({ assetId: "a1", quantity: 2, price: 20 }),
    ]);
    expect(m.state.fullSales).toHaveLength(0);
    expect(m.state.notes[0]).toBe(
      "sold **2 of 6** on 18 Oct 2026 for £20.00, with 4 left."
    );
  });

  it("selling all of what's left sells the asset, recording how many", async () => {
    const out = await sellPart({
      organizationId: "o1",
      assetId: "a1",
      quantity: 6,
      soldOn,
      price: 60,
    });
    expect(out).toEqual({ kind: "all", left: 0 });
    expect(m.state.parts).toHaveLength(0);
    expect(m.state.fullSales[0]).toMatchObject({
      create: { assetId: "a1", quantity: 6, price: 60 },
    });
  });

  it("counts an asset with no quantity as one", async () => {
    m.state.asset.quantity = null;
    expect(
      await sellPart({
        organizationId: "o1",
        assetId: "a1",
        quantity: 1,
        soldOn,
        price: null,
      })
    ).toEqual({ kind: "all", left: 0 });
  });

  it("refuses nothing, an asset already sold, or another workspace's", async () => {
    await expect(
      sellPart({
        organizationId: "o1",
        assetId: "a1",
        quantity: 0,
        soldOn,
        price: null,
      })
    ).rejects.toMatchObject({ status: 400 });
    m.state.asset.sale = { assetId: "a1" };
    await expect(
      sellPart({
        organizationId: "o1",
        assetId: "a1",
        quantity: 1,
        soldOn,
        price: null,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sellPart({
        organizationId: "o1",
        assetId: "zz",
        quantity: 1,
        soldOn,
        price: null,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("undoPartSale", () => {
  it("puts them back and removes the sale", async () => {
    await sellPart({
      organizationId: "o1",
      assetId: "a1",
      quantity: 2,
      soldOn,
      price: 20,
    });
    await undoPartSale({ organizationId: "o1", partSaleId: "p1" });
    expect(m.state.asset.quantity).toBe(6);
    expect(m.state.parts).toHaveLength(0);
  });
});
