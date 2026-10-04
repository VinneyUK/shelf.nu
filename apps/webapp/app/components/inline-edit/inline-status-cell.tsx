/**
 * Status in a list cell: Available or Sold. Choosing Sold asks for the date
 * and price; choosing Available marks it not sold. A sold asset also gets an
 * "Edit sold price" link. Checked out / in custody is changed from the
 * asset's page, not here.
 * Part of the inline editing feature; not in upstream Shelf.
 */
import type { ReactNode } from "react";
import { useSale } from "~/components/sold/use-sale";
import { InlineCell } from "./inline-cell";

export function InlineStatusCell({
  assetId,
  status,
  children,
}: {
  assetId: string;
  status: string;
  children: ReactNode;
}) {
  const sale = useSale(assetId);
  if (sale) {
    // The pen reopens the Sold box, prefilled with the date and price
    return (
      <InlineCell
        assetId={assetId}
        current={{
          field: "status",
          value: "SOLD",
          soldOn: sale.soldOn,
          price: sale.price,
        }}
      >
        {children}
      </InlineCell>
    );
  }
  return (
    <InlineCell
      assetId={assetId}
      current={{
        field: "status",
        value: status === "AVAILABLE" ? "AVAILABLE" : "OTHER",
      }}
    >
      {children}
    </InlineCell>
  );
}
