/**
 * Attachment counts in the assets list: a paperclip badge for the simple view
 * and a cell for the advanced view's Attachments column.
 * Part of the attachments feature; not in upstream Shelf.
 *
 * Every row shares one request (fetcher key below), refreshed whenever the
 * list is shown.
 */
import type { ReactNode } from "react";
import { PaperclipIcon } from "lucide-react";
import { Link, useFetcher } from "react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/shared/hover-card";
import { Td } from "~/components/table";
import { attachmentTypeLabel } from "~/modules/asset-attachment/constants";
import { formatBytes } from "~/utils/format-bytes";
import { createSharedLookup } from "~/utils/shared-lookup";

export const attachmentCountsLookup = createSharedLookup<{
  counts?: Record<string, number>;
}>("/api/asset-attachments/counts");

export function useAttachmentCount(assetId: string): number {
  return attachmentCountsLookup.useData()?.counts?.[assetId] ?? 0;
}

type ListedAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  openUrl: string | null;
};

/**
 * Hovering (or focusing) the paperclip lists the asset's attachments, each
 * opening in a new tab. The list loads the first time it's opened.
 */
export function AttachmentsHover({
  assetId,
  count,
  children,
}: {
  assetId: string;
  count: number;
  children: ReactNode;
}) {
  const fetcher = useFetcher<{
    attachments?: ListedAttachment[];
    error?: { message: string };
  }>();
  const load = (open: boolean) => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      void fetcher.load(
        `/api/asset-attachments/list?assetId=${encodeURIComponent(assetId)}`
      );
    }
  };
  const files = fetcher.data?.attachments;

  return (
    <HoverCard openDelay={200} closeDelay={150} onOpenChange={load}>
      <HoverCardTrigger asChild>
        <Link
          to={`/assets/${assetId}/attachments`}
          className="inline-flex items-center gap-1 rounded hover:text-primary-700"
          aria-label={`${count} attachment${count === 1 ? "" : "s"}`}
        >
          {children}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-80 p-2">
        <p className="px-2 pb-1 text-xs font-medium text-gray-500">
          {count} attachment{count === 1 ? "" : "s"}
        </p>
        {fetcher.data?.error ? (
          <p className="px-2 py-1 text-sm text-error-600">
            {fetcher.data.error.message}
          </p>
        ) : !files ? (
          <p className="px-2 py-1 text-sm text-gray-500">Loading…</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {files.map((file) => (
              <li key={file.id}>
                <a
                  href={file.openUrl ?? `/assets/${assetId}/attachments`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                >
                  <PaperclipIcon
                    className="size-3.5 shrink-0 text-gray-400"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                    {file.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {attachmentTypeLabel(file.contentType)} ·{" "}
                    {formatBytes(file.size, 0)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <Link
          to={`/assets/${assetId}/attachments`}
          className="mt-1 block border-t px-2 pt-2 text-xs font-semibold text-primary-700 hover:underline"
        >
          Manage attachments
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Simple view: a small paperclip with the count, only when there are any. */
export function AttachmentCountBadge({ assetId }: { assetId: string }) {
  const count = useAttachmentCount(assetId);
  if (count === 0) return null;
  return (
    <AttachmentsHover assetId={assetId} count={count}>
      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
        <PaperclipIcon className="size-3.5" aria-hidden="true" />
        {count}
      </span>
    </AttachmentsHover>
  );
}

/** Advanced view: the Attachments column. */
export function AttachmentCountCell({ assetId }: { assetId: string }) {
  const count = useAttachmentCount(assetId);
  return (
    <Td className="w-full max-w-none whitespace-nowrap">
      {count > 0 ? (
        <AttachmentsHover assetId={assetId} count={count}>
          <span className="inline-flex items-center gap-1 text-gray-700">
            <PaperclipIcon className="size-4" aria-hidden="true" />
            {count}
          </span>
        </AttachmentsHover>
      ) : (
        <span className="text-gray-400">—</span>
      )}
    </Td>
  );
}
