/**
 * Filament prices (fork): each filament on hand gets its UK store prices,
 * checked at most once a day, in the background, at the store client's polite
 * pace. Opening the Filament page refreshes what's stale; Check prices forces it.
 */
import type { Prisma } from "@prisma/client";
import { db } from "~/database/db.server";
import { Logger } from "~/utils/logger";
import { findFilamentVariants, StoreError } from "./bambu-store.server";
import { filamentKey } from "./catalogue";
import { priceSummary, type StoreVariant } from "./prices";

const STALE_MS = 24 * 60 * 60 * 1000;

type Wanted = { type: string; colourName: string; filamentCode: string | null };
type Store = { findFilamentVariants: typeof findFilamentVariants };

/** Checks one filament's prices and keeps them. */
export async function refreshPrice(
  organizationId: string,
  wanted: Wanted,
  store: Store = { findFilamentVariants }
): Promise<"found" | "missing" | "error"> {
  const key = filamentKey(wanted.type, wanted.colourName);
  const save = (data: {
    status: string;
    variants?: Prisma.InputJsonValue;
    productUrl?: string | null;
    message?: string | null;
  }) =>
    db.filamentPrice.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, ...data },
      update: { ...data, checkedAt: new Date() },
    });
  try {
    const variants = await store.findFilamentVariants({
      type: wanted.type,
      colourName: wanted.colourName,
      code: wanted.filamentCode,
    });
    if (variants.length === 0) {
      await save({
        status: "missing",
        message: "The Bambu store doesn't list this line and colour.",
      });
      return "missing";
    }
    const kept: StoreVariant[] = variants.map((v) => ({
      kind: v.kind,
      size: v.size,
      price: v.price,
      discountPrice: v.discountPrice,
    }));
    await save({
      status: "found",
      variants: kept,
      productUrl: variants[0].productUrl,
      message: null,
    });
    return "found";
  } catch (cause) {
    await save({
      status: "error",
      message:
        cause instanceof StoreError
          ? cause.message
          : "Couldn't check the price.",
    });
    return "error";
  }
}

let running = false;

/**
 * Checks the prices of every filament on hand that's due (older than a day,
 * or all of them when forced), one at a time, in the background. Only one run
 * at a time; returns false if one is already going.
 */
export function refreshStalePrices(
  organizationId: string,
  { force = false }: { force?: boolean } = {},
  store?: Store
) {
  if (running) return false;
  running = true;
  void (async () => {
    try {
      const [spools, known] = await Promise.all([
        db.spool.findMany({
          where: { organizationId, status: { not: "retired" } },
          select: { type: true, colourName: true, filamentCode: true },
        }),
        db.filamentPrice.findMany({
          where: { organizationId },
          select: { key: true, checkedAt: true },
        }),
      ]);
      const checked = new Map(known.map((k) => [k.key, k.checkedAt.getTime()]));
      const seen = new Set<string>();
      for (const s of spools) {
        const key = filamentKey(s.type, s.colourName);
        if (seen.has(key)) continue;
        seen.add(key);
        const last = checked.get(key);
        if (!force && last !== undefined && Date.now() - last < STALE_MS)
          continue;
        const result = await refreshPrice(organizationId, s, store);
        if (result === "error") {
          const row = await db.filamentPrice.findUnique({
            where: { organizationId_key: { organizationId, key } },
            select: { message: true },
          });
          if (row?.message && /paused/i.test(row.message)) break; // the store won't answer the rest
        }
      }
    } catch (cause) {
      Logger.error(cause);
    } finally {
      running = false;
    }
  })();
  return true;
}

/** Each filament's stored prices, for the pages. */
export async function priceStatuses(organizationId: string) {
  const rows = await db.filamentPrice.findMany({
    where: { organizationId },
    select: {
      key: true,
      status: true,
      variants: true,
      productUrl: true,
      message: true,
      checkedAt: true,
    },
  });
  return Object.fromEntries(
    rows.map((r) => [
      r.key,
      {
        status: r.status,
        variants: (Array.isArray(r.variants)
          ? r.variants
          : []) as StoreVariant[],
        productUrl: r.productUrl,
        message: r.message,
        checkedAt: r.checkedAt.toISOString(),
      },
    ])
  );
}

/** A store price, in pounds, for one filament as a spool or a refill (the other if only that's sold). */
function priceFor(
  variants: StoreVariant[] | null | undefined,
  packaging: string
) {
  const s = priceSummary(variants);
  const line =
    packaging === "refill" ? s.refill ?? s.spool : s.spool ?? s.refill;
  return line?.now ?? null;
}

/**
 * Today's store price for a filament, as a spool or a refill: from what's
 * kept if it's under a day old, else checked now. Null if the store hasn't one.
 */
export async function storePriceFor(
  organizationId: string,
  wanted: Wanted & { packaging: string },
  store?: Store
): Promise<number | null> {
  const key = filamentKey(wanted.type, wanted.colourName);
  const read = () =>
    db.filamentPrice.findUnique({
      where: { organizationId_key: { organizationId, key } },
      select: { variants: true, checkedAt: true, status: true },
    });
  let row = await read();
  if (!row || Date.now() - row.checkedAt.getTime() > STALE_MS) {
    await refreshPrice(organizationId, wanted, store);
    row = await read();
  }
  return row?.status === "found"
    ? priceFor(row.variants as StoreVariant[], wanted.packaging)
    : null;
}

/**
 * Fills in the price paid where it's missing, with the store's price that
 * Shelf already holds for that filament and type. Nothing else is touched.
 * Returns how many were filled, and how many had no store price to use.
 */
export async function fillMissingPrices(organizationId: string) {
  const [items, kept] = await Promise.all([
    db.spool.findMany({
      where: { organizationId, pricePaid: null },
      select: { id: true, type: true, colourName: true, packaging: true },
    }),
    db.filamentPrice.findMany({
      where: { organizationId, status: "found" },
      select: { key: true, variants: true },
    }),
  ]);
  const byKey = new Map(kept.map((k) => [k.key, k.variants as StoreVariant[]]));
  let filled = 0;
  for (const item of items) {
    const price = priceFor(
      byKey.get(filamentKey(item.type, item.colourName)),
      item.packaging
    );
    if (price === null) continue;
    await db.spool.update({
      where: { id: item.id, organizationId },
      data: { pricePaid: price },
    });
    filled += 1;
  }
  return { filled, unpriced: items.length - filled };
}
