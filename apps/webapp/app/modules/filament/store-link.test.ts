import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ filamentImage: { upsert: vi.fn() } }));
vi.mock("~/database/db.server", () => ({ db }));
const store = vi.hoisted(() => ({
  variantsOnProduct: vi.fn(),
  downloadImage: vi.fn(),
}));
vi.mock("./bambu-store.server", async (original) => ({
  ...(await original<typeof StoreModule>()),
  variantsOnProduct: store.variantsOnProduct,
  downloadImage: store.downloadImage,
}));

import { barFill, barTrack, LEVEL_COLOURS } from "~/components/filament/parts";
import { productFromStoreUrl } from "./bambu-store.server";
import type * as StoreModule from "./bambu-store.server";
import { linkStorePage } from "./images.server";

const variant = (colourName: string, over: Record<string, unknown> = {}) => ({
  productName: "PLA Basic",
  productUrl: "https://uk.store.bambulab.com/products/pla-basic-filament",
  colourName,
  filamentCode: colourName === "Pink" ? "10203" : "10100",
  imageUrl: `https://store.example/${colourName}.png`,
  price: 16.99,
  discountPrice: null,
  kind: "Filament with spool",
  size: "1 kg",
  ...over,
});

beforeEach(() => {
  db.filamentImage.upsert.mockReset().mockResolvedValue({});
  store.downloadImage.mockReset().mockResolvedValue({
    bytes: new Uint8Array([1]),
    contentType: "image/png",
  });
});

describe("a Bambu store page's address", () => {
  it("gives the product it's for, from any region or language path", () => {
    expect(
      productFromStoreUrl(
        "https://uk.store.bambulab.com/products/pla-basic-filament"
      )
    ).toBe("pla-basic-filament");
    expect(
      productFromStoreUrl(
        "https://eu.store.bambulab.com/en-gb/products/pla-matte?id=1#x"
      )
    ).toBe("pla-matte");
  });
  it("is refused when it isn't a Bambu store product page", () => {
    expect(
      productFromStoreUrl("https://example.com/products/pla-basic")
    ).toBeNull();
    expect(
      productFromStoreUrl("http://uk.store.bambulab.com/products/pla-basic")
    ).toBeNull();
    expect(
      productFromStoreUrl("https://uk.store.bambulab.com/collections/pla")
    ).toBeNull();
    expect(productFromStoreUrl("not a link")).toBeNull();
  });
});

describe("linking a filament to its store page", () => {
  it("takes the picture, the box code and the page from its colour there", async () => {
    store.variantsOnProduct.mockResolvedValue({
      all: [variant("Jade White"), variant("Pink")],
      matching: [variant("Pink")],
    });
    const result = await linkStorePage(
      "o1",
      { type: "PLA Basic", colourName: "Pink", filamentCode: null },
      "https://uk.store.bambulab.com/products/pla-basic-filament"
    );
    expect(result).toEqual({
      productUrl: "https://uk.store.bambulab.com/products/pla-basic-filament",
      filamentCode: "10203",
      picture: true,
    });
    expect(db.filamentImage.upsert.mock.calls[0][0].update).toMatchObject({
      status: "found",
      productUrl: "https://uk.store.bambulab.com/products/pla-basic-filament",
      filamentCode: "10203",
      sourceUrl: "https://store.example/Pink.png",
    });
  });
  it("says which colours the page sells when yours isn't one", async () => {
    store.variantsOnProduct.mockResolvedValue({
      all: [variant("Jade White"), variant("Black")],
      matching: [],
    });
    await expect(
      linkStorePage(
        "o1",
        { type: "PLA Basic", colourName: "Pink", filamentCode: null },
        "https://uk.store.bambulab.com/products/pla-basic-filament"
      )
    ).rejects.toThrow(
      "That page doesn't sell Pink. Its colours: Jade White, Black."
    );
  });
  it("refuses an address that isn't a store product page", async () => {
    await expect(
      linkStorePage(
        "o1",
        { type: "PLA Basic", colourName: "Pink", filamentCode: null },
        "https://example.com/pink.png"
      )
    ).rejects.toThrow(/isn't a Bambu store product page/);
  });
});

describe("the bar's colour", () => {
  it("is Claude's usage colours: blue with plenty, amber when low, red when nearly gone", () => {
    expect(barFill(100).backgroundColor).toBe(LEVEL_COLOURS.plenty);
    expect(barFill(26).backgroundColor).toBe(LEVEL_COLOURS.plenty);
    expect(barFill(25).backgroundColor).toBe(LEVEL_COLOURS.low);
    expect(barFill(11).backgroundColor).toBe(LEVEL_COLOURS.low);
    expect(barFill(10).backgroundColor).toBe(LEVEL_COLOURS.nearlyGone);
    expect(barFill(0).backgroundColor).toBe(LEVEL_COLOURS.nearlyGone);
    expect(barFill(140).width).toBe("100%");
  });

  it("puts a faint wash of the same colour behind it", () => {
    expect(barTrack(60).backgroundColor).toBe(`${LEVEL_COLOURS.plenty}2e`);
    expect(barTrack(5).backgroundColor).toBe(`${LEVEL_COLOURS.nearlyGone}2e`);
  });
});
