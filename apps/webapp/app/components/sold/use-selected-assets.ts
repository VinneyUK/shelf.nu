/**
 * The assets selected in the assets list, as the bulk endpoints expect them
 * (ids, possibly the select-all marker, plus the list's filters).
 * Part of the sold feature; not in upstream Shelf.
 */
import { useAtomValue } from "jotai";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useSearchParams } from "~/hooks/search-params";

export function useSelectedAssets() {
  const selected = useAtomValue(selectedBulkItemsAtom);
  const [searchParams] = useSearchParams();
  return {
    assetIds: selected.map((item) => item.id),
    currentSearchParams: searchParams.toString(),
  };
}
