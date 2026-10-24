/**
 * The Matter mark beside an asset's name in the assets list (fork), on assets
 * that have Matter devices. One small request per page says which they are.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { MATTER_MARK_PATH } from "~/modules/matter/logo";

export function MatterNameMark({ assetId }: { assetId: string }) {
  // one fetcher shared by every row, so the list asks once
  const fetcher = useFetcher<{ assetIds?: string[] }>({
    key: "matter-asset-ids",
  });
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data)
      void fetcher.load("/api/matter/assets");
  }, [fetcher]);
  if (!fetcher.data?.assetIds?.includes(assetId)) return null;
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
