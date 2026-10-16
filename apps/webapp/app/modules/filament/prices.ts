/**
 * Filament prices (fork), pure: what a colour's store variants boil down to.
 * Shared by the server and the pages.
 */

export type StoreVariant = {
  kind: string | null;
  size: string | null;
  price: number | null;
  discountPrice: number | null;
};

export type PriceLine = { now: number; was: number | null };

export type PriceSummary = {
  /** The 1 kg spool, with spool */
  spool: PriceLine | null;
  /** The 1 kg refill, without spool */
  refill: PriceLine | null;
  /** The lowest price now, of the two */
  best: number | null;
  onOffer: boolean;
};

const isRefill = (v: StoreVariant) => /refill/i.test(v.kind ?? "");
const isOneKilo = (v: StoreVariant) =>
  !v.size || /(^|\D)1\s*kg|1000\s*g/i.test(v.size);
/** A discount counts only when it's a real, lower price. */
const discounted = (v: StoreVariant) =>
  v.discountPrice !== null &&
  v.price !== null &&
  v.discountPrice > 0 &&
  v.discountPrice < v.price;
const nowPrice = (v: StoreVariant) =>
  discounted(v) ? (v.discountPrice as number) : (v.price as number);

function line(
  variants: StoreVariant[],
  want: (v: StoreVariant) => boolean
): PriceLine | null {
  const pick = variants
    .filter((v) => v.price !== null && want(v) && isOneKilo(v))
    .sort((a, b) => nowPrice(a) - nowPrice(b))[0];
  if (!pick) return null;
  return {
    now: nowPrice(pick),
    was: discounted(pick) ? (pick.price as number) : null,
  };
}

/** The 1 kg spool and refill prices of a colour, the best of them, and whether either is on offer. */
export function priceSummary(
  variants: StoreVariant[] | null | undefined
): PriceSummary {
  const list = variants ?? [];
  const spool = line(list, (v) => !isRefill(v));
  const refill = line(list, isRefill);
  const nows = [spool, refill]
    .filter((p): p is PriceLine => p !== null)
    .map((p) => p.now);
  return {
    spool,
    refill,
    best: nows.length ? Math.min(...nows) : null,
    onOffer: Boolean(spool?.was || refill?.was),
  };
}
