/**
 * Giving back the latest asset number (fork). The SQL itself was proved against
 * a real Postgres (latest, middle, several, none, other workspace); these tests
 * cover the switch and the rule that a failure never blocks a delete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
}));
vi.mock("~/database/db.server", () => ({
  db: {
    workspaceCustomisation: { findUnique: mocks.findUnique },
    $queryRaw: mocks.queryRaw,
  },
}));

import { releaseTrailingAssetNumbers } from "./release-numbers.server";

beforeEach(() => {
  mocks.findUnique.mockReset().mockResolvedValue(null);
  mocks.queryRaw.mockReset().mockResolvedValue([]);
});

describe("releaseTrailingAssetNumbers", () => {
  it("moves the counter back and says so, when there's a trailing gap", async () => {
    mocks.queryRaw.mockResolvedValue([{ v: "19" }]);
    expect(await releaseTrailingAssetNumbers("org1")).toBe(true);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
  it("is on by default, with no saved setting", async () => {
    await releaseTrailingAssetNumbers("org1");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
  it("does nothing when the counter is already at the highest number", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    expect(await releaseTrailingAssetNumbers("org1")).toBe(false);
  });
  it("does nothing, and runs no SQL, when switched off", async () => {
    mocks.findUnique.mockResolvedValue({ reuseLatestNumber: false });
    expect(await releaseTrailingAssetNumbers("org1")).toBe(false);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
  it("reads the setting for the right workspace", async () => {
    await releaseTrailingAssetNumbers("org-xyz");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { organizationId: "org-xyz" },
      select: { reuseLatestNumber: true },
    });
  });
  it("never throws: a database error can't stop an asset being deleted", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("relation does not exist"));
    await expect(releaseTrailingAssetNumbers("org1")).resolves.toBe(false);
    mocks.findUnique.mockRejectedValue(new Error("db down"));
    await expect(releaseTrailingAssetNumbers("org1")).resolves.toBe(false);
  });
  it("sets the counter only from this workspace's own assets and sequence", async () => {
    await releaseTrailingAssetNumbers("org1");
    const [strings, ...values] = mocks.queryRaw.mock.calls[0] as [
      string[],
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toMatch(/WHERE "organizationId" = \?/);
    expect(sql).toMatch(/last_value > m\.max_num/); // only ever moves the counter DOWN
    expect(sql).toMatch(/_asset_sequence/);
    expect(values.every((v) => v === "org1")).toBe(true);
  });
});
