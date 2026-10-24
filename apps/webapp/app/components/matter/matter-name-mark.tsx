/**
 * The Matter mark beside an asset's name in the assets list (fork), on assets
 * that have Matter devices.
 *
 * Which assets those are is asked for ONCE, shared by every row (a single
 * request kept for a minute, never repeated on failure). An earlier version
 * asked once per row and again on every change, which tripped Shelf's
 * "too many requests" limit on a long list.
 */
import { useEffect, useState } from "react";
import { MATTER_MARK_PATH } from "~/modules/matter/logo";

const KEEP_MS = 60_000;
let cache: { at: number; ids: Promise<Set<string>> } | null = null;

/** The ids of assets with Matter devices: one request, shared, kept a minute. */
export function matterAssetIds(now = Date.now()): Promise<Set<string>> {
  if (!cache || now - cache.at > KEEP_MS)
    cache = {
      at: now,
      ids: fetch("/api/matter/assets", {
        headers: { Accept: "application/json" },
      })
        .then((r) => (r.ok ? r.json() : { assetIds: [] }))
        .then((d: { assetIds?: string[] }) => new Set(d.assetIds ?? []))
        // a failure shows no marks; it isn't asked again until the minute's up
        .catch(() => new Set<string>()),
    };
  return cache.ids;
}

/** For tests: forget what was asked. */
export function resetMatterAssetIds() {
  cache = null;
}

export function MatterNameMark({ assetId }: { assetId: string }) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    void matterAssetIds().then((ids) => {
      if (live) setHas(ids.has(assetId));
    });
    return () => {
      live = false;
    };
  }, [assetId]);
  if (!has) return null;
  return (
    <span
      title="Matter device"
      className="ml-1.5 inline-flex shrink-0 items-center align-middle text-gray-700"
    >
      <svg
        viewBox="0 0 512 512"
        className="size-4"
        role="img"
        aria-label="Matter device"
      >
        <path d={MATTER_MARK_PATH} fill="currentColor" />
      </svg>
    </span>
  );
}
