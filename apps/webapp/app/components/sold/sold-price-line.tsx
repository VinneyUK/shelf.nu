/**
 * Under the Value in the assets list: what a sold asset went for, as the same
 * small grey line quantity items use ("£800.00 × 2 pcs"). Uses the workspace's
 * own currency. Part of the sold feature; not in upstream Shelf.
 */
import type { Currency } from "@prisma/client";
import { formatCurrency } from "~/utils/currency";
import { useSale } from "./use-sale";

export function SoldPriceLine({
  assetId,
  currency,
  locale,
}: {
  assetId: string;
  currency: Currency;
  locale: string;
}) {
  const sale = useSale(assetId);
  if (!sale || sale.price === null) return null;
  return (
    <span className="block text-xs tabular-nums text-gray-500">
      Sold {formatCurrency({ value: sale.price, currency, locale })}
    </span>
  );
}
