/**
 * Asset attachments: storage, listing and deletion.
 * Part of the attachments feature; not in upstream Shelf.
 *
 * Files go in the private "attachments" bucket at
 *   <organizationId>/<assetId>/<attachmentId>-<file name>
 * (or <organizationId>/staged/... for files added in the asset form before the
 * asset is saved) and are only ever reached through short-lived signed links.
 */
import {
  MaxFileSizeExceededError,
  parseFormData,
} from "@remix-run/form-data-parser";
import { db } from "~/database/db.server";
import { getSupabaseAdmin } from "~/integrations/supabase/client";
import type { ErrorLabel } from "~/utils/error";
import { ShelfError, isLikeShelfError } from "~/utils/error";
import { id as createId } from "~/utils/id/id.server";
import { Logger } from "~/utils/logger";
import { sanitizeFilename } from "~/utils/sanitize-filename";
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_TYPES_DESCRIPTION,
  DEFAULT_ATTACHMENT_MAX_SIZE_MB,
  STAGED_ATTACHMENTS_FIELD,
} from "./constants";
import { detectAttachmentType } from "./detect";

const label: ErrorLabel = "Assets";

/** Signed links stay valid for an hour; the page asks for fresh ones on every load. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Upload limit in bytes, from ATTACHMENT_MAX_SIZE_MB (default 100). */
export function getAttachmentMaxBytes(): number {
  const raw = Number(process.env.ATTACHMENT_MAX_SIZE_MB);
  const mb =
    Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ATTACHMENT_MAX_SIZE_MB;
  return Math.floor(mb * 1024 * 1024);
}

/**
 * Makes sure the private bucket exists and allows the current size limit.
 * Checked once per server process, and again if the limit changes.
 */
let bucketReadyFor: number | null = null;
async function ensureBucket(maxBytes: number) {
  if (bucketReadyFor === maxBytes) return;
  const storage = getSupabaseAdmin().storage;
  const { data: bucket, error } = await storage.getBucket(ATTACHMENTS_BUCKET);

  if (error || !bucket) {
    const { error: createError } = await storage.createBucket(
      ATTACHMENTS_BUCKET,
      {
        public: false,
        fileSizeLimit: maxBytes,
      }
    );
    if (createError && !/already exists/i.test(createError.message)) {
      throw new ShelfError({
        cause: createError,
        message: "Couldn't set up storage for attachments.",
        label,
      });
    }
  } else if (bucket.public || (bucket.file_size_limit ?? 0) < maxBytes) {
    await storage.updateBucket(ATTACHMENTS_BUCKET, {
      public: false,
      fileSizeLimit: maxBytes,
    });
  }
  bucketReadyFor = maxBytes;
}

/** Throws a 404 unless the asset exists in this workspace. */
export async function assertAssetInOrganization({
  assetId,
  organizationId,
}: {
  assetId: string;
  organizationId: string;
}) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true },
  });
  if (!asset) {
    throw new ShelfError({
      cause: null,
      title: "Asset not found",
      message: "This asset doesn't exist, or isn't in your workspace.",
      status: 404,
      label,
      shouldBeCaptured: false,
    });
  }
}

/** Attachments for one asset, newest first, each with fresh signed links. */
export async function getAssetAttachments({
  assetId,
  organizationId,
}: {
  assetId: string;
  organizationId: string;
}) {
  const attachments = await db.assetAttachment.findMany({
    where: { assetId, organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      storagePath: true,
      createdAt: true,
    },
  });
  if (attachments.length === 0) return [];

  const bucket = getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET);
  return Promise.all(
    attachments.map(async ({ storagePath, ...attachment }) => {
      // Emails always download; PDFs and photos open in the browser
      const inline = attachment.contentType !== "message/rfc822";
      const [open, download] = await Promise.all([
        bucket.createSignedUrl(
          storagePath,
          SIGNED_URL_SECONDS,
          inline ? undefined : { download: attachment.fileName }
        ),
        bucket.createSignedUrl(storagePath, SIGNED_URL_SECONDS, {
          download: attachment.fileName,
        }),
      ]);
      if (open.error || download.error) {
        Logger.error(
          new ShelfError({
            cause: open.error ?? download.error,
            message: "Couldn't create a link for an attachment",
            additionalData: { attachmentId: attachment.id },
            label,
          })
        );
      }
      return {
        ...attachment,
        openUrl: open.data?.signedUrl ?? null,
        downloadUrl: download.data?.signedUrl ?? null,
      };
    })
  );
}

/**
 * Reads a multipart upload of one or more files (field "file"), checks each by
 * its contents, stores it, and records it against the asset. Files are handled
 * one at a time, so a bad file stops the upload with the earlier ones saved.
 */
/**
 * Checks a file by its contents, stores it, and records it. Used by uploads and
 * by email receipts. With `assetId: null` the file is staged (asset form) or,
 * with `emailReceiptId`, waiting in the email receipts Unmatched list.
 */
export async function storeAttachmentBytes({
  organizationId,
  assetId,
  userId,
  originalName,
  bytes,
  emailReceiptId = null,
}: {
  organizationId: string;
  assetId: string | null;
  userId: string | null;
  originalName: string;
  bytes: Uint8Array;
  emailReceiptId?: string | null;
}): Promise<SavedAttachment> {
  const detected = detectAttachmentType(bytes.subarray(0, 4096), originalName);
  if (!detected) {
    throw new ShelfError({
      cause: null,
      title: "File type not allowed",
      message: `"${originalName}" isn't a ${ATTACHMENT_TYPES_DESCRIPTION} file.`,
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  const maxBytes = getAttachmentMaxBytes();
  if (bytes.length > maxBytes) {
    throw new ShelfError({
      cause: null,
      title: "File too large",
      message: `"${originalName}" is over ${Math.round(
        maxBytes / (1024 * 1024)
      )} MB.`,
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  await ensureBucket(maxBytes);

  // Keep the given name, but make sure it ends in the real extension
  let fileName = originalName.slice(0, 200) || "file";
  if (
    !fileName.toLowerCase().endsWith(`.${detected.extension}`) &&
    !(detected.extension === "jpg" && /\.jpe?g$/i.test(fileName))
  ) {
    fileName = `${fileName}.${detected.extension}`;
  }

  const bucket = getSupabaseAdmin().storage.from(ATTACHMENTS_BUCKET);
  const attachmentId = createId();
  const storagePath = `${organizationId}/${
    assetId ?? (emailReceiptId ? "email" : "staged")
  }/${attachmentId}-${sanitizeFilename(fileName)}`;

  const { error } = await bucket.upload(storagePath, bytes, {
    contentType: detected.contentType,
    upsert: false,
  });
  if (error) {
    throw new ShelfError({
      cause: error,
      message: `Couldn't store "${originalName}". Please try again.`,
      additionalData: { assetId },
      label,
    });
  }
  try {
    await db.assetAttachment.create({
      data: {
        id: attachmentId,
        fileName,
        contentType: detected.contentType,
        size: bytes.length,
        storagePath,
        assetId,
        organizationId,
        uploadedById: userId,
        emailReceiptId,
      },
    });
  } catch (cause) {
    // Don't leave a stored file with no record pointing at it
    await bucket.remove([storagePath]);
    throw cause;
  }
  return {
    id: attachmentId,
    fileName,
    contentType: detected.contentType,
    size: bytes.length,
  };
}

export type SavedAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
};

/**
 * With `assetId: null` the files are staged: stored, but not on any asset
 * until `claimStagedAttachments` runs when the asset form is saved.
 */
export async function uploadAssetAttachments({
  request,
  assetId,
  organizationId,
  userId,
}: {
  request: Request;
  assetId: string | null;
  organizationId: string;
  userId: string;
}): Promise<SavedAttachment[]> {
  const maxBytes = getAttachmentMaxBytes();
  await ensureBucket(maxBytes);
  const saved: SavedAttachment[] = [];

  try {
    await parseFormData(request, { maxFileSize: maxBytes }, async (upload) => {
      if (upload.fieldName !== "file") return undefined;

      const originalName = (upload.name || "file").slice(0, 200);
      const bytes = new Uint8Array(await upload.arrayBuffer());
      if (bytes.length === 0) {
        throw new ShelfError({
          cause: null,
          title: "Empty file",
          message: `"${originalName}" is empty.`,
          status: 400,
          label,
          shouldBeCaptured: false,
        });
      }

      const stored = await storeAttachmentBytes({
        organizationId,
        assetId,
        userId,
        originalName,
        bytes,
      });
      saved.push(stored);
      return stored.id;
    });
  } catch (cause) {
    if (cause instanceof MaxFileSizeExceededError) {
      throw new ShelfError({
        cause,
        title: "File too large",
        message: `Files can be up to ${Math.round(
          maxBytes / (1024 * 1024)
        )} MB.${
          saved.length ? ` ${saved.length} file(s) before it were saved.` : ""
        }`,
        status: 400,
        label,
        shouldBeCaptured: false,
      });
    }
    if (isLikeShelfError(cause) && saved.length) {
      throw new ShelfError({
        cause,
        title: cause.title,
        message: `${cause.message} ${saved.length} file(s) before it were saved.`,
        status: cause.status,
        label,
        shouldBeCaptured: false,
      });
    }
    throw cause;
  }

  if (saved.length === 0) {
    throw new ShelfError({
      cause: null,
      title: "No file",
      message: "Choose a file to upload.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  }
  return saved;
}

/** Deletes one attachment: the stored file, then its record. */
export async function deleteAssetAttachment({
  attachmentId,
  assetId,
  organizationId,
}: {
  attachmentId: string;
  /** null deletes a staged file, one not yet on any asset */
  assetId: string | null;
  organizationId: string;
}) {
  const attachment = await db.assetAttachment.findFirst({
    where: { id: attachmentId, assetId, organizationId },
    select: { id: true, storagePath: true, fileName: true },
  });
  if (!attachment) {
    throw new ShelfError({
      cause: null,
      title: "Not found",
      message: "That attachment has already been deleted.",
      status: 404,
      label,
      shouldBeCaptured: false,
    });
  }

  const { error } = await getSupabaseAdmin()
    .storage.from(ATTACHMENTS_BUCKET)
    .remove([attachment.storagePath]);
  if (error) {
    throw new ShelfError({
      cause: error,
      message: `Couldn't delete "${attachment.fileName}". Please try again.`,
      additionalData: { attachmentId },
      label,
    });
  }
  await db.assetAttachment.deleteMany({
    where: { id: attachment.id, organizationId },
  });
  return attachment.fileName;
}

/**
 * Puts files staged in the asset form onto the asset that was just saved.
 * Only claims files that are still unattached and in the same workspace.
 */
export async function claimStagedAttachments({
  formData,
  assetId,
  organizationId,
}: {
  formData: FormData;
  assetId: string;
  organizationId: string;
}) {
  const ids = formData
    .getAll(STAGED_ATTACHMENTS_FIELD)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (ids.length === 0) return 0;
  const { count } = await db.assetAttachment.updateMany({
    where: { id: { in: ids }, organizationId, assetId: null },
    data: { assetId },
  });
  return count;
}

/** Unattached files younger than this are left alone: they may be staged in a form that's still open. */
const STAGED_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Removes files that belong to no asset: ones left behind by deleted assets
 * (when Shelf deletes an asset its attachment records lose their asset rather
 * than being deleted), and files staged in an asset form that was never
 * saved. Never throws: a failed tidy-up just gets retried next time.
 */
export async function cleanUpDeletedAssetAttachments(organizationId: string) {
  try {
    const orphans = await db.assetAttachment.findMany({
      where: {
        organizationId,
        assetId: null,
        // Files waiting in email receipts' Unmatched list stay until dealt with
        emailReceiptId: null,
        createdAt: { lt: new Date(Date.now() - STAGED_GRACE_MS) },
      },
      select: { id: true, storagePath: true },
      take: 100,
    });
    if (orphans.length === 0) return;

    const { error } = await getSupabaseAdmin()
      .storage.from(ATTACHMENTS_BUCKET)
      .remove(orphans.map((o) => o.storagePath));
    if (error) throw error;

    await db.assetAttachment.deleteMany({
      where: {
        id: { in: orphans.map((o) => o.id) },
        organizationId,
        assetId: null,
      },
    });
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Couldn't tidy up attachments from deleted assets",
        additionalData: { organizationId },
        label,
        shouldBeCaptured: false,
      })
    );
  }
}
