/**
 * Finding new pictures for assets (fork), through the Claude API key in
 * Settings → AI: Claude searches the web for the product; Shelf follows each
 * address it gives (a photo, or a product page's own photo) and offers up to
 * four real pictures to choose from. The chosen one becomes the asset's main
 * image through Shelf's own image pipeline (resized, with a thumbnail).
 * Every fetch goes through safeFetch, which refuses local and private
 * addresses.
 */
import { db } from "~/database/db.server";
import { updateAssetMainImage } from "~/modules/asset/service.server";
import { ShelfError } from "~/utils/error";
import { safeFetch } from "~/utils/ssrf.server";
import {
  PICTURE_SYSTEM,
  PICTURES_PER_ASSET,
  pagePicture,
  parsePictureUrls,
  pictureQuestion,
} from "./pictures";
import { researchPrice } from "./price-research.server";
import { getAiSettingsRow } from "./settings.server";

const label = "Assets" as const;
const PAGE_BYTES = 4 * 1024 * 1024;
const PICTURE_BYTES = 8 * 1024 * 1024;

export type PictureCandidates = {
  assetId: string;
  title: string;
  pictures: string[];
  /** Why nothing could be offered, in words for the person */
  error: string | null;
};

/** A picture address that really is a picture, or null. */
async function checkPicture(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, { maxBytes: PICTURE_BYTES });
    return res.contentType.toLowerCase().startsWith("image/") ? url : null;
  } catch {
    return null;
  }
}

/** The picture behind an address Claude gave: the photo itself, or its page's own photo. */
async function pictureFrom(url: string): Promise<string | null> {
  let res;
  try {
    res = await safeFetch(url, { maxBytes: PAGE_BYTES });
  } catch {
    return null;
  }
  const type = res.contentType.toLowerCase();
  if (type.startsWith("image/")) return url;
  if (!type.includes("html")) return null;
  const photo = pagePicture(res.buffer.toString("utf8"), url);
  return photo ? checkPicture(photo) : null;
}

/** Up to four pictures for one asset. Never throws: a failure is in `error`. */
export async function findPictures({
  organizationId,
  assetId,
}: {
  organizationId: string;
  assetId: string;
}): Promise<PictureCandidates> {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      id: true,
      title: true,
      description: true,
      category: { select: { name: true } },
    },
  });
  if (!asset)
    return {
      assetId,
      title: "",
      pictures: [],
      error: "That asset isn't here.",
    };
  const ai = await getAiSettingsRow(organizationId);
  if (!ai.enabled || !ai.apiKey)
    return {
      assetId,
      title: asset.title,
      pictures: [],
      error: "Switch AI on and add your API key in Settings → AI first.",
    };
  const found = await researchPrice({
    apiKey: ai.apiKey,
    model: ai.model,
    workspaceId: ai.workspaceId,
    system: PICTURE_SYSTEM,
    content: [
      {
        type: "text",
        text: pictureQuestion({
          title: asset.title,
          category: asset.category?.name,
          description: asset.description,
        }),
      },
    ],
    what: "picture search",
    maxSearches: 3,
    maxTokens: 1024,
  });
  const urls = parsePictureUrls(found.text);
  const pictures: string[] = [];
  // a few at a time, keeping Claude's order (best first)
  for (
    let i = 0;
    i < urls.length && pictures.length < PICTURES_PER_ASSET;
    i += 3
  ) {
    const batch = await Promise.all(urls.slice(i, i + 3).map(pictureFrom));
    for (const p of batch)
      if (p && !pictures.includes(p) && pictures.length < PICTURES_PER_ASSET)
        pictures.push(p);
  }
  return {
    assetId,
    title: asset.title,
    pictures,
    error: pictures.length
      ? null
      : found.error ?? "No pictures of it could be found.",
  };
}

/** Makes the chosen picture the asset's main image (its old one is removed). */
export async function setPictureFromUrl({
  organizationId,
  userId,
  assetId,
  url,
}: {
  organizationId: string;
  userId: string;
  assetId: string;
  url: string;
}) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true },
  });
  if (!asset)
    throw new ShelfError({
      cause: null,
      message: "That asset isn't here.",
      status: 404,
      label,
      shouldBeCaptured: false,
    });
  let res;
  try {
    res = await safeFetch(url, { maxBytes: PICTURE_BYTES });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "That picture couldn't be fetched.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  const type = res.contentType.split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/"))
    throw new ShelfError({
      cause: null,
      message: "That address isn't a picture.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  const ext =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const form = new FormData();
  form.set(
    "mainImage",
    new File([new Uint8Array(res.buffer)], `picture.${ext}`, { type })
  );
  const request = new Request("http://localhost/internal/find-pictures", {
    method: "POST",
    body: form,
  });
  await updateAssetMainImage({ request, assetId, userId, organizationId });
}
