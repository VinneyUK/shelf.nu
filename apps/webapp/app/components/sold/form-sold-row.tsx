/**
 * "Sold" row in the edit asset form: sold or not, the date and the price.
 * Saved with the form. Part of the sold feature; not in upstream Shelf.
 */
import { useState } from "react";
import FormRow from "~/components/forms/form-row";
import { SOLD_FIELDS } from "~/modules/sold/constants";
import { useSale } from "./use-sale";


const inputClass =
  "rounded border border-gray-300 px-3 py-2 text-sm font-normal";

export function FormSoldRow({ assetId }: { assetId: string }) {
  const sale = useSale(assetId);
  const [sold, setSold] = useState<boolean | null>(null);
  const isSold = sold ?? Boolean(sale);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <FormRow
      rowLabel="Sold"
      subHeading="Mark the asset as sold, with the date and what it went for."
      className="pt-[10px]"
    >
      <div className="flex w-full flex-col gap-3">
        {/* Always sent, so unticking means "not sold" */}
        <input
          type="hidden"
          name={SOLD_FIELDS.sold}
          value={isSold ? "true" : "false"}
        />
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            className="size-4 rounded border-gray-300"
            checked={isSold}
            onChange={(e) => setSold(e.target.checked)}
          />
          This asset has been sold
        </label>
        {isSold ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Date sold
              <input
                type="date"
                name={SOLD_FIELDS.soldOn}
                defaultValue={sale?.soldOn ?? today}
                max={today}
                required
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Sale price
              <input
                type="number"
                name={SOLD_FIELDS.price}
                defaultValue={sale?.price ?? ""}
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
                className={inputClass}
              />
            </label>
          </div>
        ) : null}
      </div>
    </FormRow>
  );
}
