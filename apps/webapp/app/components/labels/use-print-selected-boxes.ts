/**
 * Queues labels for the boxes selected in the boxes list. A cross-page
 * "select all" prints every box in the workspace.
 * Part of the labels feature; not in upstream Shelf.
 */
import { useAtomValue } from "jotai";
import { useFetcher } from "react-router";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { ALL_SELECTED_KEY } from "~/utils/list";

export function usePrintSelectedBoxes() {
  const selected = useAtomValue(selectedBulkItemsAtom);
  const fetcher = useFetcher();
  const print = () => {
    const form: Record<string, string> = { source: "bulk" };
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
  return {
    print,
    count: selected.length,
    isPrinting: fetcher.state !== "idle",
  };
}
