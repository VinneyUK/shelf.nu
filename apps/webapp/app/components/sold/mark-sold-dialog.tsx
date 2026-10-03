/**
 * "Mark as sold" dialog: date sold and sale price, for one asset or a bulk
 * selection. Part of the sold feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/shared/modal";
import { isFormProcessing } from "~/utils/form";
import { SOLD_URL } from "./use-sale";

const today = () => new Date().toISOString().slice(0, 10);

export function MarkSoldDialog({
  open,
  onOpenChange,
  assetIds,
  currentSearchParams,
  countLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  /** For a cross-page "select all" in the assets list */
  currentSearchParams?: string;
  /** e.g. "this asset" or "3 assets" */
  countLabel: string;
}) {
  const fetcher = useFetcher<{
    error?: { message: string };
    success?: boolean;
  }>();
  const busy = isFormProcessing(fetcher.state);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <fetcher.Form
          method="post"
          action={SOLD_URL}
          className="flex flex-col gap-4"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as sold</AlertDialogTitle>
            <AlertDialogDescription>
              Record the sale of {countLabel}. It stays in Shelf, shown as Sold,
              and appears in the Sold assets report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="intent" value="mark" />
          {assetIds.map((id, i) => (
            <input key={id} type="hidden" name={`assetIds[${i}]`} value={id} />
          ))}
          {currentSearchParams !== undefined ? (
            <input
              type="hidden"
              name="currentSearchParams"
              value={currentSearchParams}
            />
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Date sold
            <input
              type="date"
              name="soldOn"
              required
              defaultValue={today()}
              max={today()}
              className="rounded border border-gray-300 px-3 py-2 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Sale price{assetIds.length > 1 ? " (each)" : ""}
            <input
              type="number"
              name="price"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Optional"
              className="rounded border border-gray-300 px-3 py-2 font-normal"
            />
          </label>
          {fetcher.data?.error ? (
            <p role="alert" className="text-sm text-error-600">
              {fetcher.data.error.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Mark as sold"}
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Marks assets as not sold again, straight away. */
export function useMarkNotSold() {
  const fetcher = useFetcher();
  return (assetIds: string[], currentSearchParams?: string) => {
    const form: Record<string, string> = { intent: "unmark" };
    if (currentSearchParams !== undefined) {
      form.currentSearchParams = currentSearchParams;
    }
    assetIds.forEach((id, i) => {
      form[`assetIds[${i}]`] = id;
    });
    void fetcher.submit(form, { method: "post", action: SOLD_URL });
  };
}
