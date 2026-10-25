/**
 * IoT on the asset (fork): its type and protocol saved, and its two IoT tags
 * kept in step. The database is pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asset: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  tag: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db: { asset: m.asset, tag: m.tag } }));
const { saveIotSettings } = await import("./asset-settings.server");

beforeEach(() => vi.clearAllMocks());

describe("saveIotSettings", () => {
  it("saves the type and protocol and adds them as tags", async () => {
    m.asset.findFirst.mockResolvedValue({
      iotType: null,
      iotProtocol: null,
      category: { name: "IoT" },
      tags: [],
    });
    m.tag.findFirst
      .mockResolvedValueOnce({ id: "t-plug" })
      .mockResolvedValueOnce(null);
    m.tag.create.mockResolvedValue({ id: "t-matter" });
    await saveIotSettings({
      organizationId: "o1",
      userId: "u1",
      assetId: "a1",
      iotType: "Smart plug",
      iotProtocol: "Matter",
    });
    expect(m.asset.updateMany.mock.calls[0][0].data).toEqual({
      iotType: "Smart plug",
      iotProtocol: "Matter",
    });
    expect(m.tag.create.mock.calls[0][0].data).toMatchObject({
      name: "Matter",
      organizationId: "o1",
    });
    expect(m.asset.update.mock.calls[0][0].data.tags).toEqual({
      disconnect: [],
      connect: [{ id: "t-plug" }, { id: "t-matter" }],
    });
  });

  it("swaps the protocol's tag, leaving tags you added alone", async () => {
    m.asset.findFirst.mockResolvedValue({
      iotType: "Bulb",
      iotProtocol: "Zigbee",
      category: { name: "IoT" },
      tags: [
        { id: "t-bulb", name: "Bulb" },
        { id: "t-zig", name: "Zigbee" },
        { id: "t-hall", name: "Hall" },
      ],
    });
    m.tag.findFirst.mockResolvedValue({ id: "t-matter" });
    await saveIotSettings({
      organizationId: "o1",
      userId: "u1",
      assetId: "a1",
      iotType: "Bulb",
      iotProtocol: "Matter",
    });
    expect(m.asset.update.mock.calls[0][0].data.tags).toEqual({
      disconnect: [{ id: "t-zig" }],
      connect: [{ id: "t-matter" }],
    });
  });

  it("does nothing on an asset that isn't IoT, and ignores unknown values", async () => {
    m.asset.findFirst.mockResolvedValue({
      iotType: null,
      iotProtocol: null,
      category: { name: "Kitchen" },
      tags: [],
    });
    await saveIotSettings({
      organizationId: "o1",
      userId: "u1",
      assetId: "a1",
      iotType: "Bulb",
      iotProtocol: "Matter",
    });
    expect(m.asset.updateMany).not.toHaveBeenCalled();
    m.asset.findFirst.mockResolvedValue({
      iotType: null,
      iotProtocol: null,
      category: { name: "IoT" },
      tags: [],
    });
    await saveIotSettings({
      organizationId: "o1",
      userId: "u1",
      assetId: "a1",
      iotType: "Toaster",
      iotProtocol: "Morse",
    });
    expect(m.asset.updateMany.mock.calls[0][0].data).toEqual({
      iotType: null,
      iotProtocol: null,
    });
  });
});
