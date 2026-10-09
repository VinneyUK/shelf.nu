/**
 * Print label button for the row action buttons in the assets and boxes lists.
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

export function PrintLabelButton({
  id,
  kind = "asset",
}: {
  id: string;
  kind?: "asset" | "box";
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
      size="sm"
      variant="secondary"
      className={tw("p-2", labelledAt && "text-success-700")}
      aria-label={label}
      tooltip={label}
      disabled={fetcher.state !== "idle"}
      onClick={() =>
        void fetcher.submit(
          {
            [kind === "box" ? "kitIds[0]" : "assetIds[0]"]: id,
            intent: "print",
            source: "asset",
          },
          { method: "post", action: "/api/labels/print" }
        )
      }
    >
      <PrinterIcon className="size-4" />
    </Button>
  );
}
