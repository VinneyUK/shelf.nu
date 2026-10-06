/**
 * The Sold box (fork), against a pretend database and pretend box functions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  customisation: { findUnique: vi.fn() },
  kit: { findFirst: vi.fn() },
  asset: { findMany: vi.fn() },
  assetKit: { findMany: vi.fn() },
  assetSale: { updateMany: vi.fn() },
  transaction: vi.fn(),
  createKit: vi.fn(),
  updateKitAssets: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("~/database/db.server", () => ({
  db: {
    workspaceCustomisation: m.customisation,
    kit: m.kit,
    asset: m.asset,
    assetKit: m.assetKit,
    assetSale: m.assetSale,
    $transaction: m.transaction,
  },
}));
vi.mock("~/modules/kit/service.server", () => ({
  createKit: m.createKit,
  updateKitAssets: m.updateKitAssets,
}));
vi.mock("~/utils/logger", () => ({ Logger: { error: m.logError } }));

import {
  moveBackFromSoldBox,
  moveToSoldBox,
  SOLD_BOX_NAME,
} from "./sold-box.server";

const base = { organizationId: "org1", userId: "u1" };

beforeEach(() => {
  for (const group of [
    m.customisation,
    m.kit,
    m.asset,
    m.assetKit,
    m.assetSale,
  ])
    Object.values(group).forEach((f) => f.mockReset());
  for (const f of [m.transaction, m.createKit, m.updateKitAssets, m.logError])
    f.mockReset();
  m.customisation.findUnique.mockResolvedValue(null); // both switches on by default
  m.transaction.mockImplementation((ops: unknown[]) => Promise.resolve(ops));
  m.createKit.mockResolvedValue({ id: "sold-new" });
  m.updateKitAssets.mockResolvedValue(undefined);
});

describe("putting sold assets in the Sold box", () => {
  it("creates the Sold box the first time, and records that the asset was in no box", async () => {
    m.kit.findFirst.mockResolvedValue(null);
    m.asset.findMany.mockResolvedValue([{ id: "a1", assetKits: [] }]);
    expect(await moveToSoldBox({ ...base, assetIds: ["a1"] })).toBe(1);
    expect(m.createKit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sold",
        createdById: "u1",
        organizationId: "org1",
      })
    );
    expect(m.updateKitAssets).toHaveBeenCalledTimes(1);
    expect(m.updateKitAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        kitId: "sold-new",
        assetIds: ["a1"],
        addOnly: true,
      })
    );
    expect(m.assetSale.updateMany).toHaveBeenCalledWith({
      where: { assetId: "a1", organizationId: "org1" },
      data: { previousKitId: null },
    });
  });
  it("reuses a Sold box that's already there, found by name in any case", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([{ id: "a1", assetKits: [] }]);
    await moveToSoldBox({ ...base, assetIds: ["a1"] });
    expect(m.createKit).not.toHaveBeenCalled();
    expect(m.kit.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: "org1",
      name: { equals: SOLD_BOX_NAME, mode: "insensitive" },
    });
  });
  it("takes the asset out of its old box first, leaving the others there, and remembers the box", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([
      { id: "a1", assetKits: [{ kitId: "k1" }] },
    ]);
    m.assetKit.findMany.mockResolvedValue([
      { assetId: "a1" },
      { assetId: "a2" },
    ]);
    expect(await moveToSoldBox({ ...base, assetIds: ["a1"] })).toBe(1);
    expect(m.updateKitAssets.mock.calls[0][0]).toMatchObject({
      kitId: "k1",
      assetIds: ["a2"],
    });
    expect(m.updateKitAssets.mock.calls[0][0].addOnly).toBeUndefined();
    expect(m.updateKitAssets.mock.calls[1][0]).toMatchObject({
      kitId: "sold",
      assetIds: ["a1"],
      addOnly: true,
    });
    expect(m.assetSale.updateMany).toHaveBeenCalledWith({
      where: { assetId: "a1", organizationId: "org1" },
      data: { previousKitId: "k1" },
    });
  });
  it("leaves a box once for several assets from it", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([
      { id: "a1", assetKits: [{ kitId: "k1" }] },
      { id: "a2", assetKits: [{ kitId: "k1" }] },
    ]);
    m.assetKit.findMany.mockResolvedValue([
      { assetId: "a1" },
      { assetId: "a2" },
      { assetId: "a3" },
    ]);
    expect(await moveToSoldBox({ ...base, assetIds: ["a1", "a2"] })).toBe(2);
    expect(m.updateKitAssets.mock.calls[0][0]).toMatchObject({
      kitId: "k1",
      assetIds: ["a3"],
    });
    expect(m.updateKitAssets).toHaveBeenCalledTimes(2);
  });
  it("leaves an asset that's already in the Sold box alone", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([
      { id: "a1", assetKits: [{ kitId: "sold" }] },
    ]);
    expect(await moveToSoldBox({ ...base, assetIds: ["a1"] })).toBe(0);
    expect(m.updateKitAssets).not.toHaveBeenCalled();
  });
  it("only moves individually tracked assets, and only this workspace's", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([]);
    await moveToSoldBox({ ...base, assetIds: ["a1"] });
    expect(m.asset.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: "org1",
      type: "INDIVIDUAL",
    });
    expect(m.updateKitAssets).not.toHaveBeenCalled();
  });
});

describe("when it shouldn't happen", () => {
  it("does nothing when the switch is off, or boxes are switched off", async () => {
    m.customisation.findUnique.mockResolvedValue({
      soldBoxEnabled: false,
      kitsEnabled: true,
    });
    expect(await moveToSoldBox({ ...base, assetIds: ["a1"] })).toBe(0);
    m.customisation.findUnique.mockResolvedValue({
      soldBoxEnabled: true,
      kitsEnabled: false,
    });
    expect(await moveToSoldBox({ ...base, assetIds: ["a1"] })).toBe(0);
    expect(m.asset.findMany).not.toHaveBeenCalled();
  });
  it("does nothing without a person to log the move against, or without assets", async () => {
    expect(
      await moveToSoldBox({
        organizationId: "org1",
        userId: null,
        assetIds: ["a1"],
      })
    ).toBe(0);
    expect(await moveToSoldBox({ ...base, assetIds: [] })).toBe(0);
    expect(m.customisation.findUnique).not.toHaveBeenCalled();
  });
});

describe("when something goes wrong, the sale is never stopped", () => {
  it("never throws, logs it, and puts the asset back if it had already left its box", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([
      { id: "a1", assetKits: [{ kitId: "k1" }] },
    ]);
    m.assetKit.findMany.mockResolvedValue([
      { assetId: "a1" },
      { assetId: "a2" },
    ]);
    // leaving k1 works; joining Sold fails
    m.updateKitAssets
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("kit is in custody"));
    await expect(moveToSoldBox({ ...base, assetIds: ["a1"] })).resolves.toBe(0);
    expect(m.logError).toHaveBeenCalled();
    const restore = m.updateKitAssets.mock.calls[2][0];
    expect(restore).toMatchObject({
      kitId: "k1",
      assetIds: ["a1"],
      addOnly: true,
    });
  });
  it("copes with even the restore failing", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.asset.findMany.mockResolvedValue([
      { id: "a1", assetKits: [{ kitId: "k1" }] },
    ]);
    m.assetKit.findMany.mockResolvedValue([{ assetId: "a1" }]);
    m.updateKitAssets
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("down"));
    await expect(moveToSoldBox({ ...base, assetIds: ["a1"] })).resolves.toBe(0);
  });
  it("copes with the database failing outright", async () => {
    m.customisation.findUnique.mockRejectedValue(new Error("db down"));
    await expect(moveToSoldBox({ ...base, assetIds: ["a1"] })).resolves.toBe(0);
    expect(m.logError).toHaveBeenCalled();
  });
});

describe("taking assets back out when they are not sold after all", () => {
  const back = (previous: [string, string | null][]) =>
    moveBackFromSoldBox({ ...base, previousBoxes: new Map(previous) });

  it("leaves the Sold box and goes back to the box it came from", async () => {
    m.kit.findFirst
      .mockResolvedValueOnce({ id: "sold" })
      .mockResolvedValueOnce({ id: "k1" });
    m.assetKit.findMany.mockResolvedValue([
      { assetId: "a1" },
      { assetId: "a3" },
    ]);
    expect(await back([["a1", "k1"]])).toBe(1);
    expect(m.updateKitAssets.mock.calls[0][0]).toMatchObject({
      kitId: "sold",
      assetIds: ["a3"],
    }); // a3 stays sold
    expect(m.updateKitAssets.mock.calls[1][0]).toMatchObject({
      kitId: "k1",
      assetIds: ["a1"],
      addOnly: true,
    });
  });
  it("just leaves the Sold box if the old box has been deleted", async () => {
    m.kit.findFirst
      .mockResolvedValueOnce({ id: "sold" })
      .mockResolvedValueOnce(null);
    m.assetKit.findMany.mockResolvedValue([{ assetId: "a1" }]);
    expect(await back([["a1", "k1"]])).toBe(1);
    expect(m.updateKitAssets).toHaveBeenCalledTimes(1);
  });
  it("just leaves the Sold box if it was in no box before", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.assetKit.findMany.mockResolvedValue([{ assetId: "a1" }]);
    expect(await back([["a1", null]])).toBe(1);
    expect(m.updateKitAssets).toHaveBeenCalledTimes(1);
  });
  it("leaves alone an asset someone has since moved to another box", async () => {
    m.kit.findFirst.mockResolvedValue({ id: "sold" });
    m.assetKit.findMany.mockResolvedValue([{ assetId: "a1" }]);
    expect(await back([["a9", "k1"]])).toBe(0);
    expect(m.updateKitAssets).not.toHaveBeenCalled();
  });
  it("does nothing if there is no Sold box, or no one to log it against", async () => {
    m.kit.findFirst.mockResolvedValue(null);
    expect(await back([["a1", "k1"]])).toBe(0);
    expect(
      await moveBackFromSoldBox({
        organizationId: "org1",
        userId: null,
        previousBoxes: new Map([["a1", "k1"]]),
      })
    ).toBe(0);
  });
  it("never throws", async () => {
    m.kit.findFirst.mockRejectedValue(new Error("db down"));
    await expect(back([["a1", "k1"]])).resolves.toBe(0);
    expect(m.logError).toHaveBeenCalled();
  });
});
