import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findFilament,
  pickProduct,
  pickVariant,
  resetStoreState,
  splitColour,
  StoreError,
} from "./bambu-store.server";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ code: 1, message: "success", data }), {
    status: 200,
  });
const sku = (
  id: string,
  colour: string,
  type: string,
  url: string | null,
  skuCode: string | null = null
) => ({
  id,
  price: 19.99,
  discountPrice: null,
  skuCode,
  mediaFile: url ? { url } : null,
  productSkuPropertyList: [
    { propertyKey: "Color", propertyValue: colour },
    { propertyKey: "Type", propertyValue: type },
    { propertyKey: "Size", propertyValue: "1 kg" },
  ],
});
const product = {
  seoCode: "pla-matte",
  name: "PLA Matte",
  productSkuList: [
    sku("1", "Charcoal (11101)", "Refill", "https://cdn/refill-charcoal.jpg"),
    sku(
      "2",
      "Charcoal (11101)",
      "Filament with spool",
      "https://cdn/spool-charcoal.jpg"
    ),
    sku(
      "3",
      "Ivory White (11100)",
      "Filament with spool",
      "https://cdn/spool-ivory.jpg"
    ),
  ],
};
const deps = (fetchImpl: unknown) => ({
  fetchImpl: fetchImpl as typeof fetch,
  sleep: () => Promise.resolve(),
  now: () => 1_000_000,
});

beforeEach(() => resetStoreState());

describe("finding a filament on the store", () => {
  it("searches for the line, opens the product, and picks the spool picture for the colour", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        ok({ page: { records: [{ seoCode: "pla-matte", name: "PLA Matte" }] } })
      )
      .mockResolvedValueOnce(ok(product));
    const v = await findFilament(
      { type: "PLA Matte", colourName: "Charcoal" },
      deps(f)
    );
    expect(v).toMatchObject({
      colourName: "Charcoal",
      filamentCode: "11101",
      imageUrl: "https://cdn/spool-charcoal.jpg",
    });
    expect(v?.productUrl).toBe(
      "https://uk.store.bambulab.com/products/pla-matte?id=2"
    );
    const [searchUrl, searchInit] = f.mock.calls[0];
    expect(searchUrl).toBe(
      "https://eu-store-api.bambulab.com/mall-goods/product/globalSearchV2"
    );
    expect(searchInit.method).toBe("POST");
    expect(searchInit.headers["X-BBL-STORE-REGION"]).toBe("UK");
    expect(JSON.parse(searchInit.body).content).toBe("PLA Matte");
    expect(f.mock.calls[1][0]).toBe(
      "https://eu-store-api.bambulab.com/mall-goods/product/queryById?seoCode=pla-matte"
    );
  });
  it("uses the code on the box over the colour name", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        ok({ page: { records: [{ seoCode: "pla-matte", name: "PLA Matte" }] } })
      )
      .mockResolvedValueOnce(ok(product));
    const v = await findFilament(
      { type: "PLA Matte", colourName: "something else", code: "11100" },
      deps(f)
    );
    expect(v?.colourName).toBe("Ivory White");
  });
  it("caches a product for a day, so a second colour needs no second product request", async () => {
    const f = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("globalSearch")
          ? ok({
              page: {
                records: [{ seoCode: "pla-matte", name: "PLA Matte" }],
              },
            })
          : ok(product)
      )
    );
    await findFilament({ type: "PLA Matte", colourName: "Charcoal" }, deps(f));
    await findFilament(
      { type: "PLA Matte", colourName: "Ivory White" },
      deps(f)
    );
    expect(
      f.mock.calls.filter(([u]) => String(u).includes("queryById"))
    ).toHaveLength(1);
  });
  it("says so when the store reports an error", async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: "bad request" }), {
        status: 200,
      })
    );
    await expect(
      findFilament({ type: "PLA Matte", colourName: "Charcoal" }, deps(f))
    ).rejects.toThrow(/bad request/);
  });
  it("stops for an hour after a refusal, and says until when", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      findFilament({ type: "PLA Matte", colourName: "Charcoal" }, deps(f))
    ).rejects.toThrow(/paused for an hour/);
    await expect(
      findFilament({ type: "PLA Matte", colourName: "Charcoal" }, deps(f))
    ).rejects.toThrow(/paused until/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("turns a lost connection into a plain message", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      findFilament({ type: "PLA Matte", colourName: "Charcoal" }, deps(f))
    ).rejects.toBeInstanceOf(StoreError);
  });
});

describe("matching", () => {
  it("reads the colour and code", () => {
    expect(splitColour("Clear (32101)")).toEqual({
      name: "Clear",
      code: "32101",
    });
    expect(splitColour("Jade White")).toEqual({
      name: "Jade White",
      code: null,
    });
  });
  it("picks the product named like the line", () => {
    const records = [
      { seoCode: "pla-basic", name: "PLA Basic" },
      { seoCode: "pla-matte", name: "PLA Matte" },
    ];
    expect(pickProduct(records, "PLA Matte")?.seoCode).toBe("pla-matte");
    expect(pickProduct([], "PLA Matte")).toBeNull();
  });
  it("finds no variant for a colour the store doesn't sell", () => {
    expect(pickVariant([], "Charcoal")).toBeNull();
  });
});
