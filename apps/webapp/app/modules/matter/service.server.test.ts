/**
 * Matter devices on IoT assets (fork): several per asset, each counting
 * towards the quantity; codes kept encrypted and revealed only on asking.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asset: { findFirst: vi.fn(), updateMany: vi.fn() },
  device: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("~/database/db.server", () => ({
  db: { asset: m.asset, matterDevice: m.device },
}));
vi.mock("~/utils/secret-box.server", () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\((.*)\)$/, "$1"),
}));
const { addDevice, listDevices, removeDevice, revealDevice } = await import(
  "./service.server"
);
const { isIotCategory } = await import("./iot");
const iot = { id: "a1", title: "GRILLPLATS plug", category: { name: "IoT" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))
  );
});

describe("Matter devices", () => {
  it("knows the IoT category however it's written", () => {
    expect([
      isIotCategory("IoT"),
      isIotCategory(" iot "),
      isIotCategory("Internet of Things"),
      isIotCategory("Kitchen"),
      isIotCategory(null),
    ]).toEqual([true, true, true, false, false]);
  });
  it("adds a device, encrypted, and the quantity becomes the number of devices", async () => {
    m.asset.findFirst.mockResolvedValue(iot);
    m.device.count.mockResolvedValue(3);
    const out = await addDevice(
      "o1",
      "a1",
      "MT:Y.K9042C00KA0648G00",
      "Kitchen · kettle"
    );
    expect(m.device.create.mock.calls[0][0].data).toMatchObject({
      payload: "enc(MT:Y.K9042C00KA0648G00)",
      manualCode: "enc(3497-011-2332)",
      place: "Kitchen · kettle",
    });
    expect(m.asset.updateMany.mock.calls[0][0].data).toEqual({ quantity: 3 });
    expect(out.quantity).toBe(3);
  });
  it("only on an IoT asset, and says when a digit is mistyped", async () => {
    m.asset.findFirst.mockResolvedValue({
      ...iot,
      category: { name: "Kitchen" },
    });
    await expect(addDevice("o1", "a1", "34970112332")).rejects.toThrow(/IoT/);
    m.asset.findFirst.mockResolvedValue(iot);
    await expect(addDevice("o1", "a1", "34970112333")).rejects.toThrow(
      /mistyped/
    );
  });
  it("lists devices numbered, never with codes, and reveals one on asking", async () => {
    m.device.findMany.mockResolvedValue([
      {
        id: "d1",
        payload: "enc(MT:Y.K9042C00KA0648G00)",
        manualCode: "enc(3497-011-2332)",
        controllers: [],
        labelPrintedAt: null,
      },
      {
        id: "d2",
        payload: null,
        manualCode: "enc(1535-511-0751)",
        controllers: [],
        labelPrintedAt: new Date(),
      },
    ]);
    const list = await listDevices("o1", "a1");
    expect(list.map((d) => [d.number, d.hasQr])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/3497|1535|MT:/);
    m.device.findFirst.mockResolvedValue({
      manualCode: "enc(1535-511-0751)",
      payload: null,
    });
    expect(await revealDevice("o1", "d2")).toEqual({
      manualCode: "1535-511-0751",
      payload: null,
    });
  });
  it("takes the quantity down when a device is removed", async () => {
    m.device.findFirst.mockResolvedValue({ id: "d2", assetId: "a1" });
    m.device.count.mockResolvedValue(2);
    expect(await removeDevice("o1", "d2")).toBe(2);
    expect(m.asset.updateMany.mock.calls[0][0].data).toEqual({ quantity: 2 });
  });
});
