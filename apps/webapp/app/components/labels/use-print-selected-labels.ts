/**
 * Print / re-print / remove labels for the assets selected in the assets list,
 * including a cross-page "select all" (resolved on the server through the
 * list's filters). Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useFetcher } from "react-router";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useSearchParams } from "~/hooks/search-params";
import { labelMenuEntries, labelMenuMode } from "~/modules/labels/menu-mode";
import { refreshLabelledSoon, useLabelledMap } from "./labelled-badge";

export function usePrintSelectedLabels() {
  const selected = useAtomValue(selectedBulkItemsAtom);
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<{ success?: boolean }>();
  const labelled = useLabelledMap();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success)
      refreshLabelledSoon();
  }, [fetcher.state, fetcher.data]);

  const run = (intent: "print" | "remove") => {
    const form: Record<string, string> = {
      source: "bulk",
      intent,
      currentSearchParams: searchParams.toString(),
    };
    selected.forEach((item, i) => {
      form[`assetIds[${i}]`] = item.id;
    });
    void fetcher.submit(form, { method: "post", action: "/api/labels/print" });
  };

  const mode = labelMenuMode(
    selected.map((item) => item.id),
    labelled
  );
  return {
    entries: labelMenuEntries(mode),
    run,
    count: selected.length,
    isBusy: fetcher.state !== "idle",
  };
}
