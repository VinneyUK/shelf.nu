/**
 * Print / re-print / remove labels for the boxes selected in the boxes list.
 * A cross-page "select all" covers every box in the workspace.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useFetcher } from "react-router";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { labelMenuEntries, labelMenuMode } from "~/modules/labels/menu-mode";
import { ALL_SELECTED_KEY } from "~/utils/list";
import { refreshLabelledSoon, useLabelledMap } from "./labelled-badge";

export function usePrintSelectedBoxes() {
  const selected = useAtomValue(selectedBulkItemsAtom);
  const fetcher = useFetcher<{ success?: boolean }>();
  const labelled = useLabelledMap();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success)
      refreshLabelledSoon();
  }, [fetcher.state, fetcher.data]);

  const run = (intent: "print" | "remove") => {
    const form: Record<string, string> = { source: "bulk", intent };
    const ids = selected.map((item) => item.id);
    if (ids.includes(ALL_SELECTED_KEY)) {
      form.allBoxes = "true";
    } else {
      ids.forEach((id, i) => {
        form[`kitIds[${i}]`] = id;
      });
    }
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
