/**
 * The asset's printed label on the asset overview, in place of Shelf's QR
 * section. Shows nothing until a label has been printed.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { LabelPreview } from "./label-preview";
import { useLabelledAt } from "./labelled-badge";

type PrintedLabel = {
  sequentialId: string;
  title: string;
  qrUrl: string;
  printedAt: string | null;
  settings: { labelWidth: number; leftMargin: number };
};

export function PrintedLabelCard({ assetId }: { assetId: string }) {
  const labelledAt = useLabelledAt(assetId);
  const fetcher = useFetcher<{ label?: PrintedLabel | null }>();

  // Ask for the label once we know there is one (and again if that changes)
  useEffect(() => {
    if (labelledAt && fetcher.state === "idle") {
      void fetcher.load(
        `/api/labels/printed?assetId=${encodeURIComponent(assetId)}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, labelledAt]);

  const label = labelledAt ? fetcher.data?.label : null;
  if (!label) return null;

  return (
    <Card className="mb-3 mt-0 py-3 md:border">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Label</h3>
      <div className="flex flex-col gap-2">
        <LabelPreview
          sequentialId={label.sequentialId}
          title={label.title}
          qrUrl={label.qrUrl}
          settings={label.settings}
          scale={1.1}
          className="max-w-full"
        />
        <p className="text-xs text-gray-500">
          Printed {label.printedAt ? <DateS date={label.printedAt} /> : null}
        </p>
      </div>
    </Card>
  );
}
