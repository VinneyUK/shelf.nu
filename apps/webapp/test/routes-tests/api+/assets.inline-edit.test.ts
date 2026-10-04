/**
 * Inline editing endpoint (fork): each field goes to the right service, with
 * the right checks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateAsset: vi.fn(),
  updateKitAssets: vi.fn(),
  markAssetsSold: vi.fn(),
  markAssetsNotSold: vi.fn(),
  assetLocation: { findFirst: vi.fn() },
  assetKit: { findFirst: vi.fn() },
  assetSale: { findFirst: vi.fn() },
}));
vi.mock("~/modules/asset/service.server", () => ({
  updateAsset: mocks.updateAsset,
}));
vi.mock("~/modules/kit/service.server", () => ({
  updateKitAssets: mocks.updateKitAssets,
}));
vi.mock("~/modules/sold/service.server", () => ({
  markAssetsSold: mocks.markAssetsSold,
  markAssetsNotSold: mocks.markAssetsNotSold,
}));
vi.mock("~/database/db.server", () => ({
  db: {
    assetLocation: mocks.assetLocation,
    assetKit: mocks.assetKit,
    assetSale: mocks.assetSale,
    category: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    kit: { findMany: vi.fn() },
  },
}));
vi.mock("~/utils/roles.server", () => ({
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org1" }),
}));

import { action } from "~/routes/api+/assets.inline-edit";

const post = async (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const request = new Request("http://x/api/assets/inline-edit", {
    method: "POST",
    body,
  });
  const res = await action({
    request,
    params: {},
    context: { getSession: () => ({ userId: "u1" }) } as never,
  });
  return res;
};
const status = (res: unknown) =>
  (res as { init?: { status?: number } }).init?.status ?? 200;

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === "function") m.mockReset();
    else Object.values(m).forEach((fn) => fn.mockReset());
  }
});

describe("inline edit", () => {
  it("saves a description through updateAsset", async () => {
    await post({ assetId: "a1", field: "description", value: "  New text  " });
    expect(mocks.updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", description: "New text" })
    );
  });
  it("saves tags as a set", async () => {
    await post({ assetId: "a1", field: "tags", value: "t1,t2" });
    expect(mocks.updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { set: [{ id: "t1" }, { id: "t2" }] } })
    );
  });
  it("rejects a negative value and a fractional quantity", async () => {
    expect(
      status(await post({ assetId: "a1", field: "valuation", value: "-5" }))
    ).toBe(400);
    expect(
      status(await post({ assetId: "a1", field: "quantity", value: "1.5" }))
    ).toBe(400);
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
  it("moves a location with the current one as the 'from'", async () => {
    mocks.assetLocation.findFirst.mockResolvedValue({ locationId: "old" });
    await post({ assetId: "a1", field: "location", value: "new" });
    expect(mocks.updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        newLocationId: "new",
        currentLocationId: "old",
      })
    );
  });
  it("moves an asset from one box to another, leaving the first", async () => {
    mocks.assetKit.findFirst.mockResolvedValue({
      kitId: "k1",
      kit: { assetKits: [{ assetId: "a1" }, { assetId: "a2" }] },
    });
    await post({ assetId: "a1", field: "box", value: "k2" });
    expect(mocks.updateKitAssets).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kitId: "k1", assetIds: ["a2"] })
    );
    expect(mocks.updateKitAssets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kitId: "k2", assetIds: ["a1"], addOnly: true })
    );
  });
  it("marks sold with the date and price, and available as not sold", async () => {
    await post({
      assetId: "a1",
      field: "status",
      value: "SOLD",
      soldOn: "2026-10-04",
      price: "1000",
    });
    expect(mocks.markAssetsSold).toHaveBeenCalledWith(
      expect.objectContaining({
        assetIds: ["a1"],
        price: 1000,
        soldOn: new Date("2026-10-04T00:00:00.000Z"),
      })
    );
    await post({ assetId: "a1", field: "status", value: "AVAILABLE" });
    expect(mocks.markAssetsNotSold).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ["a1"] })
    );
  });
  it("edits the sold price keeping the sold date, and refuses when not sold", async () => {
    mocks.assetSale.findFirst.mockResolvedValue({
      soldOn: new Date("2026-01-02T00:00:00.000Z"),
    });
    await post({ assetId: "a1", field: "soldPrice", value: "250" });
    expect(mocks.markAssetsSold).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 250,
        soldOn: new Date("2026-01-02T00:00:00.000Z"),
      })
    );
    mocks.assetSale.findFirst.mockResolvedValue(null);
    expect(
      status(await post({ assetId: "a1", field: "soldPrice", value: "1" }))
    ).toBe(400);
  });
});
