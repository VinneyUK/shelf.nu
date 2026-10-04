/**
 * Under the Value on the asset overview: what the asset sold for, and when.
 * Part of the sold feature; not in upstream Shelf.
 */
import type { Currency } from "@prisma/client";
import { formatCurrency } from "~/utils/currency";
import { useSale } from "./use-sale";

export function SoldValueNote({
  assetId,
  currency,
  locale,
}: {
  assetId: string;
  currency: Currency;
  locale: string;
}) {
  const sale = useSale(assetId);
  if (!sale) return null;
  const when = new Date(`${sale.soldOn}T00:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <p className="mt-1 text-sm text-gray-500">
      Sold {when}
      {sale.price !== null
        ? ` for ${formatCurrency({ value: sale.price, currency, locale })}`
        : ""}
    </p>
  );
}
