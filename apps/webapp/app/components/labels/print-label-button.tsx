/**
 * Print label button for the row action buttons in the assets and boxes lists,
 * and on filament tiles.
 * Turns green, and offers Re-print, once a label has been printed.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { PrinterIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import { useCustomisations } from "~/modules/customisation/use-customisations";
import { tw } from "~/utils/tw";
import { refreshLabelledSoon, useLabelledAt } from "./labelled-badge";

/** Which list of ids the print route reads, for each kind of thing labelled. */
const FIELD_FOR = {
  asset: "assetIds[0]",
  box: "kitIds[0]",
  filament: "filamentIds[0]",
} as const;

export function PrintLabelButton({
  id,
  kind = "asset",
  withText = false,
  small = false,
}: {
  id: string;
  kind?: "asset" | "box" | "filament";
  /** A labelled button (a page header) rather than an icon (a list row) */
  withText?: boolean;
  /** Matches the smaller row buttons on filament tiles */
  small?: boolean;
}) {
  const { labelsEnabled } = useCustomisations();
  const labelledAt = useLabelledAt(id);
  const fetcher = useFetcher<{ success?: boolean }>();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success)
      refreshLabelledSoon([id]);
  }, [fetcher.state, fetcher.data, id]);

  if (!labelsEnabled) return null;
  const label = labelledAt ? "Re-print label" : "Print label";
  return (
    <Button
      type="button"
      size={withText ? undefined : "sm"}
      variant="secondary"
      className={tw(
        withText ? "gap-2" : small ? "p-1.5" : "p-2",
        labelledAt && "text-success-700"
      )}
      aria-label={withText ? undefined : label}
      tooltip={withText ? undefined : label}
      disabled={fetcher.state !== "idle"}
      onClick={() =>
        void fetcher.submit(
          {
            [FIELD_FOR[kind]]: id,
            intent: "print",
            source: kind === "filament" ? "filament" : "asset",
          },
          { method: "post", action: "/api/labels/print" }
        )
      }
    >
      {withText ? (
        <span className="inline-flex items-center gap-2">
          <PrinterIcon className="size-4" />
          {label}
        </span>
      ) : (
        <PrinterIcon className={small ? "size-3.5" : "size-4"} />
      )}
    </Button>
  );
}
