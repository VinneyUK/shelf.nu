import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  filamentImage: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  spool: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db }));
vi.mock("~/utils/logger", () => ({ Logger: { error: vi.fn() } }));

import { StoreError } from "./bambu-store.server";
import { ensureFilamentImage, getFilamentImage } from "./images.server";

const wanted = {
  type: "PLA Matte",
  colourName: "Charcoal",
  filamentCode: "11101",
};
const store = () => ({ findFilament: vi.fn(), downloadImage: vi.fn() });

beforeEach(() => {
  Object.values(db.filamentImage).forEach((f) => f.mockReset());
  Object.values(db.spool).forEach((f) => f.mockReset());
  db.spool.findMany.mockResolvedValue([]);
  db.filamentImage.findUnique.mockResolvedValue(null);
  db.filamentImage.upsert.mockResolvedValue({});
});

describe("getting a filament's picture", () => {
  it("finds it, downloads it once, and keeps it with its product link and code", async () => {
    const s = store();
    s.findFilament.mockResolvedValue({
      imageUrl: "https://cdn/x.jpg",
      productUrl: "https://uk.store.bambulab.com/products/pla-matte?id=2",
      filamentCode: "11101",
    });
    s.downloadImage.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("found");
    expect(s.findFilament).toHaveBeenCalledWith({
      type: "PLA Matte",
      colourName: "Charcoal",
      code: "11101",
    });
    const call = db.filamentImage.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      organizationId_key: { organizationId: "o1", key: "pla matte|charcoal" },
    });
    expect(call.create).toMatchObject({
      status: "found",
      contentType: "image/jpeg",
      filamentCode: "11101",
    });
  });
  it("doesn't ask again once it has the picture", async () => {
    db.filamentImage.findUnique.mockResolvedValue({
      status: "found",
      fetchedAt: new Date(),
    });
    const s = store();
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("kept");
    expect(s.findFilament).not.toHaveBeenCalled();
  });
  it("trusts 'not in the store' for a week, then asks again", async () => {
    const s = store();
    db.filamentImage.findUnique.mockResolvedValue({
      status: "missing",
      fetchedAt: new Date(),
    });
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("kept");
    db.filamentImage.findUnique.mockResolvedValue({
      status: "missing",
      fetchedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    });
    s.findFilament.mockResolvedValue(null);
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("missing");
  });
  it("records a store problem, in its words, and doesn't throw", async () => {
    const s = store();
    s.findFilament.mockRejectedValue(
      new StoreError(
        "The Bambu store refused the request; lookups are paused for an hour."
      )
    );
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("error");
    expect(db.filamentImage.upsert.mock.calls[0][0].create).toMatchObject({
      status: "error",
      message: expect.stringMatching(/paused/),
    });
  });
  it("tries again after an error (it isn't trusted like 'missing')", async () => {
    db.filamentImage.findUnique.mockResolvedValue({
      status: "error",
      fetchedAt: new Date(),
    });
    const s = store();
    s.findFilament.mockResolvedValue(null);
    expect(await ensureFilamentImage("o1", wanted, s)).toBe("missing");
  });
  it("serves only a found picture", async () => {
    db.filamentImage.findUnique.mockResolvedValue({
      status: "missing",
      bytes: null,
      contentType: null,
    });
    expect(await getFilamentImage("o1", "k")).toBeNull();
    db.filamentImage.findUnique.mockResolvedValue({
      status: "found",
      bytes: Buffer.from([9]),
      contentType: "image/png",
    });
    expect((await getFilamentImage("o1", "k"))?.contentType).toBe("image/png");
  });
});

describe("the code on the box", () => {
  it("is filled in from the store on this filament's spools that haven't one", async () => {
    db.spool.findMany.mockResolvedValue([
      { id: "a", type: "PLA Matte", colourName: "Charcoal" },
      { id: "b", type: "PLA Basic", colourName: "Black" },
    ]);
    const s = store();
    s.findFilament.mockResolvedValue({
      imageUrl: "https://cdn/x.jpg",
      productUrl: "u",
      filamentCode: "11101",
    });
    s.downloadImage.mockResolvedValue({
      bytes: new Uint8Array([1]),
      contentType: "image/jpeg",
    });
    await ensureFilamentImage("o1", wanted, s);
    expect(db.spool.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", id: { in: ["a"] } },
      data: { filamentCode: "11101" },
    });
  });
});
