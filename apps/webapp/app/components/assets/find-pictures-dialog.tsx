/**
 * Find new pictures (fork): for the assets ticked in the list, Claude looks
 * each one up on the web (two at a time) and offers up to four pictures. Pick
 * one for each, or leave it as it is; "Use these" makes the picked ones the
 * main images. Needs AI switched on with a key (Settings → AI).
 */
import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/shared/modal";
import type { PictureCandidates } from "~/modules/ai/pictures.server";
import { tw } from "~/utils/tw";

const ROUTE = "/api/assets/find-pictures";
/** Lookups running at once */
const AT_ONCE = 2;
/** The most assets one run looks up */
export const MAX_PICTURE_ASSETS = 25;

type Asset = { id: string; title: string };

export function FindPicturesDialog({
  open,
  onOpenChange,
  assets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
}) {
  const list = assets.slice(0, MAX_PICTURE_ASSETS);
  const [finished, setFinished] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const save = useFetcher<{ success?: boolean; error?: { message: string } }>();
  const revalidator = useRevalidator();
  const busy = save.state !== "idle";

  // a fresh start each time it opens
  useEffect(() => {
    if (open) {
      setFinished(0);
      setChosen({});
    }
  }, [open]);

  useEffect(() => {
    if (save.state === "idle" && save.data?.success) {
      onOpenChange(false);
      void revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.state, save.data]);

  const picked = Object.entries(chosen);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto md:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>New pictures</AlertDialogTitle>
          <AlertDialogDescription>
            Pick one for each, or leave it as it is. The picked ones replace the
            main image; the old one isn't kept.
            {assets.length > MAX_PICTURE_ASSETS
              ? ` The first ${MAX_PICTURE_ASSETS} of the ${assets.length} selected are looked up.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {open ? (
          <ul className="flex flex-col divide-y divide-gray-100">
            {list.map((asset, i) => (
              <PictureRow
                key={asset.id}
                asset={asset}
                // two at a time, in order
                start={i < finished + AT_ONCE}
                onDone={() => setFinished((n) => n + 1)}
                chosen={chosen[asset.id] ?? null}
                onChoose={(url) =>
                  setChosen((c) => {
                    const next = { ...c };
                    if (next[asset.id] === url) delete next[asset.id];
                    else next[asset.id] = url;
                    return next;
                  })
                }
              />
            ))}
          </ul>
        ) : null}
        {save.data?.error ? (
          <p role="alert" className="text-sm text-error-600">
            {save.data.error.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={() => {
              const form: Record<string, string> = { intent: "use" };
              picked.forEach(([id, url], i) => {
                form[`choices[${i}]`] = `${id}|${url}`;
              });
              void save.submit(form, { method: "post", action: ROUTE });
            }}
          >
            {busy
              ? "Saving…"
              : picked.length
              ? `Use ${picked.length === 1 ? "this" : `these ${picked.length}`}`
              : "Use these"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PictureRow({
  asset,
  start,
  onDone,
  chosen,
  onChoose,
}: {
  asset: Asset;
  start: boolean;
  onDone: () => void;
  chosen: string | null;
  onChoose: (url: string) => void;
}) {
  const search = useFetcher<{
    result?: PictureCandidates;
    error?: { message: string };
  }>();
  const asked = useRef(false);
  const told = useRef(false);

  useEffect(() => {
    if (start && !asked.current) {
      asked.current = true;
      void search.submit(
        { intent: "search", assetId: asset.id },
        { method: "post", action: ROUTE }
      );
    }
  }, [start, asset.id, search]);

  useEffect(() => {
    if (
      asked.current &&
      search.state === "idle" &&
      search.data &&
      !told.current
    ) {
      told.current = true;
      onDone();
    }
  }, [search.state, search.data, onDone]);

  const result = search.data?.result;
  const problem = search.data?.error?.message ?? result?.error ?? null;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="w-40 shrink-0 truncate text-sm font-medium text-gray-900">
        {asset.title}
      </div>
      <div className="flex min-h-20 flex-wrap items-center gap-2">
        {!search.data ? (
          <span className="text-sm text-gray-500">
            {start ? "Searching the web…" : "Waiting…"}
          </span>
        ) : result?.pictures.length ? (
          result.pictures.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onChoose(url)}
              aria-pressed={chosen === url}
              aria-label={`Use this picture for ${asset.title}`}
              className={tw(
                "size-20 overflow-hidden rounded-md border-2 bg-gray-50",
                chosen === url
                  ? "border-primary-500"
                  : "border-transparent hover:border-gray-300"
              )}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-full object-contain"
              />
            </button>
          ))
        ) : (
          <span className="text-sm text-gray-500">{problem}</span>
        )}
      </div>
    </li>
  );
}
