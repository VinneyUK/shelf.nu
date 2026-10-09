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

/** How often, and how long, to look again after a print or remove was asked for. */
const POLL_MS = 3000;
const POLL_FOR_MS = 120_000;

/**
 * After queueing a label (or removing one): keep looking until the labelled
 * state actually changes. Labels print on a background pass every 10 seconds
 * and the printer takes a while, so a fixed few retries used to miss it; this
 * polls every 3 seconds for up to two minutes, and stops as soon as the given
 * ids have changed (or, with no ids, as soon as anything has).
 */
export function refreshLabelledSoon(ids: string[] = []) {
  const before = { ...(labelledLookup.peek()?.labelled ?? {}) };
  const changed = () => {
    const now = labelledLookup.peek()?.labelled ?? {};
    if (ids.length === 0) {
      const keys = new Set([...Object.keys(before), ...Object.keys(now)]);
      return [...keys].some((k) => before[k] !== now[k]);
    }
    return ids.every((id) => before[id] !== now[id]);
  };
  const started = Date.now();
  const tick = () => {
    void labelledLookup.refresh().then(() => {
      if (changed() || Date.now() - started > POLL_FOR_MS) return;
      setTimeout(tick, POLL_MS);
    });
  };
  tick();
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
