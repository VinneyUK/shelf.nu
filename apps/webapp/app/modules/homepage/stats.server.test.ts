/**
 * The Homepage widget's figures (fork): the published keys, and how each is
 * counted. The database and the printer are pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asset: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  kit: { count: vi.fn() },
  spool: { findMany: vi.fn() },
  matterDevice: { count: vi.fn() },
  organization: { findFirst: vi.fn() },
  printer: vi.fn(),
}));
vi.mock("~/database/db.server", () => ({
  db: {
    asset: m.asset,
    kit: m.kit,
    spool: m.spool,
    matterDevice: m.matterDevice,
    organization: m.organization,
  },
}));
vi.mock("~/modules/filament/printer.server", () => ({
  printerStatus: m.printer,
}));
const {
  cachedHomepageStats,
  homepageOrganizationId,
  homepageStats,
  resetHomepageCache,
} = await import("./stats.server");

beforeEach(() => {
  vi.clearAllMocks();
  resetHomepageCache();
  delete process.env.HOMEPAGE_ORGANIZATION_ID;
  // total, available, sold, IoT assets
  m.asset.count
    .mockResolvedValueOnce(412)
    .mockResolvedValueOnce(398)
    .mockResolvedValueOnce(14)
    .mockResolvedValueOnce(31);
  m.asset.findMany.mockResolvedValue([
    { valuation: 7, quantity: 2 },
    { valuation: 99.99, quantity: null },
  ]);
  m.kit.count.mockResolvedValue(23);
  m.spool.findMany.mockResolvedValue([
    { amsSlot: 1, openedOn: new Date(), remainingPercent: 8 },
    { amsSlot: 2, openedOn: new Date(), remainingPercent: 45 },
    { amsSlot: null, openedOn: null, remainingPercent: 100 },
  ]);
  m.matterDevice.count.mockResolvedValue(44);
});

describe("homepageStats", () => {
  it("has the published keys, counted as agreed", async () => {
    m.printer.mockResolvedValue({
      state: "printing",
      job: { name: "bracket_v3.3mf", percent: 63, minutesLeft: 42 },
    });
    expect(await homepageStats("o1")).toEqual({
      assets: { total: 412, available: 398, sold: 14, value: 113.99 },
      boxes: { total: 23 },
      filament: { total: 3, in_use: 2, low: 1, opened: 2, new: 1 },
      prints: { active: 1, progress: 63, name: "bracket_v3.3mf", eta_min: 42 },
      iot: { assets: 31, devices: 44 },
      updated: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it("has nulls for the print when the printer is idle or unreachable", async () => {
    m.printer.mockRejectedValue(new Error("offline"));
    expect((await homepageStats("o1")).prints).toEqual({
      active: 0,
      progress: null,
      name: null,
      eta_min: null,
    });
  });

  it("is kept 30 seconds", async () => {
    m.printer.mockResolvedValue({ state: "idle", job: null });
    const a = await cachedHomepageStats("o1", 1000);
    const b = await cachedHomepageStats("o1", 20_000);
    expect(b).toBe(a);
    expect(m.kit.count).toHaveBeenCalledTimes(1);
  });
});

describe("homepageOrganizationId", () => {
  it("is HOMEPAGE_ORGANIZATION_ID, else the workspace with the most assets", async () => {
    process.env.HOMEPAGE_ORGANIZATION_ID = "chosen";
    expect(await homepageOrganizationId()).toBe("chosen");
    delete process.env.HOMEPAGE_ORGANIZATION_ID;
    m.asset.groupBy.mockResolvedValue([{ organizationId: "biggest" }]);
    expect(await homepageOrganizationId()).toBe("biggest");
  });
});
