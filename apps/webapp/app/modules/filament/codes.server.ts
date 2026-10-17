/**
 * Bambu's box codes (fork): for every line in the catalogue, the store's
 * colour variants and their codes, so a code finds its filament even if you've
 * never owned it. Built in the background, at the store client's polite pace,
 * and refreshed weekly.
 */
import { db } from "~/database/db.server";
import { Logger } from "~/utils/logger";
import {
  exactProduct,
  getProduct,
  productVariants,
  searchProducts,
  StoreError,
} from "./bambu-store.server";
import { BAMBU_TYPES, type KnownCode } from "./catalogue";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Store = {
  searchProducts: typeof searchProducts;
  getProduct: typeof getProduct;
};

/**
 * Reads every line's codes from the store and keeps them. Returns how many
 * codes it found and which lines it couldn't match. Stops if the store pauses.
 */
export async function buildCodeTable(
  organizationId: string,
  store: Store = { searchProducts, getProduct }
): Promise<{ codes: number; unmatched: string[]; stopped: boolean }> {
  let codes = 0;
  const unmatched: string[] = [];
  for (const [type] of BAMBU_TYPES) {
    try {
      const record = exactProduct(await store.searchProducts(type), type);
      if (!record?.seoCode) {
        unmatched.push(type);
        continue;
      }
      const variants = productVariants(await store.getProduct(record.seoCode));
      const seen = new Set<string>();
      for (const v of variants) {
        const code = v.filamentCode?.trim();
        if (!code || !v.colourName || seen.has(code)) continue;
        seen.add(code);
        await db.filamentCode.upsert({
          where: { organizationId_code: { organizationId, code } },
          create: { organizationId, code, type, colourName: v.colourName },
          update: { type, colourName: v.colourName, checkedAt: new Date() },
        });
        codes += 1;
      }
    } catch (cause) {
      if (cause instanceof StoreError && /paused/i.test(cause.message)) {
        return { codes, unmatched, stopped: true };
      }
      unmatched.push(type);
    }
  }
  return { codes, unmatched, stopped: false };
}

let running = false;

/** Rebuilds the code table in the background when it's empty or a week old. */
export async function refreshCodesIfStale(
  organizationId: string,
  store?: Store
) {
  if (running) return false;
  const latest = await db.filamentCode.findFirst({
    where: { organizationId },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true },
  });
  if (latest && Date.now() - latest.checkedAt.getTime() < WEEK_MS) return false;
  running = true;
  void buildCodeTable(organizationId, store)
    .catch((cause) => Logger.error(cause))
    .finally(() => {
      running = false;
    });
  return true;
}

/** The codes the store gave, for the search. */
export async function storeCodes(organizationId: string): Promise<KnownCode[]> {
  const rows = await db.filamentCode.findMany({
    where: { organizationId },
    select: { code: true, type: true, colourName: true },
  });
  return rows;
}
