import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
  category: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db }));

import {
  boxFigures,
  categoryFigures,
  categoryTotals,
  placeTotals,
} from "./service.server";

const row = (
  id: string | null,
  assets: number,
  recorded: number,
  sold_for: number,
  difference: number
) => ({ id, assets, recorded, sold_for, difference });

beforeEach(() => {
  db.$queryRawUnsafe.mockReset();
  db.category.findMany.mockReset();
  db.location.findMany.mockReset();
});

describe("figures per row", () => {
  it("are keyed by id, rounded to pence, and scoped to the workspace", async () => {
    db.$queryRawUnsafe.mockResolvedValue([
      row("C1", 2, 150.004, 80, -20),
      row("C2", 2, 100, 180, 50),
    ]);
    const map = await categoryFigures("org1");
    expect(map.get("C1")).toEqual({
      assets: 2,
      recorded: 150,
      soldFor: 80,
      difference: -20,
    });
    expect(db.$queryRawUnsafe.mock.calls[0][1]).toBe("org1");
  });
  it("asks for no boxes without running a query", async () => {
    expect((await boxFigures("org1", [])).size).toBe(0);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
  it("passes the boxes on", async () => {
    db.$queryRawUnsafe.mockResolvedValue([row("K1", 2, 150, 0, 0)]);
    expect((await boxFigures("org1", ["K1", "K2"])).get("K1")?.recorded).toBe(
      150
    );
    expect(db.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      "org1",
      ["K1", "K2"],
    ]);
  });
});

describe("the Categories totals row", () => {
  beforeEach(() => {
    db.category.findMany.mockResolvedValue([{ id: "C1" }, { id: "C2" }]);
    db.$queryRawUnsafe.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes("IS NOT NULL\n  GROUP") ||
          sql.includes('GROUP BY a."categoryId"')
          ? [
              row("C1", 2, 150, 80, -20),
              row("C2", 2, 100, 180, 50),
              row("C3", 5, 999, 0, 0),
            ]
          : [row(null, 3, 30, 0, 0)]
      )
    );
  });
  it("sums only the categories in the list, every column", async () => {
    const { totals } = await categoryTotals({ organizationId: "org1" });
    expect(totals).toEqual({
      assets: 4,
      recorded: 250,
      soldFor: 260,
      difference: 30,
    });
  });
  it("uses the same search as the list, so its total follows what's shown", async () => {
    await categoryTotals({ organizationId: "org1", search: "aud" });
    expect(db.category.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org1",
      name: { contains: "aud", mode: "insensitive" },
    });
  });
  it("says what the total leaves out: assets with no category", async () => {
    expect(
      (await categoryTotals({ organizationId: "org1" })).uncategorised.assets
    ).toBe(3);
    // but not when searching, when it would be beside the point
    expect(
      (await categoryTotals({ organizationId: "org1", search: "x" }))
        .uncategorised.assets
    ).toBe(0);
  });
});

describe("the Places totals row", () => {
  it("sums the figures and the counts of every place in the list", async () => {
    db.location.findMany.mockResolvedValue([
      { id: "L1", _count: { children: 2, kits: 1 } },
      { id: "L2", _count: { children: 0, kits: 3 } },
    ]);
    db.$queryRawUnsafe.mockResolvedValue([
      row("L1", 3, 210, 230, 70),
      row("L2", 1, 40, 150, 110),
      row("L9", 9, 1, 1, 1),
    ]);
    const out = await placeTotals({ organizationId: "org1" });
    expect(out.totals).toEqual({
      assets: 4,
      recorded: 250,
      soldFor: 380,
      difference: 180,
    });
    expect(out).toMatchObject({ children: 2, boxes: 4 });
  });
  it("matches the Places list's search across name, description and address", async () => {
    db.location.findMany.mockResolvedValue([]);
    db.$queryRawUnsafe.mockResolvedValue([]);
    await placeTotals({ organizationId: "org1", search: "garage" });
    const where = db.location.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(
      where.OR.map((o: Record<string, unknown>) => Object.keys(o)[0])
    ).toEqual(["name", "description", "address"]);
  });
});
