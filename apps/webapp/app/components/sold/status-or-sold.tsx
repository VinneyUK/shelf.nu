/**
 * The asset's status — or "Sold", if it's been sold.
 * Part of the sold feature; not in upstream Shelf.
 *
 * Wraps Shelf's AssetStatusBadge rather than changing it, so Shelf's own
 * status logic (and its tests) are untouched.
 */
import type { ComponentProps } from "react";
import { AssetStatusBadge } from "~/components/assets/asset-status-badge";
import { Badge } from "~/components/shared/badge";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { formatCurrency } from "~/utils/currency";
import { useSale } from "./use-sale";

export function StatusOrSold(props: ComponentProps<typeof AssetStatusBadge>) {
  const sale = useSale(props.id);
  const organization = useCurrentOrganization();
  if (!sale) return <AssetStatusBadge {...props} />;

  const when = new Date(`${sale.soldOn}T00:00:00`).toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
  const price =
    sale.price !== null && organization
      ? ` for ${formatCurrency({
          value: sale.price,
          currency: organization.currency,
          locale:
            typeof navigator === "undefined" ? "en-GB" : navigator.language,
        })}`
      : "";
  return (
    <span title={`Sold ${when}${price}`}>
      <Badge color="#6E7787" withDot={false}>
        Sold
      </Badge>
    </span>
  );
}
