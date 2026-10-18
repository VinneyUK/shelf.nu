/**
 * Quantities (fork): the times some of an asset was sold, on its page, each
 * with Undo (the sale goes and they come back). Shows nothing until there's one.
 */
import { useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { formatCurrency } from "~/utils/currency";
import { SOLD_URL } from "./use-sale";

type PartSale = {
  id: string;
  quantity: number;
  soldOn: string;
  price: number | null;
};

export function PartSalesCard({
  assetId,
  quantity,
}: {
  assetId: string;
  /** The asset's quantity now: when it changes, the list is asked for again */
  quantity: number | null;
}) {
  const list = useFetcher<{ partSales?: PartSale[] }>();
  const undo = useFetcher<{ success?: boolean }>();
  const revalidator = useRevalidator();
  const organization = useCurrentOrganization();

  useEffect(() => {
    void list.load(`${SOLD_URL}?assetId=${encodeURIComponent(assetId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, quantity]);

  useEffect(() => {
    if (undo.state === "idle" && undo.data?.success)
      void revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo.state, undo.data]);

  const sales = list.data?.partSales ?? [];
  if (sales.length === 0) return null;
  return (
    <Card className="mb-3 mt-0 py-3 md:border">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Sold so far</h3>
      <ul className="flex flex-col divide-y divide-gray-100">
        {sales.map((sale) => (
          <li key={sale.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 text-gray-700">
              <span className="font-medium text-gray-900">{sale.quantity}</span>{" "}
              on <DateS date={sale.soldOn} />
              {sale.price !== null
                ? ` for ${formatCurrency({
                    value: sale.price,
                    currency: organization?.currency ?? "GBP",
                    locale: "en-GB",
                  })}`
                : ""}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={undo.state !== "idle"}
              onClick={() =>
                void undo.submit(
                  {
                    intent: "undo-part",
                    partSaleId: sale.id,
                  },
                  { method: "post", action: SOLD_URL }
                )
              }
            >
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
