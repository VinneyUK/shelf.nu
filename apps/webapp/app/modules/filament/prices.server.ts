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
import type { StoreVariant } from "./prices";

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
