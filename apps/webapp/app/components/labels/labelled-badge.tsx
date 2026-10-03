/**
 * "Labelled" badge: this asset has had a label printed.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Badge } from "~/components/shared/badge";

const LABELLED_URL = "/api/labels/labelled";
const FETCHER_KEY = "labelled-assets";
let lastRequested = 0;

/** When each asset was last labelled, shared by every badge on the page. */
export function useLabelledAt(assetId: string): string | null {
  const fetcher = useFetcher<{ labelled?: Record<string, string> }>({
    key: FETCHER_KEY,
  });
  useEffect(() => {
    if (fetcher.state === "idle" && Date.now() - lastRequested > 3000) {
      lastRequested = Date.now();
      void fetcher.load(LABELLED_URL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return fetcher.data?.labelled?.[assetId] ?? null;
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
