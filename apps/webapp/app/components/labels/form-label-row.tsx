/**
 * "Label" row in the edit asset form, next to the Asset ID: whether a label
 * has been printed, with Print label / Remove label.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import FormRow from "~/components/forms/form-row";
import { Button } from "~/components/shared/button";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import {
  LabelledBadge,
  refreshLabelledSoon,
  useLabelledAt,
} from "./labelled-badge";

export function FormLabelRow({ assetId }: { assetId: string }) {
  const { labelsEnabled } = useCustomisations();
  const labelledAt = useLabelledAt(assetId);
  const fetcher = useFetcher<{
    error?: { message: string };
    success?: boolean;
  }>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success)
      refreshLabelledSoon();
  }, [fetcher.state, fetcher.data]);

  if (!labelsEnabled) return null;

  const act = (intent: "print" | "remove") =>
    void fetcher.submit(
      { "assetIds[0]": assetId, intent, source: "asset" },
      { method: "post", action: "/api/labels/print" }
    );

  return (
    <FormRow
      rowLabel="Label"
      subHeading="The printed QR label for this asset. Printing and removing happen straight away, not when you save."
      className="pt-[10px]"
    >
      <div className="flex w-full flex-wrap items-center gap-3">
        {labelledAt ? (
          <>
            <LabelledBadge labelledAt={labelledAt} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => act("print")}
            >
              Print again
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => act("remove")}
            >
              Remove label
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-gray-500">No label printed.</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => act("print")}
            >
              Print label
            </Button>
          </>
        )}
        {fetcher.data?.error ? (
          <p role="alert" className="text-sm text-error-600">
            {fetcher.data.error.message}
          </p>
        ) : null}
      </div>
    </FormRow>
  );
}
