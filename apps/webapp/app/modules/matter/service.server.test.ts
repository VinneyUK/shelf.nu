/**
 * Matter codes on assets (fork): kept encrypted, looked up, revealed only on
 * asking. The database and the CSA's register are pretend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asset: { findFirst: vi.fn() },
  matter: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("~/database/db.server", () => ({
  db: { asset: m.asset, assetMatter: m.matter },
}));
vi.mock("~/utils/secret-box.server", () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\((.*)\)$/, "$1"),
}));
const { getMatter, lookupDevice, revealMatter, saveMatterCode } = await import(
  "./service.server"
);

beforeEach(() => {
  vi.clearAllMocks();
  m.asset.findFirst.mockResolvedValue({ id: "a1", title: "Kettle plug" });
});

describe("saveMatterCode", () => {
  it("keeps the QR text and manual code encrypted, with the maker and model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("vendorinfo")
                ? { vendorInfo: { vendorName: "Test Vendor" } }
                : { model: { productName: "Test Plug" } }
            ),
        })
      )
    );
    await saveMatterCode("o1", "a1", "MT:Y.K9042C00KA0648G00");
    const data = m.matter.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({
      organizationId: "o1",
      assetId: "a1",
      payload: "enc(MT:Y.K9042C00KA0648G00)",
      manualCode: "enc(3497-011-2332)",
      vendorId: 0xfff1,
      productId: 0x8000,
      vendorName: "Test Vendor",
      productName: "Test Plug",
    });
    vi.unstubAllGlobals();
  });

  it("takes the 11 digits alone, without a QR to redraw", async () => {
    await saveMatterCode("o1", "a1", "3497 011 2332");
    expect(m.matter.upsert.mock.calls[0][0].create).toMatchObject({
      payload: null,
      manualCode: "enc(3497-011-2332)",
      vendorId: null,
    });
  });

  it("says plainly what's wrong with a code that isn't one", async () => {
    await expect(saveMatterCode("o1", "a1", "34970112333")).rejects.toThrow(
      /mistyped/
    );
  });

  it("refuses an asset from another workspace", async () => {
    m.asset.findFirst.mockResolvedValue(null);
    await expect(saveMatterCode("o2", "a1", "34970112332")).rejects.toThrow(
      /doesn't exist/
    );
  });
});

describe("what's sent to the page", () => {
  it("never includes the code unless it's revealed", async () => {
    m.matter.findFirst.mockResolvedValue({
      payload: "enc(MT:Y.K9042C00KA0648G00)",
      manualCode: "enc(3497-011-2332)",
      vendorId: 1,
      productId: 2,
      vendorName: null,
      productName: null,
      transport: "Thread",
      firmware: null,
      mac: null,
      controllers: [],
      createdAt: new Date(),
    });
    const shown = await getMatter("o1", "a1");
    expect(JSON.stringify(shown)).not.toMatch(/3497|MT:/);
    expect(shown?.hasQr).toBe(true);
    expect(await revealMatter("o1", "a1")).toEqual({
      manualCode: "3497-011-2332",
      payload: "MT:Y.K9042C00KA0648G00",
    });
  });
});

describe("lookupDevice", () => {
  it("gives nulls when the register doesn't know it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
      )
    );
    expect(await lookupDevice(1, 2)).toEqual({
      vendorName: null,
      productName: null,
    });
    vi.unstubAllGlobals();
  });
});
