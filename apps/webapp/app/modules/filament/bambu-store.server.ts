/**
 * The Bambu Lab store (fork): finds a filament's colour variant and its picture.
 *
 * The store has no official API. Its pages read an unauthenticated JSON API,
 * documented by Part-DB's Bambu Lab provider: POST .../product/globalSearchV2
 * to search, GET .../product/queryById?seoCode= for a product, whose
 * productSkuList holds one entry per variant (colour, refill or spool, size),
 * each with its own picture, prices and code ("Charcoal (11101)").
 *
 * Because it is unofficial and could change or refuse us, it is used politely:
 * requests are spaced out, products are cached for a day, and after a refusal
 * (403, 429, 503) nothing is sent for an hour. Every failure is reported, not
 * thrown at the page.
 */

const API = "https://eu-store-api.bambulab.com"; // the UK store's API host
const STORE = "https://uk.store.bambulab.com";
const HEADERS = {
  Accept: "application/json",
  "Bbl-Locale": "en-US",
  "X-BBL-STORE-REGION": "UK",
};
const SPACING_MS = 3000;
const PRODUCT_TTL_MS = 24 * 60 * 60 * 1000;
const PAUSE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

type Sku = {
  id?: string | number;
  skuCode?: string | null;
  price?: number | null;
  discountPrice?: number | null;
  mediaFile?: { url?: string } | null;
  productSkuPropertyList?: { propertyKey?: string; propertyValue?: string }[];
};
type Product = { seoCode?: string; name?: string; productSkuList?: Sku[] };
type SearchRecord = { seoCode?: string; name?: string };

export type Variant = {
  productName: string;
  productUrl: string;
  colourName: string;
  filamentCode: string | null;
  imageUrl: string | null;
  price: number | null;
  discountPrice: number | null;
  /** "Refill", "Filament with spool", … as the store words it */
  kind: string | null;
  /** "1 kg", … as the store words it */
  size: string | null;
};

// ---- politeness, shared by everything in this process
let nextAllowedAt = 0;
let pausedUntil = 0;
const productCache = new Map<string, { at: number; product: Product }>();

/** For tests. */
export function resetStoreState() {
  nextAllowedAt = 0;
  pausedUntil = 0;
  productCache.clear();
}

export type Deps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

async function politeFetch(
  url: string,
  init: RequestInit,
  deps: Deps
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (now() < pausedUntil) {
    throw new StoreError(
      `The Bambu store asked us to slow down, so lookups are paused until ${new Date(
        pausedUntil
      ).toLocaleTimeString("en-GB")}.`
    );
  }
  const wait = nextAllowedAt - now();
  if (wait > 0) await sleep(wait);
  nextAllowedAt = now() + SPACING_MS;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new StoreError("Couldn't reach the Bambu store.");
  }
  if ([403, 429, 503].includes(response.status)) {
    pausedUntil = now() + PAUSE_MS;
    throw new StoreError(
      "The Bambu store refused the request; lookups are paused for an hour."
    );
  }
  if (!response.ok)
    throw new StoreError(`The Bambu store answered ${response.status}.`);
  return response;
}

/** The API answers 200 always, with code 1 for success. */
async function api<T>(path: string, init: RequestInit, deps: Deps): Promise<T> {
  const response = await politeFetch(
    `${API}${path}`,
    { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } },
    deps
  );
  const body = (await response.json()) as {
    code?: number;
    message?: string;
    data?: T;
  };
  if (Number(body.code) !== 1)
    throw new StoreError(
      `The Bambu store said: ${body.message ?? "unknown error"}`
    );
  return body.data as T;
}

export async function searchProducts(
  keyword: string,
  deps: Deps = {}
): Promise<SearchRecord[]> {
  const data = await api<{ page?: { records?: SearchRecord[] } }>(
    "/mall-goods/product/globalSearchV2",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: keyword, current: 1, size: 10 }),
    },
    deps
  );
  return (data?.page?.records ?? []).filter((r) => r && r.seoCode);
}

export async function getProduct(
  seoCode: string,
  deps: Deps = {}
): Promise<Product> {
  const now = (deps.now ?? Date.now)();
  const cached = productCache.get(seoCode);
  if (cached && now - cached.at < PRODUCT_TTL_MS) return cached.product;
  const product = await api<Product>(
    `/mall-goods/product/queryById?seoCode=${encodeURIComponent(seoCode)}`,
    { method: "GET" },
    deps
  );
  if (!product?.seoCode)
    throw new StoreError(`The Bambu store has no product "${seoCode}".`);
  productCache.set(seoCode, { at: now, product });
  return product;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

/** "Charcoal (11101)" → { name: "Charcoal", code: "11101" } */
export function splitColour(value: string): {
  name: string;
  code: string | null;
} {
  const m = value.match(/^(.*?)\s*\(([A-Z]?\d{4,6})\)\s*$/);
  return m
    ? { name: m[1].trim(), code: m[2] }
    : { name: value.trim(), code: null };
}

function variantOf(product: Product, sku: Sku): Variant {
  const props = sku.productSkuPropertyList ?? [];
  const colourProp =
    props.find((p) => /colou?r/i.test(p.propertyKey ?? "")) ?? props[0];
  const colour = splitColour(colourProp?.propertyValue ?? "");
  const kindProp = props.find((p) => /type/i.test(p.propertyKey ?? ""));
  return {
    productName: product.name ?? product.seoCode ?? "",
    productUrl: `${STORE}/products/${encodeURIComponent(
      product.seoCode ?? ""
    )}${sku.id ? `?id=${sku.id}` : ""}`,
    colourName: colour.name,
    filamentCode: sku.skuCode ?? colour.code,
    imageUrl: sku.mediaFile?.url ?? null,
    price: typeof sku.price === "number" ? sku.price : null,
    discountPrice:
      typeof sku.discountPrice === "number" ? sku.discountPrice : null,
    kind: kindProp?.propertyValue ?? null,
    size:
      props.find((p) => /size|weight/i.test(p.propertyKey ?? ""))
        ?.propertyValue ?? null,
  };
}

/** The product for a line: an exact name match, else the closest, else the first result. */
export function pickProduct(
  records: SearchRecord[],
  type: string
): SearchRecord | null {
  const t = norm(type);
  return (
    records.find((r) => norm(r.name ?? "") === t) ??
    records.find((r) => norm(r.name ?? "").startsWith(t)) ??
    records.find((r) => norm(r.name ?? "").includes(t)) ??
    records[0] ??
    null
  );
}

/**
 * The variant for a colour: by the code on the box when we have it, else by
 * colour name. The picture with the spool is preferred to the refill's, and
 * the 1 kg one to others.
 */
/** Every variant of one colour: by the code on the box when we have it, else by colour name. */
export function matchingVariants(
  variants: Variant[],
  colourName: string,
  code?: string | null
): Variant[] {
  const byCode = code
    ? variants.filter((v) => v.filamentCode === code.trim())
    : [];
  if (byCode.length) {
    // the code picks the colour; its other variants (refill, spool) share the name
    const name = byCode[0].colourName;
    return variants.filter((v) => norm(v.colourName) === norm(name));
  }
  return variants.filter((v) => norm(v.colourName) === norm(colourName));
}

export function pickVariant(
  variants: Variant[],
  colourName: string,
  code?: string | null
): Variant | null {
  const byCode = code
    ? variants.filter((v) => v.filamentCode === code.trim())
    : [];
  const byName = variants.filter(
    (v) => norm(v.colourName) === norm(colourName)
  );
  const pool = byCode.length ? byCode : byName;
  if (pool.length === 0) return null;
  const score = (v: Variant) =>
    (v.imageUrl ? 4 : 0) +
    (/spool/i.test(v.kind ?? "") && !/refill/i.test(v.kind ?? "") ? 2 : 0) +
    (/refill/i.test(v.kind ?? "") ? 0 : 1);
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/** Finds a filament on the UK store. Null if the store has no such line or colour. */
export async function findFilament(
  {
    type,
    colourName,
    code,
  }: { type: string; colourName: string; code?: string | null },
  deps: Deps = {}
): Promise<Variant | null> {
  const record = pickProduct(await searchProducts(type, deps), type);
  if (!record?.seoCode) return null;
  const product = await getProduct(record.seoCode, deps);
  const variants = (product.productSkuList ?? []).map((sku) =>
    variantOf(product, sku)
  );
  return pickVariant(variants, colourName, code);
}

/** Downloads a picture: an image, not too large. */
export async function downloadImage(
  url: string,
  deps: Deps = {}
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  const response = await politeFetch(url, { method: "GET" }, deps);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/"))
    throw new StoreError("The store's picture wasn't an image.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES)
    throw new StoreError("The store's picture was too large.");
  return {
    bytes: new Uint8Array(buffer),
    contentType: contentType.split(";")[0],
  };
}

/** Every variant of a filament's colour on the UK store, for its prices. Empty if the store doesn't sell it. */
export async function findFilamentVariants(
  {
    type,
    colourName,
    code,
  }: { type: string; colourName: string; code?: string | null },
  deps: Deps = {}
): Promise<Variant[]> {
  const record = pickProduct(await searchProducts(type, deps), type);
  if (!record?.seoCode) return [];
  const product = await getProduct(record.seoCode, deps);
  const variants = (product.productSkuList ?? []).map((sku) =>
    variantOf(product, sku)
  );
  return matchingVariants(variants, colourName, code);
}

/** Every variant of a product (colour, refill or spool, size). */
export function productVariants(product: Product): Variant[] {
  return (product.productSkuList ?? []).map((sku) => variantOf(product, sku));
}

/**
 * The product for a line, only when its name is the line's (exactly, or the
 * line followed by more words). Unlike pickProduct, never a best guess: a code
 * filed under the wrong line would mislead.
 */
export function exactProduct(
  records: SearchRecord[],
  type: string
): SearchRecord | null {
  const t = norm(type);
  return (
    records.find((r) => norm(r.name ?? "") === t) ??
    records.find((r) => norm(r.name ?? "").startsWith(`${t} `)) ??
    null
  );
}

/**
 * The product a Bambu store page is for, from its address
 * ("https://uk.store.bambulab.com/products/pla-basic-filament", any region or
 * language path). Null when it isn't a Bambu store product page.
 */
export function productFromStoreUrl(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/(^|\.)bambulab\.com$/i.test(url.hostname))
    return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.indexOf("products");
  const seo = at >= 0 ? parts[at + 1] : undefined;
  return seo && /^[a-z0-9-]+$/i.test(seo) ? decodeURIComponent(seo) : null;
}

/** Every variant of one colour on a given store product (by box code, else colour name). */
export async function variantsOnProduct(
  seoCode: string,
  wanted: { colourName: string; code?: string | null },
  deps: Deps = {}
): Promise<{ all: Variant[]; matching: Variant[] }> {
  const all = productVariants(await getProduct(seoCode, deps));
  return {
    all,
    matching: matchingVariants(all, wanted.colourName, wanted.code),
  };
}
