/**
 * Attachment counts in the assets list: a paperclip badge for the simple view
 * and a cell for the advanced view's Attachments column.
 * Part of the attachments feature; not in upstream Shelf.
 *
 * Every row shares one request (fetcher key below), refreshed whenever the
 * list is shown.
 */
import { useEffect } from "react";
import { PaperclipIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { Td } from "~/components/table";

const COUNTS_URL = "/api/asset-attachments/counts";
const FETCHER_KEY = "asset-attachment-counts";
let lastRequested = 0;

function useAttachmentCount(assetId: string): number {
  const fetcher = useFetcher<{ counts?: Record<string, number> }>({
    key: FETCHER_KEY,
  });
  useEffect(() => {
    // The first row to mount asks; the rest share the answer
    if (fetcher.state === "idle" && Date.now() - lastRequested > 3000) {
      lastRequested = Date.now();
      void fetcher.load(COUNTS_URL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return fetcher.data?.counts?.[assetId] ?? 0;
}

/** Simple view: a small paperclip with the count, only when there are any. */
export function AttachmentCountBadge({ assetId }: { assetId: string }) {
  const count = useAttachmentCount(assetId);
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-gray-600"
      title={`${count} attachment${count === 1 ? "" : "s"}`}
    >
      <PaperclipIcon className="size-3.5" aria-hidden="true" />
      {count}
      <span className="sr-only"> attachment{count === 1 ? "" : "s"}</span>
    </span>
  );
}

/** Advanced view: the Attachments column. */
export function AttachmentCountCell({ assetId }: { assetId: string }) {
  const count = useAttachmentCount(assetId);
  return (
    <Td className="w-full max-w-none whitespace-nowrap">
      {count > 0 ? (
        <span className="inline-flex items-center gap-1 text-gray-700">
          <PaperclipIcon className="size-4" aria-hidden="true" />
          {count}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      )}
    </Td>
  );
}
