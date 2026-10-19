/**
 * Filament pictures (fork): each line and colour gets its picture from the
 * Bambu store once, kept in Shelf so spools keep it if the store changes.
 * Every spool of that filament shares it. Fetching runs in the background,
 * one filament at a time, at the store client's polite pace.
 */
import sharp from "sharp";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import {
  downloadImage,
  findFilament,
  pickVariant,
  productFromStoreUrl,
  StoreError,
  variantsOnProduct,
  type Deps,
} from "./bambu-store.server";
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
      create: { organizationId, key, ...data, thumb: null } as never,
      update: { ...data, thumb: null, fetchedAt: new Date() },
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
    // the store knows the code on the box: fill it in where it's missing
    if (variant.filamentCode) {
      const missing = await db.spool.findMany({
        where: { organizationId, filamentCode: null },
        select: { id: true, type: true, colourName: true },
      });
      const ids = missing
        .filter((s) => filamentKey(s.type, s.colourName) === key)
        .map((s) => s.id);
      if (ids.length) {
        await db.spool.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { filamentCode: variant.filamentCode },
        });
      }
    }
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
      sourceUrl: true,
    },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

/** The size of the small copy's longest side, in pixels. */
export const THUMB_SIZE = 480;

/**
 * A filament's picture as a small copy (480 px WebP) for tiles and lists:
 * made from the full picture the first time it's asked for, then kept. A
 * full-size picture scaled down in every tile uses a lot of the browser's
 * memory, which makes it drop and redraw pictures as you scroll.
 */
export async function getFilamentThumb(organizationId: string, key: string) {
  const row = await db.filamentImage.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { bytes: true, thumb: true, status: true },
  });
  if (row?.status !== "found" || !row.bytes) return null;
  if (row.thumb)
    return { bytes: new Uint8Array(row.thumb), contentType: "image/webp" };
  try {
    const thumb = await sharp(Buffer.from(row.bytes))
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    await db.filamentImage
      .updateMany({
        where: { organizationId, key },
        data: { thumb: new Uint8Array(thumb) },
      })
      .catch(() => undefined); // kept next time; served now either way
    return { bytes: new Uint8Array(thumb), contentType: "image/webp" };
  } catch {
    // a picture sharp can't read: the full one, as before
    return getFilamentImage(organizationId, key);
  }
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

const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/**
 * Sets a filament's picture from an address you give (when Shelf found none,
 * or the wrong one): fetched now and kept, as the store's pictures are. Web
 * addresses only, an image, up to 5 MB.
 */
export async function setFilamentImageFromUrl(
  organizationId: string,
  key: string,
  address: string
) {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new ShelfError({
      cause: null,
      message: "That isn't a web address.",
      status: 400,
      label: "Assets",
    });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ShelfError({
      cause: null,
      message: "Use a web address (https://…).",
      status: 400,
      label: "Assets",
    });
  }
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Couldn't fetch that picture.",
      status: 400,
      label: "Assets",
    });
  }
  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim();
  if (!res.ok)
    throw new ShelfError({
      cause: null,
      message: `That address answered ${res.status}.`,
      status: 400,
      label: "Assets",
    });
  if (!contentType.startsWith("image/")) {
    throw new ShelfError({
      cause: null,
      message: "That address isn't a picture.",
      status: 400,
      label: "Assets",
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PICTURE_BYTES) {
    throw new ShelfError({
      cause: null,
      message: "That picture is over 5 MB.",
      status: 400,
      label: "Assets",
    });
  }
  const data = {
    status: "found",
    bytes,
    contentType,
    sourceUrl: url.toString(),
    message: null,
    fetchedAt: new Date(),
  };
  await db.filamentImage.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, ...data },
    update: data,
  });
}

/**
 * Links a filament to its page on the Bambu store, when Shelf found none or
 * the wrong one: the page's colour for this filament (by its box code, else
 * its name) gives the picture, the box code and the page itself, kept so the
 * prices are checked there from now on. Returns what it found.
 */
export async function linkStorePage(
  organizationId: string,
  filament: { type: string; colourName: string; filamentCode: string | null },
  address: string,
  deps: Deps = {}
) {
  const seo = productFromStoreUrl(address);
  if (!seo) {
    throw new ShelfError({
      cause: null,
      message:
        "That isn't a Bambu store product page (https://uk.store.bambulab.com/products/…).",
      status: 400,
      label: "Assets",
    });
  }
  let found: Awaited<ReturnType<typeof variantsOnProduct>>;
  try {
    found = await variantsOnProduct(
      seo,
      { colourName: filament.colourName, code: filament.filamentCode },
      deps
    );
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        cause instanceof StoreError
          ? cause.message
          : "Couldn't read that store page.",
      status: 400,
      label: "Assets",
    });
  }
  const variant = pickVariant(
    found.matching,
    filament.colourName,
    filament.filamentCode
  );
  if (!variant) {
    const colours = [...new Set(found.all.map((v) => v.colourName))]
      .slice(0, 12)
      .join(", ");
    throw new ShelfError({
      cause: null,
      message: `That page doesn't sell ${filament.colourName}${
        colours ? `. Its colours: ${colours}` : ""
      }.`,
      status: 400,
      label: "Assets",
    });
  }
  const key = filamentKey(filament.type, filament.colourName);
  const picture = variant.imageUrl
    ? await downloadImage(variant.imageUrl, deps)
    : null;
  const data = {
    status: picture ? "found" : "missing",
    ...(picture
      ? {
          bytes: picture.bytes,
          contentType: picture.contentType,
          sourceUrl: variant.imageUrl,
        }
      : {}),
    productUrl: variant.productUrl,
    filamentCode: variant.filamentCode,
    message: picture ? null : "The store page has no picture for this colour.",
    fetchedAt: new Date(),
    // the small copy is made again from the new picture
    thumb: null,
  };
  await db.filamentImage.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, ...data },
    update: data,
  });
  return {
    productUrl: variant.productUrl,
    filamentCode: variant.filamentCode,
    picture: Boolean(picture),
  };
}
