/**
 * Filament pictures (fork): each line and colour gets its picture from the
 * Bambu store once, kept in Shelf so spools keep it if the store changes.
 * Every spool of that filament shares it. Fetching runs in the background,
 * one filament at a time, at the store client's polite pace.
 */
import { db } from "~/database/db.server";
import { Logger } from "~/utils/logger";
import { downloadImage, findFilament, StoreError } from "./bambu-store.server";
import { filamentKey } from "./catalogue";

/** A "not in the store" answer is trusted for a week before asking again. */
const MISSING_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

type Wanted = { type: string; colourName: string; filamentCode: string | null };
type Store = {
  findFilament: typeof findFilament;
  downloadImage: typeof downloadImage;
};

/** Fetches and keeps one filament's picture, unless it already has one. */
export async function ensureFilamentImage(
  organizationId: string,
  wanted: Wanted,
  store: Store = { findFilament, downloadImage }
): Promise<"found" | "missing" | "error" | "kept"> {
  const key = filamentKey(wanted.type, wanted.colourName);
  const existing = await db.filamentImage.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { status: true, fetchedAt: true },
  });
  if (existing?.status === "found") return "kept";
  if (
    existing?.status === "missing" &&
    Date.now() - existing.fetchedAt.getTime() < MISSING_RETRY_MS
  )
    return "kept";

  const save = (data: Record<string, unknown>) =>
    db.filamentImage.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, ...data } as never,
      update: { ...data, fetchedAt: new Date() },
    });

  try {
    const variant = await store.findFilament({
      type: wanted.type,
      colourName: wanted.colourName,
      code: wanted.filamentCode,
    });
    if (!variant?.imageUrl) {
      await save({
        status: "missing",
        message: "The Bambu store has no picture for this line and colour.",
        bytes: null,
      });
      return "missing";
    }
    const image = await store.downloadImage(variant.imageUrl);
    await save({
      status: "found",
      bytes: image.bytes,
      contentType: image.contentType,
      sourceUrl: variant.imageUrl,
      productUrl: variant.productUrl,
      filamentCode: variant.filamentCode,
      message: null,
    });
    return "found";
  } catch (cause) {
    const message =
      cause instanceof StoreError ? cause.message : "Couldn't get the picture.";
    await save({ status: "error", message, bytes: null });
    return "error";
  }
}

let running = false;

/**
 * Fetches pictures for every filament on hand that hasn't got one, in the
 * background. Safe to call often: only one run at a time.
 */
export function fetchMissingImages(organizationId: string, store?: Store) {
  if (running) return false;
  running = true;
  void (async () => {
    try {
      const spools = await db.spool.findMany({
        where: { organizationId, status: { not: "retired" } },
        select: { type: true, colourName: true, filamentCode: true },
      });
      const seen = new Set<string>();
      for (const s of spools) {
        const key = filamentKey(s.type, s.colourName);
        if (seen.has(key)) continue;
        seen.add(key);
        const result = await ensureFilamentImage(organizationId, s, store);
        // a paused store won't answer the rest either
        if (result === "error") {
          const row = await db.filamentImage.findUnique({
            where: { organizationId_key: { organizationId, key } },
            select: { message: true },
          });
          if (row?.message && /paused/i.test(row.message)) break;
        }
      }
    } catch (cause) {
      Logger.error(cause);
    } finally {
      running = false;
    }
  })();
  return true;
}

/** Which filaments have a picture, for the page. */
export async function imageStatuses(organizationId: string) {
  const rows = await db.filamentImage.findMany({
    where: { organizationId },
    select: {
      key: true,
      status: true,
      message: true,
      productUrl: true,
      filamentCode: true,
    },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

export async function getFilamentImage(organizationId: string, key: string) {
  const row = await db.filamentImage.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { bytes: true, contentType: true, status: true },
  });
  return row?.status === "found" && row.bytes
    ? {
        bytes: new Uint8Array(row.bytes),
        contentType: row.contentType ?? "image/jpeg",
      }
    : null;
}
