/**
 * "Labelled" badge: this asset has had a label printed.
 * Part of the labels feature; not in upstream Shelf.
 */
import { Badge } from "~/components/shared/badge";
import { DateS } from "~/components/shared/date";
import { Td } from "~/components/table";
import { createSharedLookup } from "~/utils/shared-lookup";

export const labelledLookup = createSharedLookup<{
  labelled?: Record<string, string>;
}>("/api/labels/labelled");

/** When each asset was last labelled, shared by every badge on the page. */
export function useLabelledAt(assetId: string): string | null {
  return labelledLookup.useData()?.labelled?.[assetId] ?? null;
}

/**
 * The badge itself, for when you already know the date. `compact` matches the
 * small chips in the advanced assets list (like QTY).
 */
export function LabelledBadge({
  labelledAt,
  compact = false,
}: {
  labelledAt: string | null;
  compact?: boolean;
}) {
  if (!labelledAt) return null;
  const when = new Date(labelledAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (compact) {
    return (
      <span
        title={`Label printed ${when}`}
        className="inline-flex shrink-0 items-center rounded bg-success-50 px-1.5 py-0.5 text-[10px] font-medium text-success-700"
      >
        Labelled
      </span>
    );
  }
  return (
    <span title={`Label printed ${when}`}>
      <Badge color="#12B76A" withDot={false}>
        Labelled
      </Badge>
    </span>
  );
}

/** The badge for an asset, looking up whether it's been labelled. */
export function AssetLabelledBadge({
  assetId,
  compact = false,
}: {
  assetId: string;
  compact?: boolean;
}) {
  return (
    <LabelledBadge labelledAt={useLabelledAt(assetId)} compact={compact} />
  );
}

/**
 * After queueing a label: refresh now, and again as the print finishes (it
 * takes a few seconds), so the green chip and Labelled state follow it.
 */
export function refreshLabelledSoon() {
  void labelledLookup.refresh();
  for (const ms of [4000, 10000, 25000]) {
    setTimeout(() => void labelledLookup.refresh(), ms);
  }
}

/** Every labelled asset and box, for working out what a selection holds. */
export function useLabelledMap(): Record<string, string> {
  return labelledLookup.useData()?.labelled ?? {};
}

/** The Labelled column in the advanced list: when the label was printed, or a dash. */
export function LabelledCell({ assetId }: { assetId: string }) {
  const labelledAt = useLabelledAt(assetId);
  return (
    <Td className="w-full max-w-none whitespace-nowrap">
      {labelledAt ? (
        <span className="text-success-700">
          <DateS date={labelledAt} />
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      )}
    </Td>
  );
}
