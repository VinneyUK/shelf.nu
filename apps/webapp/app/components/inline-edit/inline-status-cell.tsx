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
    return (
      <span className="flex flex-col items-start">
        <InlineCell
          assetId={assetId}
          current={{ field: "status", value: "SOLD" }}
        >
          {children}
        </InlineCell>
        <InlineCell
          assetId={assetId}
          current={{ field: "soldPrice", value: sale.price }}
          className="mt-0.5"
        >
          <span className="text-xs text-gray-500">
            {sale.price === null ? "Add sold price" : "Edit sold price"}
          </span>
        </InlineCell>
      </span>
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
