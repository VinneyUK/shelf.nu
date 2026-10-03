/**
 * Queues labels for the assets selected in the assets list, including a
 * cross-page "select all" (resolved on the server through the list's filters).
 * Part of the labels feature; not in upstream Shelf.
 */
import { useAtomValue } from "jotai";
import { useFetcher } from "react-router";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useSearchParams } from "~/hooks/search-params";

export function usePrintSelectedLabels() {
  const selected = useAtomValue(selectedBulkItemsAtom);
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher();

  const print = () => {
    const form: Record<string, string> = {
      source: "bulk",
      currentSearchParams: searchParams.toString(),
    };
    selected.forEach((item, i) => {
      form[`assetIds[${i}]`] = item.id;
    });
    void fetcher.submit(form, { method: "post", action: "/api/labels/print" });
  };

  return {
    print,
    count: selected.length,
    isPrinting: fetcher.state !== "idle",
  };
}
